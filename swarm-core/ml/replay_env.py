"""
Replay environment for PPO training.

Replays recorded policy traces as episodes, allowing a new policy
to re-experience the same observation sequences and receive shaped
rewards based on the recorded outcomes.

Episode = one query trace.
State   = feature vector at each decision step.
Action  = (breed_index, units_index).
Reward  = shaped from evidence gain, coverage gain, wasted steps, etc.
"""
from __future__ import annotations

import json
import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator

import numpy as np

from dataset import ACTION_MAP, ACTION_TO_INDEX, load_traces, TraceExample, StepExample


# ---------------------------------------------------------------------------
# Reward shaping
# ---------------------------------------------------------------------------

@dataclass
class RewardConfig:
    evidence_gain_weight: float = 1.0
    coverage_gain_weight: float = 2.0
    corroboration_bonus: float = 0.5
    wasted_step_penalty: float = -0.3
    blocked_penalty: float = -0.2
    latency_penalty_per_sec: float = -0.05
    stop_explore_bonus: float = 0.1
    episode_completion_bonus: float = 0.5


def compute_step_reward(
    outcome: dict | None,
    action_index: int,
    config: RewardConfig = RewardConfig(),
) -> float:
    """Compute scalar reward for a single decision step from a recorded outcome."""
    if outcome is None:
        return 0.0

    reward = 0.0

    evidence_delta = float(outcome.get("evidenceDelta", 0))
    coverage_delta = float(outcome.get("coverageDelta", 0))
    usefulness_delta = float(outcome.get("usefulnessDelta", 0))
    blocked_delta = float(outcome.get("blockedDelta", 0))
    elapsed_ms = float(outcome.get("elapsedMs", 0))
    useful = bool(outcome.get("useful", False))
    added = int(outcome.get("added", 0))

    reward += config.evidence_gain_weight * evidence_delta
    reward += config.coverage_gain_weight * coverage_delta
    reward += config.corroboration_bonus * usefulness_delta

    if not useful and added == 0:
        reward += config.wasted_step_penalty

    if blocked_delta > 0:
        reward += config.blocked_penalty * blocked_delta

    reward += config.latency_penalty_per_sec * (elapsed_ms / 1000.0)

    if action_index == ACTION_TO_INDEX.get("stop_explore", -1):
        reward += config.stop_explore_bonus

    return reward


def compute_episode_terminal_reward(
    final_metrics: dict | None,
    config: RewardConfig = RewardConfig(),
) -> float:
    """Bonus reward at end of episode based on final query quality."""
    if final_metrics is None:
        return 0.0

    coverage = float(final_metrics.get("coverageRatio", 0))
    usefulness = float(final_metrics.get("usefulnessScore", 0))

    return config.episode_completion_bonus * (coverage + usefulness) / 2.0


# ---------------------------------------------------------------------------
# Replay episode
# ---------------------------------------------------------------------------

@dataclass
class ReplayStep:
    observation: np.ndarray          # feature vector
    action_index: int                # breed chosen
    units_index: int                 # 0 or 1
    last_role_index: int             # previous step's action index (0 at start)
    reward: float                    # shaped reward
    done: bool                       # True if last step in episode
    available_mask: np.ndarray       # boolean mask over action space


@dataclass
class ReplayEpisode:
    trace_id: str
    steps: list[ReplayStep] = field(default_factory=list)

    @property
    def length(self) -> int:
        return len(self.steps)

    def observations(self) -> np.ndarray:
        return np.array([s.observation for s in self.steps], dtype=np.float32)

    def actions(self) -> np.ndarray:
        return np.array([s.action_index for s in self.steps], dtype=np.int64)

    def units(self) -> np.ndarray:
        return np.array([s.units_index for s in self.steps], dtype=np.int64)

    def last_roles(self) -> np.ndarray:
        return np.array([s.last_role_index for s in self.steps], dtype=np.int64)

    def rewards(self) -> np.ndarray:
        return np.array([s.reward for s in self.steps], dtype=np.float32)

    def dones(self) -> np.ndarray:
        return np.array([s.done for s in self.steps], dtype=np.bool_)

    def masks(self) -> np.ndarray:
        return np.array([s.available_mask for s in self.steps], dtype=np.bool_)


# ---------------------------------------------------------------------------
# Build episodes from raw JSONL traces
# ---------------------------------------------------------------------------

def _build_available_mask(frame: dict) -> np.ndarray:
    """Build a boolean mask over ACTION_MAP from the frame's availableRoles."""
    mask = np.zeros(len(ACTION_MAP), dtype=np.bool_)
    available = frame.get("availableRoles") or []
    for role in available:
        idx = ACTION_TO_INDEX.get(role)
        if idx is not None:
            mask[idx] = True
    mask[ACTION_TO_INDEX["stop_explore"]] = True
    return mask


