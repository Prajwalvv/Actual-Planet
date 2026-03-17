"""
EXPLORER DATASET — Loads agent trace JSONL files for training.

Trace format (from AgentTraceCollector):
{
  "traceId": "agent-explorer-abc12345",
  "agentType": "explorer",
  "timestamp": 1234567890,
  "observation": { ... },
  "candidates": [ ... ],
  "featureVectors": [ [48 floats], ... ],
  "selectedIndices": [0, 2, 5],
  "outcomes": [
    { "candidateIndex": 0, "yieldedEvidence": true, "evidenceCount": 3, ... },
    ...
  ]
}

The dataset produces:
- Pointwise examples: (feature_vector, label)  where label = 1 if useful, 0 if not
- Pairwise examples: (pos_features, neg_features) for ranking loss
"""

import json
import os
import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np
import torch
from torch.utils.data import Dataset


INPUT_DIM = 48


@dataclass
class CandidateExample:
    """One candidate with its feature vector and outcome label."""
    features: np.ndarray          # shape: (INPUT_DIM,)
    label: float                  # 1.0 = useful, 0.0 = wasted
    evidence_count: int           # how many evidence items it produced
    coverage_delta: float         # coverage improvement
    trace_id: str                 # parent trace ID
    candidate_index: int          # index in original candidate list


@dataclass
class TraceExamples:
    """All examples from one trace (one breed.run() call)."""
    trace_id: str
    timestamp: int
    candidates: list[CandidateExample] = field(default_factory=list)


def load_agent_traces(trace_dir: str, agent_type: str = 'explorer') -> list[TraceExamples]:
    """
    Load all agent trace files from the directory.
    Returns a list of TraceExamples, one per trace record.
    """
    trace_dir = Path(trace_dir)
    if not trace_dir.exists():
        print(f"[ExplorerDataset] Trace directory not found: {trace_dir}")
        return []

    all_traces: list[TraceExamples] = []
    files = sorted(trace_dir.glob('agent-traces-*.jsonl'))

    for filepath in files:
        with open(filepath, 'r') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if record.get('agentType') != agent_type:
                    continue

                trace = parse_trace_record(record)
                if trace and len(trace.candidates) > 0:
                    all_traces.append(trace)

    print(f"[ExplorerDataset] Loaded {len(all_traces)} traces from {len(files)} files")
    total_candidates = sum(len(t.candidates) for t in all_traces)
    positive = sum(1 for t in all_traces for c in t.candidates if c.label > 0.5)
    print(f"[ExplorerDataset] {total_candidates} candidates, {positive} positive ({100*positive/max(1,total_candidates):.1f}%)")
    return all_traces


def parse_trace_record(record: dict) -> Optional[TraceExamples]:
    """Parse one JSONL trace record into TraceExamples."""
    trace_id = record.get('traceId', '')
    timestamp = record.get('timestamp', 0)
    feature_vectors = record.get('featureVectors', [])
    outcomes = record.get('outcomes', [])

    if not feature_vectors:
        return None

    # Build outcome lookup: candidateIndex → outcome
    outcome_map: dict[int, dict] = {}
    for outcome in outcomes:
        idx = outcome.get('candidateIndex', -1)
        if idx >= 0:
            outcome_map[idx] = outcome

    candidates: list[CandidateExample] = []
    for i, fv in enumerate(feature_vectors):
        if len(fv) < INPUT_DIM:
            # Pad short feature vectors
            fv = fv + [0.0] * (INPUT_DIM - len(fv))
        elif len(fv) > INPUT_DIM:
            fv = fv[:INPUT_DIM]

        outcome = outcome_map.get(i, {})
        useful = outcome.get('yieldedEvidence', False)
        evidence_count = outcome.get('evidenceCount', 0)
        coverage_delta = outcome.get('coverageDelta', 0.0)

        candidates.append(CandidateExample(
            features=np.array(fv, dtype=np.float32),
            label=1.0 if useful else 0.0,
            evidence_count=evidence_count,
            coverage_delta=coverage_delta,
            trace_id=trace_id,
            candidate_index=i,
        ))

    return TraceExamples(
        trace_id=trace_id,
        timestamp=timestamp,
        candidates=candidates,
    )


# ─────────────────────────────────────────────
# PyTorch Datasets
# ─────────────────────────────────────────────

class ExplorerPointwiseDataset(Dataset):
    """
    Pointwise dataset: each item is (features, label).
    Used with BCE loss for direct score prediction.
    """

    def __init__(self, traces: list[TraceExamples]):
        self.examples: list[CandidateExample] = []
        for trace in traces:
            self.examples.extend(trace.candidates)

    def __len__(self):
        return len(self.examples)

    def __getitem__(self, idx):
        ex = self.examples[idx]
        return (
            torch.from_numpy(ex.features),
            torch.tensor(ex.label, dtype=torch.float32),
        )


class ExplorerPairwiseDataset(Dataset):
    """
    Pairwise dataset: each item is (pos_features, neg_features).
    Positive = yielded evidence, Negative = wasted.
    
    Pairs are sampled within the same trace (same decision context)
    for more meaningful comparisons.
    """

    def __init__(self, traces: list[TraceExamples], pairs_per_trace: int = 10):
        self.pairs: list[tuple[np.ndarray, np.ndarray]] = []

        for trace in traces:
            positives = [c for c in trace.candidates if c.label > 0.5]
            negatives = [c for c in trace.candidates if c.label <= 0.5]

            if not positives or not negatives:
                continue

            # Sample up to pairs_per_trace pairs
            n_pairs = min(pairs_per_trace, len(positives) * len(negatives))
            for _ in range(n_pairs):
                pos = random.choice(positives)
                neg = random.choice(negatives)
                self.pairs.append((pos.features, neg.features))

        print(f"[ExplorerPairwiseDataset] Created {len(self.pairs)} training pairs")

    def __len__(self):
        return len(self.pairs)

    def __getitem__(self, idx):
        pos_feat, neg_feat = self.pairs[idx]
        return (
            torch.from_numpy(pos_feat),
            torch.from_numpy(neg_feat),
        )


# ─────────────────────────────────────────────
# Normalization
# ─────────────────────────────────────────────

def compute_normalization(traces: list[TraceExamples]) -> dict:
    """
    Compute per-feature mean and std for z-score normalization.
    Returns a dict with 'means' and 'stds' lists.
    """
    all_features = []
    for trace in traces:
        for c in trace.candidates:
            all_features.append(c.features)

    if not all_features:
        return {'means': [0.0] * INPUT_DIM, 'stds': [1.0] * INPUT_DIM}

    features_array = np.stack(all_features)
    means = features_array.mean(axis=0).tolist()
    stds = features_array.std(axis=0).tolist()

    # Replace zero stds with 1.0 to avoid division by zero
    stds = [s if s > 1e-8 else 1.0 for s in stds]

    return {'means': means, 'stds': stds}


def summarize_traces(traces: list[TraceExamples]) -> dict:
    """Print summary statistics about the loaded traces."""
    total_candidates = sum(len(t.candidates) for t in traces)
    positive = sum(1 for t in traces for c in t.candidates if c.label > 0.5)
    negative = total_candidates - positive

    total_evidence = sum(c.evidence_count for t in traces for c in t.candidates)

    return {
        'traces': len(traces),
        'candidates': total_candidates,
        'positive': positive,
        'negative': negative,
        'positive_ratio': positive / max(1, total_candidates),
        'total_evidence': total_evidence,
    }
