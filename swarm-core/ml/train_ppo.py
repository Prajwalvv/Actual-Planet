"""
Recurrent PPO trainer for the GRU policy controller.

Requires:
- A pretrained imitation checkpoint (from train_imitation.py)
- Replay episodes built from heuristic traces (from replay_env.py)

Algorithm: PPO-Clip with GAE, recurrent policy (GRUCell), truncated BPTT.

Usage:
    python3 ml/train_ppo.py \
        --trace-dir runtime-artifacts/policy-traces \
        --checkpoint ml/artifacts/imitation-v1/imitation_checkpoint.pt \
        --output-dir ml/artifacts/ppo-v1
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, asdict
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.distributions import Categorical

from dataset import ACTION_MAP
from train_imitation import GruStepPolicy, ROLE_EMBEDDING_DIM, select_device
from replay_env import (
    ReplayEpisode,
    ReplayStep,
    ReplayEpisodeIterator,
    RolloutBuffer,
    compute_gae,
    load_episodes_from_dir,
    RewardConfig,
)


# ---------------------------------------------------------------------------
# PPO policy wrapper (adds value head on top of GruStepPolicy)
# ---------------------------------------------------------------------------

class PPOPolicy(nn.Module):
    """Wraps GruStepPolicy and adds a separate value head for PPO."""

    def __init__(self, base: GruStepPolicy) -> None:
        super().__init__()
        self.base = base
        self.value_head = nn.Linear(base.hidden_size, 1)

    def initial_hidden(self, batch_size: int, device: torch.device) -> torch.Tensor:
        return self.base.initial_hidden(batch_size, device)

    def forward(
        self,
        observation: torch.Tensor,
        hidden_state: torch.Tensor,
        last_role_index: torch.Tensor,
        action_mask: torch.Tensor | None = None,
    ) -> tuple[Categorical, torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Returns:
            action_dist: Categorical distribution over actions (masked)
            units_logits: raw logits for units head
            value: scalar state-value estimate
            next_hidden: updated GRU hidden state
        """
        action_logits, units_logits, _confidence, next_hidden = self.base.step(
            observation, hidden_state, last_role_index
        )

        if action_mask is not None:
            action_logits = action_logits.masked_fill(~action_mask, float("-inf"))

        action_dist = Categorical(logits=action_logits)
        value = self.value_head(next_hidden).squeeze(-1)

        return action_dist, units_logits, value, next_hidden


# ---------------------------------------------------------------------------
# PPO config
# ---------------------------------------------------------------------------

@dataclass
class PPOConfig:
    trace_dir: str
    checkpoint: str
    output_dir: str
    gamma: float = 0.99
    gae_lambda: float = 0.95
    clip_epsilon: float = 0.2
    entropy_coef: float = 0.01
    value_coef: float = 0.5
    learning_rate: float = 3e-4
    grad_clip: float = 1.0
    rollout_steps: int = 4096
    ppo_epochs: int = 4
    minibatch_size: int = 256
    truncated_bptt_len: int = 24
    total_updates: int = 100
    force_cpu: bool = False
    reward_config: RewardConfig = None  # type: ignore

    def __post_init__(self) -> None:
        if self.reward_config is None:
            self.reward_config = RewardConfig()


# ---------------------------------------------------------------------------
# Rollout collection
# ---------------------------------------------------------------------------

def collect_rollout(
    policy: PPOPolicy,
    iterator: ReplayEpisodeIterator,
    num_steps: int,
    device: torch.device,
) -> RolloutBuffer:
    """Collect a rollout of `num_steps` from the replay iterator using the current policy."""
    buf = RolloutBuffer()
    hidden = policy.initial_hidden(1, device)
    policy.eval()

    with torch.no_grad():
        for _ in range(num_steps):
            replay_step = iterator.step()

            obs_t = torch.tensor(replay_step.observation, dtype=torch.float32, device=device).unsqueeze(0)
            role_t = torch.tensor([replay_step.last_role_index], dtype=torch.long, device=device)
            mask_t = torch.tensor(replay_step.available_mask, dtype=torch.bool, device=device).unsqueeze(0)

            action_dist, _units_logits, value, next_hidden = policy(obs_t, hidden, role_t, mask_t)

            action = action_dist.sample()
            log_prob = action_dist.log_prob(action)

            buf.add(
                obs=replay_step.observation,
                action=replay_step.action_index,
                unit=replay_step.units_index,
                last_role=replay_step.last_role_index,
                reward=replay_step.reward,
                done=replay_step.done,
                log_prob=float(log_prob.cpu().item()),
                value=float(value.cpu().item()),
                mask=replay_step.available_mask,
            )

            if replay_step.done:
                hidden = policy.initial_hidden(1, device)
            else:
                hidden = next_hidden

    return buf


