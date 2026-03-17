"""
VALIDATOR AGENT TRAINING SCRIPT

Trains the validator agent model using imitation learning from agent traces.
Supports both pairwise ranking loss and pointwise BCE loss.

Usage:
    python train_validator.py --trace-dir ../../traces/agents --epochs 50
"""

import argparse
import json
from pathlib import Path
from typing import Dict, Any, Optional
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
import numpy as np

from validator_model import ValidatorPointwiseModel, ValidatorPairwiseWrapper, count_parameters
from validator_dataset import (
    ValidatorTraceLoader,
    ValidatorPointwiseDataset,
    ValidatorPairwiseDataset,
    compute_feature_stats,
    split_traces,
)


class EarlyStopping:
    """Early stopping to prevent overfitting."""

    def __init__(self, patience: int = 5, min_delta: float = 1e-4):
        self.patience = patience
        self.min_delta = min_delta
        self.counter = 0
        self.best_loss = None
        self.should_stop = False

    def __call__(self, val_loss: float) -> bool:
        if self.best_loss is None:
            self.best_loss = val_loss
            return False

        if val_loss < self.best_loss - self.min_delta:
            self.best_loss = val_loss
            self.counter = 0
        else:
            self.counter += 1
            if self.counter >= self.patience:
                self.should_stop = True

        return self.should_stop


def train_pairwise_epoch(
    model: ValidatorPairwiseWrapper,
    dataloader: DataLoader,
    optimizer: optim.Optimizer,
    device: torch.device,
) -> float:
    """Train one epoch with pairwise ranking loss."""
    model.train()
    total_loss = 0.0
    criterion = nn.BCEWithLogitsLoss()

    for pos_features, neg_features in dataloader:
        pos_features = pos_features.to(device)
        neg_features = neg_features.to(device)

        optimizer.zero_grad()
        margin = model(pos_features, neg_features)
        
        # Target: positive should be ranked higher (margin > 0)
        target = torch.ones_like(margin)
        loss = criterion(margin, target)

        loss.backward()
        optimizer.step()

        total_loss += loss.item()

    return total_loss / len(dataloader)


def train_pointwise_epoch(
    model: ValidatorPointwiseModel,
    dataloader: DataLoader,
    optimizer: optim.Optimizer,
    device: torch.device,
    pos_weight: Optional[torch.Tensor] = None,
) -> float:
    """Train one epoch with pointwise BCE loss."""
    model.train()
    total_loss = 0.0
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight) if pos_weight is not None else nn.BCELoss()

    for features, labels in dataloader:
        features = features.to(device)
        labels = labels.to(device).unsqueeze(1)

        optimizer.zero_grad()
        scores = model(features)
        loss = criterion(scores, labels)

        loss.backward()
        optimizer.step()

        total_loss += loss.item()

    return total_loss / len(dataloader)


def validate_pairwise(
    model: ValidatorPairwiseWrapper,
    dataloader: DataLoader,
    device: torch.device,
) -> Dict[str, float]:
    """Validate with pairwise ranking loss."""
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0
    criterion = nn.BCEWithLogitsLoss()

    with torch.no_grad():
        for pos_features, neg_features in dataloader:
            pos_features = pos_features.to(device)
            neg_features = neg_features.to(device)

            margin = model(pos_features, neg_features)
            target = torch.ones_like(margin)
            loss = criterion(margin, target)

            total_loss += loss.item()
            
            # Accuracy: how often is margin > 0?
            correct += (margin > 0).sum().item()
            total += margin.size(0)

    return {
        "loss": total_loss / len(dataloader),
        "accuracy": correct / total if total > 0 else 0.0,
    }


def validate_pointwise(
    model: ValidatorPointwiseModel,
    dataloader: DataLoader,
    device: torch.device,
) -> Dict[str, float]:
    """Validate with pointwise BCE loss."""
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0
    criterion = nn.BCELoss()

    with torch.no_grad():
        for features, labels in dataloader:
            features = features.to(device)
            labels = labels.to(device).unsqueeze(1)

            scores = model(features)
            loss = criterion(scores, labels)

            total_loss += loss.item()
            
            # Accuracy: threshold at 0.5
            predictions = (scores > 0.5).float()
            correct += (predictions == labels).sum().item()
            total += labels.size(0)

    return {
        "loss": total_loss / len(dataloader),
        "accuracy": correct / total if total > 0 else 0.0,
    }