def build_episode_from_trace_raw(raw: dict, reward_config: RewardConfig = RewardConfig()) -> ReplayEpisode | None:
    """Build a ReplayEpisode directly from a raw JSONL trace dict."""
    frames = raw.get("frames") or []
    if not frames:
        return None

    steps: list[ReplayStep] = []
    last_role_index = 0

    for i, frame in enumerate(frames):
        features = frame.get("featureVector") or []
        if not features:
            continue

        executed = frame.get("executedAction") or frame.get("heuristicAction") or {}
        role_id = executed.get("roleId", "stop_explore")
        units = int(executed.get("units", 1) or 1)
        action_index = ACTION_TO_INDEX.get(role_id, ACTION_TO_INDEX["stop_explore"])
        units_index = 0 if units <= 1 else 1

        outcome = frame.get("outcome")
        reward = compute_step_reward(outcome, action_index, reward_config)

        is_last = i == len(frames) - 1
        if is_last:
            reward += compute_episode_terminal_reward(raw.get("finalMetrics"), reward_config)

        steps.append(ReplayStep(
            observation=np.array(features, dtype=np.float32),
            action_index=action_index,
            units_index=units_index,
            last_role_index=last_role_index,
            reward=reward,
            done=is_last,
            available_mask=_build_available_mask(frame),
        ))
        last_role_index = action_index

    if not steps:
        return None

    return ReplayEpisode(trace_id=raw.get("traceId", "unknown"), steps=steps)


def load_episodes_from_dir(
    trace_dir: str,
    reward_config: RewardConfig = RewardConfig(),
) -> list[ReplayEpisode]:
    """Load all JSONL traces from a directory and convert to replay episodes."""
    root = Path(trace_dir)
    episodes: list[ReplayEpisode] = []

    if not root.exists():
        return episodes

    for jsonl_path in sorted(root.glob("*.jsonl")):
        if not jsonl_path.is_file():
            continue
        with jsonl_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                raw = json.loads(line)
                episode = build_episode_from_trace_raw(raw, reward_config)
                if episode is not None:
                    episodes.append(episode)

    return episodes


# ---------------------------------------------------------------------------
# Rollout buffer for PPO
# ---------------------------------------------------------------------------

@dataclass
class RolloutBuffer:
    """Stores collected rollout data for PPO updates."""
    observations: list[np.ndarray] = field(default_factory=list)
    actions: list[int] = field(default_factory=list)
    units: list[int] = field(default_factory=list)
    last_roles: list[int] = field(default_factory=list)
    rewards: list[float] = field(default_factory=list)
    dones: list[bool] = field(default_factory=list)
    log_probs: list[float] = field(default_factory=list)
    values: list[float] = field(default_factory=list)
    masks: list[np.ndarray] = field(default_factory=list)

    def add(
        self,
        obs: np.ndarray,
        action: int,
        unit: int,
        last_role: int,
        reward: float,
        done: bool,
        log_prob: float,
        value: float,
        mask: np.ndarray,
    ) -> None:
        self.observations.append(obs)
        self.actions.append(action)
        self.units.append(unit)
        self.last_roles.append(last_role)
        self.rewards.append(reward)
        self.dones.append(done)
        self.log_probs.append(log_prob)
        self.values.append(value)
        self.masks.append(mask)

    @property
    def size(self) -> int:
        return len(self.observations)

    def clear(self) -> None:
        self.observations.clear()
        self.actions.clear()
        self.units.clear()
        self.last_roles.clear()
        self.rewards.clear()
        self.dones.clear()
        self.log_probs.clear()
        self.values.clear()
        self.masks.clear()


def compute_gae(
    rewards: np.ndarray,
    values: np.ndarray,
    dones: np.ndarray,
    gamma: float = 0.99,
    gae_lambda: float = 0.95,
    last_value: float = 0.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Compute Generalized Advantage Estimation and returns-to-go."""
    T = len(rewards)
    advantages = np.zeros(T, dtype=np.float32)
    gae = 0.0

    for t in reversed(range(T)):
        if t == T - 1:
            next_value = last_value
            next_non_terminal = 1.0 - float(dones[t])
        else:
            next_value = values[t + 1]
            next_non_terminal = 1.0 - float(dones[t])

        delta = rewards[t] + gamma * next_value * next_non_terminal - values[t]
        gae = delta + gamma * gae_lambda * next_non_terminal * gae
        advantages[t] = gae

    returns = advantages + values
    return advantages, returns


# ---------------------------------------------------------------------------
# Replay episode iterator (for PPO rollout collection)
# ---------------------------------------------------------------------------

class ReplayEpisodeIterator:
    """Iterates through replay episodes, yielding steps one at a time.
    Resets to a random episode when the current one finishes."""

    def __init__(self, episodes: list[ReplayEpisode], seed: int = 42) -> None:
        self.episodes = episodes
        self.rng = random.Random(seed)
        self._current: ReplayEpisode | None = None
        self._step_idx = 0

    def _pick_episode(self) -> ReplayEpisode:
        return self.rng.choice(self.episodes)

    def step(self) -> ReplayStep:
        if self._current is None or self._step_idx >= self._current.length:
            self._current = self._pick_episode()
            self._step_idx = 0

        step = self._current.steps[self._step_idx]
        self._step_idx += 1
        return step

    def collect_rollout(self, num_steps: int) -> list[ReplayStep]:
        return [self.step() for _ in range(num_steps)]


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Inspect replay episodes from policy traces")
    parser.add_argument("--trace-dir", required=True)
    args = parser.parse_args()

    episodes = load_episodes_from_dir(args.trace_dir)
    total_steps = sum(ep.length for ep in episodes)
    total_reward = sum(float(np.sum(ep.rewards())) for ep in episodes)

    print(json.dumps({
        "episode_count": len(episodes),
        "total_steps": total_steps,
        "avg_episode_length": total_steps / max(1, len(episodes)),
        "total_reward": total_reward,
        "avg_reward_per_episode": total_reward / max(1, len(episodes)),
        "action_map": ACTION_MAP,
    }, indent=2))


if __name__ == "__main__":
    main()