# ---------------------------------------------------------------------------
# PPO update
# ---------------------------------------------------------------------------

def ppo_update(
    policy: PPOPolicy,
    optimizer: optim.Optimizer,
    buf: RolloutBuffer,
    config: PPOConfig,
    device: torch.device,
) -> dict:
    """Run PPO-clip update on a collected rollout buffer."""
    rewards = np.array(buf.rewards, dtype=np.float32)
    values = np.array(buf.values, dtype=np.float32)
    dones = np.array(buf.dones, dtype=np.bool_)
    old_log_probs = np.array(buf.log_probs, dtype=np.float32)

    advantages, returns = compute_gae(rewards, values, dones, config.gamma, config.gae_lambda)
    advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

    obs_arr = np.array(buf.observations, dtype=np.float32)
    act_arr = np.array(buf.actions, dtype=np.int64)
    role_arr = np.array(buf.last_roles, dtype=np.int64)
    mask_arr = np.array(buf.masks, dtype=np.bool_)

    N = len(buf.observations)
    indices = np.arange(N)

    epoch_stats: list[dict] = []

    for ppo_epoch in range(config.ppo_epochs):
        np.random.shuffle(indices)
        epoch_policy_loss = 0.0
        epoch_value_loss = 0.0
        epoch_entropy = 0.0
        num_batches = 0

        for start in range(0, N, config.minibatch_size):
            end = min(start + config.minibatch_size, N)
            mb_idx = indices[start:end]
            mb_size = len(mb_idx)

            mb_obs = torch.tensor(obs_arr[mb_idx], dtype=torch.float32, device=device)
            mb_act = torch.tensor(act_arr[mb_idx], dtype=torch.long, device=device)
            mb_role = torch.tensor(role_arr[mb_idx], dtype=torch.long, device=device)
            mb_mask = torch.tensor(mask_arr[mb_idx], dtype=torch.bool, device=device)
            mb_adv = torch.tensor(advantages[mb_idx], dtype=torch.float32, device=device)
            mb_ret = torch.tensor(returns[mb_idx], dtype=torch.float32, device=device)
            mb_old_lp = torch.tensor(old_log_probs[mb_idx], dtype=torch.float32, device=device)

            hidden = policy.initial_hidden(mb_size, device)
            action_dist, _units_logits, value, _hidden = policy(mb_obs, hidden, mb_role, mb_mask)

            new_log_prob = action_dist.log_prob(mb_act)
            entropy = action_dist.entropy().mean()

            ratio = torch.exp(new_log_prob - mb_old_lp)
            surr1 = ratio * mb_adv
            surr2 = torch.clamp(ratio, 1.0 - config.clip_epsilon, 1.0 + config.clip_epsilon) * mb_adv
            policy_loss = -torch.min(surr1, surr2).mean()

            value_loss = nn.functional.mse_loss(value, mb_ret)

            loss = policy_loss + config.value_coef * value_loss - config.entropy_coef * entropy

            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            nn.utils.clip_grad_norm_(policy.parameters(), config.grad_clip)
            optimizer.step()

            epoch_policy_loss += float(policy_loss.item())
            epoch_value_loss += float(value_loss.item())
            epoch_entropy += float(entropy.item())
            num_batches += 1

        epoch_stats.append({
            "policy_loss": epoch_policy_loss / max(1, num_batches),
            "value_loss": epoch_value_loss / max(1, num_batches),
            "entropy": epoch_entropy / max(1, num_batches),
        })

    avg = {
        "policy_loss": np.mean([s["policy_loss"] for s in epoch_stats]),
        "value_loss": np.mean([s["value_loss"] for s in epoch_stats]),
        "entropy": np.mean([s["entropy"] for s in epoch_stats]),
        "avg_reward": float(rewards.mean()),
        "avg_return": float(returns.mean()),
        "avg_advantage": float(advantages.mean()),
    }
    return avg


