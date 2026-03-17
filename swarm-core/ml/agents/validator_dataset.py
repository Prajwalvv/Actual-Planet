"""
VALIDATOR DATASET LOADER

Loads agent trace JSONL files and creates PyTorch datasets for training.
Supports both pointwise (BCE) and pairwise (ranking) training.
"""

import json
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
import torch
from torch.utils.data import Dataset
import numpy as np


class ValidatorTraceLoader:
    """Loads validator agent traces from JSONL files."""

    def __init__(self, trace_dir: Path):
        self.trace_dir = Path(trace_dir)

    def load_traces(self, agent_type: str = "validator") -> List[Dict[str, Any]]:
        """Load all traces for the given agent type."""
        traces = []
        trace_files = sorted(self.trace_dir.glob(f"{agent_type}_*.jsonl"))
        trace_files.extend(sorted(self.trace_dir.glob("agent-traces-*.jsonl")))

        for trace_file in trace_files:
            with open(trace_file, "r") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        record = json.loads(line)
                        if record.get("agentType") and record.get("agentType") != agent_type:
                            continue

                        # Backward-compatible legacy schema
                        if "chosenIndex" in record and "candidates" in record:
                            traces.append(record)
                            continue

                        # Unified trace schema -> legacy training schema
                        feature_vectors = record.get("featureVectors", [])
                        selected = record.get("selectedIndices", [])
                        if not feature_vectors or not selected:
                            continue

                        candidates = [{"features": fv} for fv in feature_vectors]
                        traces.append({
                            "traceId": record.get("traceId"),
                            "timestamp": record.get("timestamp"),
                            "agentType": record.get("agentType", agent_type),
                            "observation": record.get("observation", {}),
                            "candidates": candidates,
                            "chosenIndex": selected[0],
                        })
                    except json.JSONDecodeError as e:
                        print(f"Warning: Failed to parse line in {trace_file}: {e}")
                        continue

        print(f"Loaded {len(traces)} traces from {self.trace_dir}")
        return traces


class ValidatorPointwiseDataset(Dataset):
    """
    Pointwise dataset for validator agent.
    Each sample is (features, label) where label is 1 if chosen, 0 otherwise.
    """

    def __init__(self, traces: List[Dict[str, Any]]):
        self.samples = []
        self._build_samples(traces)

    def _build_samples(self, traces: List[Dict[str, Any]]):
        """Convert traces into (features, label) pairs."""
        for trace in traces:
            candidates = trace.get("candidates", [])
            chosen_idx = trace.get("chosenIndex")

            if chosen_idx is None or chosen_idx < 0:
                continue

            for i, candidate in enumerate(candidates):
                features = candidate.get("features")
                if features is None or len(features) != 36:
                    continue

                label = 1.0 if i == chosen_idx else 0.0
                self.samples.append((np.array(features, dtype=np.float32), label))

        print(f"Built {len(self.samples)} pointwise samples")

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        features, label = self.samples[idx]
        return torch.from_numpy(features), torch.tensor(label, dtype=torch.float32)


class ValidatorPairwiseDataset(Dataset):
    """
    Pairwise ranking dataset for validator agent.
    Each sample is (pos_features, neg_features) where pos was ranked higher.
    """

    def __init__(self, traces: List[Dict[str, Any]], max_pairs_per_trace: int = 10):
        self.samples = []
        self.max_pairs_per_trace = max_pairs_per_trace
        self._build_samples(traces)

    def _build_samples(self, traces: List[Dict[str, Any]]):
        """Convert traces into (positive, negative) feature pairs."""
        for trace in traces:
            candidates = trace.get("candidates", [])
            chosen_idx = trace.get("chosenIndex")

            if chosen_idx is None or chosen_idx < 0:
                continue

            chosen_features = candidates[chosen_idx].get("features")
            if chosen_features is None or len(chosen_features) != 36:
                continue

            # Create pairs: (chosen, not_chosen)
            pairs_added = 0
            for i, candidate in enumerate(candidates):
                if i == chosen_idx:
                    continue

                neg_features = candidate.get("features")
                if neg_features is None or len(neg_features) != 36:
                    continue

                self.samples.append((
                    np.array(chosen_features, dtype=np.float32),
                    np.array(neg_features, dtype=np.float32),
                ))

                pairs_added += 1
                if pairs_added >= self.max_pairs_per_trace:
                    break

        print(f"Built {len(self.samples)} pairwise samples")

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        pos_features, neg_features = self.samples[idx]
        return torch.from_numpy(pos_features), torch.from_numpy(neg_features)


def compute_feature_stats(traces: List[Dict[str, Any]]) -> Dict[str, np.ndarray]:
    """
    Compute mean and std for feature normalization.
    Returns dict with 'mean' and 'std' arrays of shape [36].
    """
    all_features = []

    for trace in traces:
        candidates = trace.get("candidates", [])
        for candidate in candidates:
            features = candidate.get("features")
            if features is not None and len(features) == 36:
                all_features.append(features)

    if not all_features:
        print("Warning: No valid features found for normalization")
        return {"mean": np.zeros(36), "std": np.ones(36)}

    features_array = np.array(all_features, dtype=np.float32)
    mean = np.mean(features_array, axis=0)
    std = np.std(features_array, axis=0)

    # Avoid division by zero
    std = np.where(std < 1e-6, 1.0, std)

    print(f"Computed feature stats from {len(all_features)} samples")
    print(f"Mean range: [{mean.min():.3f}, {mean.max():.3f}]")
    print(f"Std range: [{std.min():.3f}, {std.max():.3f}]")

    return {"mean": mean, "std": std}


def split_traces(
    traces: List[Dict[str, Any]],
    train_ratio: float = 0.8,
    seed: int = 42,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Split traces into train and validation sets."""
    np.random.seed(seed)
    indices = np.random.permutation(len(traces))
    split_idx = int(len(traces) * train_ratio)

    train_indices = indices[:split_idx]
    val_indices = indices[split_idx:]

    train_traces = [traces[i] for i in train_indices]
    val_traces = [traces[i] for i in val_indices]

    print(f"Split: {len(train_traces)} train, {len(val_traces)} val")
    return train_traces, val_traces


if __name__ == "__main__":
    # Test dataset loading
    trace_dir = Path("../../traces/agents")
    if not trace_dir.exists():
        print(f"Trace directory not found: {trace_dir}")
        exit(1)

    loader = ValidatorTraceLoader(trace_dir)
    traces = loader.load_traces("validator")

    if traces:
        train_traces, val_traces = split_traces(traces)

        # Test pointwise dataset
        pointwise_ds = ValidatorPointwiseDataset(train_traces)
        if len(pointwise_ds) > 0:
            features, label = pointwise_ds[0]
            print(f"\nPointwise sample:")
            print(f"  Features shape: {features.shape}")
            print(f"  Label: {label.item()}")

        # Test pairwise dataset
        pairwise_ds = ValidatorPairwiseDataset(train_traces)
        if len(pairwise_ds) > 0:
            pos_feat, neg_feat = pairwise_ds[0]
            print(f"\nPairwise sample:")
            print(f"  Positive features shape: {pos_feat.shape}")
            print(f"  Negative features shape: {neg_feat.shape}")

        # Test feature stats
        stats = compute_feature_stats(traces)
        print(f"\nFeature normalization stats computed")
    else:
        print("No traces found")
