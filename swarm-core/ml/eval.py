from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch

from dataset import ACTION_MAP, load_traces
from train_imitation import GruStepPolicy


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate imitation GRU checkpoint")
    parser.add_argument("--trace-dir", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--target-source", choices=["heuristic", "executed"], default="heuristic")
    args = parser.parse_args()

    traces = load_traces(args.trace_dir, args.target_source)
    if not traces:
        raise SystemExit("No traces found for evaluation.")

    checkpoint = torch.load(args.checkpoint, map_location="cpu")
    role_embedding_dim = int(checkpoint.get("role_embedding_dim", 16))
    model = GruStepPolicy(
        input_size=int(checkpoint["input_size"]),
        hidden_size=int(checkpoint["hidden_size"]),
        action_count=len(ACTION_MAP),
        role_embedding_dim=role_embedding_dim,
    )
    model.load_state_dict(checkpoint["model_state"])
    model.eval()

    total = 0
    correct = 0

    with torch.no_grad():
        for trace in traces:
            hidden = model.initial_hidden(1, torch.device("cpu"))
            last_role = torch.zeros(1, dtype=torch.long)
            for step in trace.steps:
                obs = torch.tensor([step.features], dtype=torch.float32)
                action_logits, _, _, hidden = model.step(obs, hidden, last_role)
                predicted = int(torch.argmax(action_logits, dim=-1).item())
                total += 1
                correct += int(predicted == step.action_index)
                last_role = torch.tensor([step.action_index], dtype=torch.long)

    result = {
        "trace_count": len(traces),
        "step_count": total,
        "action_accuracy": correct / max(1, total),
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