def train_validator(
    trace_dir: Path,
    output_dir: Path,
    mode: str = "pairwise",
    epochs: int = 50,
    batch_size: int = 32,
    lr: float = 1e-3,
    patience: int = 5,
    device: Optional[torch.device] = None,
) -> ValidatorPointwiseModel:
    """Main training function."""
    
    if device is None:
        if torch.backends.mps.is_available():
            device = torch.device("mps")
        elif torch.cuda.is_available():
            device = torch.device("cuda")
        else:
            device = torch.device("cpu")
    
    print(f"Using device: {device}")
    
    # Load traces
    loader = ValidatorTraceLoader(trace_dir)
    traces = loader.load_traces("validator")
    
    if not traces:
        raise ValueError(f"No traces found in {trace_dir}")
    
    # Split traces
    train_traces, val_traces = split_traces(traces, train_ratio=0.8)
    
    # Compute normalization stats
    stats = compute_feature_stats(traces)
    
    # Compute class weights for balancing
    pos_weight = None
    if mode == "pointwise":
        all_labels = []
        for trace in train_traces:
            for candidate in trace["candidates"]:
                label = 1.0 if candidate == trace["candidates"][trace["chosenIndex"]] else 0.0
                all_labels.append(label)
        
        pos_count = sum(all_labels)
        neg_count = len(all_labels) - pos_count
        
        if pos_count > 0 and neg_count > 0:
            pos_weight = torch.tensor([neg_count / pos_count], dtype=torch.float32).to(device)
            print(f"Class balance: {pos_count:.0f} positive, {neg_count:.0f} negative")
            print(f"Using pos_weight: {pos_weight.item():.2f}")
    
    # Create datasets
    if mode == "pairwise":
        train_dataset = ValidatorPairwiseDataset(train_traces)
        val_dataset = ValidatorPairwiseDataset(val_traces)
    else:
        train_dataset = ValidatorPointwiseDataset(train_traces)
        val_dataset = ValidatorPointwiseDataset(val_traces)
    
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
    
    # Create model with larger capacity
    pointwise_model = ValidatorPointwiseModel(input_dim=36, hidden_dim=128)
    print(f"Model parameters: {count_parameters(pointwise_model):,}")
    
    if mode == "pairwise":
        model = ValidatorPairwiseWrapper(pointwise_model)
        train_fn = train_pairwise_epoch
        val_fn = validate_pairwise
    else:
        model = pointwise_model
        train_fn = train_pointwise_epoch
        val_fn = validate_pointwise
    
    model = model.to(device)
    
    # Optimizer
    optimizer = optim.Adam(model.parameters(), lr=lr)
    
    # Early stopping
    early_stopping = EarlyStopping(patience=patience)
    
    # Training loop
    best_val_loss = float("inf")
    best_model_state = None
    
    print(f"\nTraining with {mode} loss for {epochs} epochs...")
    print(f"Train samples: {len(train_dataset)}, Val samples: {len(val_dataset)}")
    
    for epoch in range(epochs):
        if mode == "pointwise":
            train_loss = train_fn(model, train_loader, optimizer, device, pos_weight)
        else:
            train_loss = train_fn(model, train_loader, optimizer, device)
        val_metrics = val_fn(model, val_loader, device)
        
        print(
            f"Epoch {epoch+1}/{epochs} | "
            f"Train Loss: {train_loss:.4f} | "
            f"Val Loss: {val_metrics['loss']:.4f} | "
            f"Val Acc: {val_metrics['accuracy']:.3f}"
        )
        
        # Save best model
        if val_metrics["loss"] < best_val_loss:
            best_val_loss = val_metrics["loss"]
            best_model_state = pointwise_model.state_dict().copy()
        
        # Early stopping
        if early_stopping(val_metrics["loss"]):
            print(f"Early stopping at epoch {epoch+1}")
            break
    
    # Restore best model
    if best_model_state is not None:
        pointwise_model.load_state_dict(best_model_state)
    
    # Save model
    output_dir.mkdir(parents=True, exist_ok=True)
    model_path = output_dir / "validator_model.pt"
    torch.save(pointwise_model.state_dict(), model_path)
    print(f"\nSaved model to {model_path}")
    
    # Save normalization stats
    stats_path = output_dir / "normalization.json"
    with open(stats_path, "w") as f:
        json.dump({
            "mean": stats["mean"].tolist(),
            "std": stats["std"].tolist(),
        }, f, indent=2)
    print(f"Saved normalization stats to {stats_path}")
    
    return pointwise_model


def main():
    parser = argparse.ArgumentParser(description="Train validator agent model")
    parser.add_argument("--trace-dir", type=Path, required=True, help="Directory containing trace JSONL files")
    parser.add_argument("--output-dir", type=Path, default=Path("../../models/agents/validator"), help="Output directory")
    parser.add_argument("--mode", choices=["pairwise", "pointwise"], default="pairwise", help="Training mode")
    parser.add_argument("--epochs", type=int, default=50, help="Number of epochs")
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size")
    parser.add_argument("--lr", type=float, default=1e-3, help="Learning rate")
    parser.add_argument("--patience", type=int, default=5, help="Early stopping patience")
    
    args = parser.parse_args()
    
    train_validator(
        trace_dir=args.trace_dir,
        output_dir=args.output_dir,
        mode=args.mode,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        patience=args.patience,
    )


if __name__ == "__main__":
    main()
