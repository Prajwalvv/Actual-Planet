from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
import torch.nn as nn

from dataset import ACTION_MAP

DEFAULT_ROLE_EMBEDDING_DIM = 16


class GruStepExport(nn.Module):
    def __init__(self, input_size: int, hidden_size: int, action_count: int, role_embedding_dim: int = DEFAULT_ROLE_EMBEDDING_DIM) -> None:
        super().__init__()
        self.hidden_size = hidden_size
        self.role_embedding = nn.Embedding(action_count, role_embedding_dim)
        self.gru_cell = nn.GRUCell(input_size + role_embedding_dim, hidden_size)
        self.action_head = nn.Linear(hidden_size, action_count)
        self.units_head = nn.Linear(hidden_size, 2)
        self.confidence_head = nn.Sequential(
            nn.Linear(hidden_size, 1),
            nn.Sigmoid(),
        )

    def forward(self, observation: torch.Tensor, hidden_state: torch.Tensor, last_role_index: torch.Tensor):
        role_emb = self.role_embedding(last_role_index)
        combined = torch.cat([observation, role_emb], dim=-1)
        next_hidden = self.gru_cell(combined, hidden_state)
        action_logits = self.action_head(next_hidden)
        units_logits = self.units_head(next_hidden)
        confidence = self.confidence_head(next_hidden)
        return action_logits, units_logits, confidence, next_hidden


def main() -> None:
    parser = argparse.ArgumentParser(description="Export imitation GRU checkpoint to ONNX")
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    checkpoint = torch.load(args.checkpoint, map_location="cpu")
    input_size = int(checkpoint["input_size"])
    hidden_size = int(checkpoint["hidden_size"])
    role_embedding_dim = int(checkpoint.get("role_embedding_dim", DEFAULT_ROLE_EMBEDDING_DIM))

    model = GruStepExport(
        input_size=input_size,
        hidden_size=hidden_size,
        action_count=len(ACTION_MAP),
        role_embedding_dim=role_embedding_dim,
    )
    model.load_state_dict(checkpoint["model_state"])
    model.eval()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = output_dir / "gru_scheduler.onnx"

    observation = torch.zeros(1, input_size, dtype=torch.float32)
    hidden_state = torch.zeros(1, hidden_size, dtype=torch.float32)
    last_role_index = torch.zeros(1, dtype=torch.long)

    torch.onnx.export(
        model,
        (observation, hidden_state, last_role_index),
        onnx_path.as_posix(),
        input_names=["observation", "hidden_state", "last_role_index"],
        output_names=["action_logits", "units_logits", "confidence", "next_hidden_state"],
        dynamic_axes={
            "observation": {0: "batch"},
            "hidden_state": {0: "batch"},
            "last_role_index": {0: "batch"},
            "action_logits": {0: "batch"},
            "units_logits": {0: "batch"},
            "confidence": {0: "batch"},
            "next_hidden_state": {0: "batch"},
        },
        opset_version=17,
    )

    manifest = {
        "enabled": True,
        "version": "imitation-v1",
        "modelFile": "gru_scheduler.onnx",
        "inputName": "observation",
        "hiddenInputName": "hidden_state",
        "hiddenOutputName": "next_hidden_state",
        "roleInputName": "last_role_index",
        "actionOutputName": "action_logits",
        "unitsOutputName": "units_logits",
        "confidenceOutputName": "confidence",
        "roleEmbeddingDim": role_embedding_dim,
        "hiddenSize": hidden_size,
    }
    with (output_dir / "manifest.json").open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
    with (output_dir / "action-map.json").open("w", encoding="utf-8") as handle:
        json.dump({"actions": ACTION_MAP}, handle, indent=2)


if __name__ == "__main__":
    main()
