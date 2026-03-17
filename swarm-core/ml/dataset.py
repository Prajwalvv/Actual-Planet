from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

ACTION_MAP = [
    "link_pathfinder",
    "news_reader",
    "forum_thread_reader",
    "docs_reader",
    "paper_abstract_reader",
    "stop_explore",
]
ACTION_TO_INDEX = {name: idx for idx, name in enumerate(ACTION_MAP)}


@dataclass
class StepExample:
    features: list[float]
    action_index: int
    units_index: int


@dataclass
class TraceExample:
    trace_id: str
    steps: list[StepExample]


def _iter_jsonl_files(trace_dir: Path) -> Iterable[Path]:
    for path in sorted(trace_dir.glob("*.jsonl")):
        if path.is_file():
            yield path


def _target_action(frame: dict, target_source: str) -> tuple[str, int]:
    source = frame.get(f"{target_source}Action") or frame.get("executedAction") or {}
    role_id = source.get("roleId", "stop_explore")
    units = int(source.get("units", 1) or 1)
    if role_id not in ACTION_TO_INDEX:
        role_id = "stop_explore"
    units_index = 0 if units <= 1 else 1
    return role_id, units_index


def load_traces(trace_dir: str, target_source: str = "heuristic") -> list[TraceExample]:
    root = Path(trace_dir)
    traces: list[TraceExample] = []

    if not root.exists():
      return traces

    for jsonl_path in _iter_jsonl_files(root):
        with jsonl_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                raw = json.loads(line)
                frames = raw.get("frames") or []
                steps: list[StepExample] = []
                for frame in frames:
                    features = frame.get("featureVector") or []
                    if not features:
                        continue
                    role_id, units_index = _target_action(frame, target_source)
                    steps.append(
                        StepExample(
                            features=[float(x) for x in features],
                            action_index=ACTION_TO_INDEX[role_id],
                            units_index=units_index,
                        )
                    )

                if steps:
                    traces.append(TraceExample(trace_id=raw.get("traceId", "unknown"), steps=steps))

    return traces


def summarize_traces(traces: list[TraceExample]) -> dict:
    steps = sum(len(trace.steps) for trace in traces)
    feature_size = len(traces[0].steps[0].features) if traces else 0
    return {
        "trace_count": len(traces),
        "step_count": steps,
        "feature_size": feature_size,
        "action_map": ACTION_MAP,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect GRU policy traces")
    parser.add_argument("--trace-dir", required=True)
    parser.add_argument("--target-source", default="heuristic", choices=["heuristic", "executed"])
    args = parser.parse_args()

    traces = load_traces(args.trace_dir, args.target_source)
    print(json.dumps(summarize_traces(traces), indent=2))


if __name__ == "__main__":
    main()