# ---------------------------------------------------------------------------
# Main training loop
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="PPO fine-tuning of imitation GRU scheduler")
    parser.add_argument("--trace-dir", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--total-updates", type=int, default=100)
    parser.add_argument("--rollout-steps", type=int, default=4096)
    parser.add_argument("--ppo-epochs", type=int, default=4)
    parser.add_argument("--minibatch-size", type=int, default=256)
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument("--clip-epsilon", type=float, default=0.2)
    parser.add_argument("--entropy-coef", type=float, default=0.01)
    parser.add_argument("--value-coef", type=float, default=0.5)
    parser.add_argument("--gamma", type=float, default=0.99)
    parser.add_argument("--gae-lambda", type=float, default=0.95)
    parser.add_argument("--grad-clip", type=float, default=1.0)
    parser.add_argument("--force-cpu", action="store_true")
    args = parser.parse_args()

    config = PPOConfig(
        trace_dir=args.trace_dir,
        checkpoint=args.checkpoint,
        output_dir=args.output_dir,
        total_updates=args.total_updates,
        rollout_steps=args.rollout_steps,
        ppo_epochs=args.ppo_epochs,
        minibatch_size=args.minibatch_size,
        learning_rate=args.learning_rate,
        clip_epsilon=args.clip_epsilon,
        entropy_coef=args.entropy_coef,
        value_coef=args.value_coef,
        gamma=args.gamma,
        gae_lambda=args.gae_lambda,
        grad_clip=args.grad_clip,
        force_cpu=args.force_cpu,
    )

    # Load imitation checkpoint
    ckpt = torch.load(config.checkpoint, map_location="cpu")
    input_size = int(ckpt["input_size"])
    hidden_size = int(ckpt["hidden_size"])
    role_embedding_dim = int(ckpt.get("role_embedding_dim", ROLE_EMBEDDING_DIM))

    base_model = GruStepPolicy(
        input_size=input_size,
        hidden_size=hidden_size,
        action_count=len(ACTION_MAP),
        role_embedding_dim=role_embedding_dim,
    )
    base_model.load_state_dict(ckpt["model_state"])
    print(f"loaded imitation checkpoint: input_size={input_size}, hidden_size={hidden_size}, role_emb={role_embedding_dim}")

    device = select_device(config.force_cpu)
    policy = PPOPolicy(base_model).to(device)
    optimizer = optim.AdamW(policy.parameters(), lr=config.learning_rate)

    # Load replay episodes
    episodes = load_episodes_from_dir(config.trace_dir, config.reward_config)
    if not episodes:
        raise SystemExit("No replay episodes found. Collect traces first with SWARM_POLICY_TRACE=1.")
    print(f"loaded {len(episodes)} replay episodes, {sum(ep.length for ep in episodes)} total steps")

    iterator = ReplayEpisodeIterator(episodes)

    output_dir = Path(config.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    history: list[dict] = []

    for update in range(1, config.total_updates + 1):
        buf = collect_rollout(policy, iterator, config.rollout_steps, device)
        stats = ppo_update(policy, optimizer, buf, config, device)

        row = {"update": update, **stats}
        history.append(row)
        print(
            f"update={update:4d}  "
            f"policy_loss={stats['policy_loss']:.4f}  "
            f"value_loss={stats['value_loss']:.4f}  "
            f"entropy={stats['entropy']:.4f}  "
            f"avg_reward={stats['avg_reward']:.4f}"
        )

        if update % 10 == 0 or update == config.total_updates:
            _save_ppo_checkpoint(policy, input_size, hidden_size, role_embedding_dim, config, history, output_dir, tag=f"update_{update}")

    _save_ppo_checkpoint(policy, input_size, hidden_size, role_embedding_dim, config, history, output_dir, tag="final")

    with (output_dir / "ppo_training_summary.json").open("w", encoding="utf-8") as handle:
        json.dump({
            "total_updates": config.total_updates,
            "rollout_steps": config.rollout_steps,
            "episodes": len(episodes),
            "device": str(device),
            "history": history,
        }, handle, indent=2)

    print(f"done. artifacts in {config.output_dir}")


def _save_ppo_checkpoint(
    policy: PPOPolicy,
    input_size: int,
    hidden_size: int,
    role_embedding_dim: int,
    config: PPOConfig,
    history: list[dict],
    output_dir: Path,
    tag: str,
) -> None:
    checkpoint = {
        "model_state": policy.base.state_dict(),
        "value_head_state": policy.value_head.state_dict(),
        "input_size": input_size,
        "hidden_size": hidden_size,
        "role_embedding_dim": role_embedding_dim,
        "action_map": ACTION_MAP,
        "config": {k: v for k, v in vars(config).items() if k != "reward_config"},
        "history": history,
    }
    torch.save(checkpoint, output_dir / f"ppo_checkpoint_{tag}.pt")


if __name__ == "__main__":
    main()
