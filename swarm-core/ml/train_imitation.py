from __future__ import annotations

import argparse
import json
import random
from dataclasses import asdict, dataclass
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim

from dataset import ACTION_MAP, TraceExample, load_traces, summarize_traces

ROLE_EMBEDDING_DIM = 16
NUM_ROLES = len(ACTION_MAP)  # includes stop_explore


def select_device(force_cpu: bool = False) -> torch.device:
    if force_cpu:
        return torch.device("cpu")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


class GruStepPolicy(nn.Module):
    def __init__(
        self,
        input_size: int,
        hidden_size: int,
        action_count: int,
        role_embedding_dim: int = ROLE_EMBEDDING_DIM,
    ) -> None:
        super().__init__()
        self.hidden_size = hidden_size
        self.role_embedding_dim = role_embedding_dim
        self.role_embedding = nn.Embedding(action_count, role_embedding_dim)
        self.gru_cell = nn.GRUCell(input_size + role_embedding_dim, hidden_size)
        self.action_head = nn.Linear(hidden_size, action_count)
        self.units_head = nn.Linear(hidden_size, 2)
        self.confidence_head = nn.Sequential(
            nn.Linear(hidden_size, 1),
            nn.Sigmoid(),
        )

    def initial_hidden(self, batch_size: int, device: torch.device) -> torch.Tensor:
        return torch.zeros(batch_size, self.hidden_size, device=device)

    def step(
        self,
        observation: torch.Tensor,
        hidden_state: torch.Tensor,
        last_role_index: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        role_emb = self.role_embedding(last_role_index)
        combined = torch.cat([observation, role_emb], dim=-1)
        next_hidden = self.gru_cell(combined, hidden_state)
        return (
            self.action_head(next_hidden),
            self.units_head(next_hidden),
            self.confidence_head(next_hidden).squeeze(-1),
            next_hidden,
        )


@dataclass
class TrainConfig:
    trace_dir: str
    output_dir: str
    epochs: int
    hidden_size: int
    role_embedding_dim: int
    learning_rate: float
    grad_clip: float
    val_split: float
    patience: int
    target_source: str
    force_cpu: bool


def split_traces(
    traces: list[TraceExample], val_ratio: float, seed: int = 42
) -> tuple[list[TraceExample], list[TraceExample]]:
    if val_ratio <= 0 or len(traces) < 4:
        return traces, []
    shuffled = list(traces)
    random.Random(seed).shuffle(shuffled)
    split_idx = max(1, int(len(shuffled) * (1.0 - val_ratio)))
    return shuffled[:split_idx], shuffled[split_idx:]


def run_epoch(
    model: GruStepPolicy,
    traces: list[TraceExample],
    optimizer: optim.Optimizer | None,
    device: torch.device,
    grad_clip: float = 1.0,
) -> tuple[float, float]:
    action_loss_fn = nn.CrossEntropyLoss()
    units_loss_fn = nn.CrossEntropyLoss()
    total_loss = 0.0
    total_steps = 0
    correct = 0
    no_grad = optimizer is None

    if no_grad:
        model.eval()
    else:
        model.train()

    ctx = torch.no_grad() if no_grad else torch.enable_grad()
    with ctx:
        for trace in traces:
            hidden = model.initial_hidden(1, device)
            trace_loss = None
            last_role = torch.zeros(1, dtype=torch.long, device=device)

            for step in trace.steps:
                obs = torch.tensor([step.features], dtype=torch.float32, device=device)
                action_logits, units_logits, confidence, hidden = model.step(obs, hidden, last_role)
                action_target = torch.tensor([step.action_index], dtype=torch.long, device=device)
                units_target = torch.tensor([step.units_index], dtype=torch.long, device=device)
                confidence_target = torch.tensor([1.0], dtype=torch.float32, device=device)

                loss = action_loss_fn(action_logits, action_target)
                loss = loss + 0.35 * units_loss_fn(units_logits, units_target)
                loss = loss + 0.1 * torch.mean((confidence - confidence_target) ** 2)

                trace_loss = loss if trace_loss is None else trace_loss + loss
                total_loss += float(loss.detach().cpu().item())
                total_steps += 1
                predicted = int(torch.argmax(action_logits, dim=-1).item())
                if predicted == step.action_index:
                    correct += 1
                last_role = action_target.detach()

            if optimizer and trace_loss is not None:
                optimizer.zero_grad(set_to_none=True)
                trace_loss.backward()
                nn.utils.clip_grad_norm_(model.parameters(), grad_clip)
                optimizer.step()

    avg_loss = total_loss / max(1, total_steps)
    accuracy = correct / max(1, total_steps)
    return avg_loss, accuracy


def main() -> None:
    parser = argparse.ArgumentParser(description="Train imitation GRU scheduler from policy traces")
    parser.add_argument("--trace-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--hidden-size", type=int, default=96)
    parser.add_argument("--role-embedding-dim", type=int, default=ROLE_EMBEDDING_DIM)
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument("--grad-clip", type=float, default=1.0)
    parser.add_argument("--val-split", type=float, default=0.15)
    parser.add_argument("--patience", type=int, default=8)
    parser.add_argument("--target-source", choices=["heuristic", "executed"], default="heuristic")
    parser.add_argument("--force-cpu", action="store_true")
    args = parser.parse_args()

    config = TrainConfig(
        trace_dir=args.trace_dir,
        output_dir=args.output_dir,
        epochs=args.epochs,
        hidden_size=args.hidden_size,
        role_embedding_dim=args.role_embedding_dim,
        learning_rate=args.learning_rate,
        grad_clip=args.grad_clip,
        val_split=args.val_split,
        patience=args.patience,
        target_source=args.target_source,
        force_cpu=args.force_cpu,
    )

    traces = load_traces(config.trace_dir, config.target_source)
    summary = summarize_traces(traces)
    if not traces:
        raise SystemExit("No trace data found. Enable SWARM_POLICY_TRACE and collect heuristic runs first.")

    train_traces, val_traces = split_traces(traces, config.val_split)
    print(f"dataset: {len(traces)} traces, train={len(train_traces)}, val={len(val_traces)}")

    device = select_device(config.force_cpu)
    input_size = summary["feature_size"]
    model = GruStepPolicy(
        input_size=input_size,
        hidden_size=config.hidden_size,
        action_count=len(ACTION_MAP),
        role_embedding_dim=config.role_embedding_dim,
    ).to(device)
    optimizer = optim.AdamW(model.parameters(), lr=config.learning_rate)

    Path(config.output_dir).mkdir(parents=True, exist_ok=True)

    history: list[dict] = []
    best_val_loss = float("inf")
    best_epoch = 0
    stale_epochs = 0

    for epoch in range(1, config.epochs + 1):
        train_loss, train_acc = run_epoch(model, train_traces, optimizer, device, config.grad_clip)
        row = {"epoch": epoch, "train_loss": train_loss, "train_acc": train_acc}

        if val_traces:
            val_loss, val_acc = run_epoch(model, val_traces, None, device)
            row["val_loss"] = val_loss
            row["val_acc"] = val_acc
            print(f"epoch={epoch:3d}  train_loss={train_loss:.4f}  train_acc={train_acc:.4f}  val_loss={val_loss:.4f}  val_acc={val_acc:.4f}")

            if val_loss < best_val_loss:
                best_val_loss = val_loss
                best_epoch = epoch
                stale_epochs = 0
                _save_checkpoint(model, input_size, config, history + [row], Path(config.output_dir), tag="best")
            else:
                stale_epochs += 1
        else:
            print(f"epoch={epoch:3d}  train_loss={train_loss:.4f}  train_acc={train_acc:.4f}")

        history.append(row)

        if config.patience > 0 and stale_epochs >= config.patience:
            print(f"early stopping at epoch {epoch} (best={best_epoch}, val_loss={best_val_loss:.4f})")
            break

    _save_checkpoint(model, input_size, config, history, Path(config.output_dir), tag="final")

    with (Path(config.output_dir) / "training_summary.json").open("w", encoding="utf-8") as handle:
        json.dump(
            {
                "dataset": summary,
                "device": str(device),
                "train_traces": len(train_traces),
                "val_traces": len(val_traces),
                "best_epoch": best_epoch,
                "best_val_loss": best_val_loss if val_traces else None,
                "role_embedding_dim": config.role_embedding_dim,
                "history": history,
            },
            handle,
            indent=2,
        )
    print(f"done. artifacts in {config.output_dir}")


def _save_checkpoint(
    model: GruStepPolicy,
    input_size: int,
    config: TrainConfig,
    history: list[dict],
    output_dir: Path,
    tag: str,
) -> None:
    checkpoint = {
        "model_state": model.state_dict(),
        "input_size": input_size,
        "hidden_size": config.hidden_size,
        "role_embedding_dim": config.role_embedding_dim,
        "action_map": ACTION_MAP,
        "config": asdict(config),
        "history": history,
    }
    filename = f"imitation_checkpoint_{tag}.pt" if tag != "final" else "imitation_checkpoint.pt"
    torch.save(checkpoint, output_dir / filename)


if __name__ == "__main__":
    main()
