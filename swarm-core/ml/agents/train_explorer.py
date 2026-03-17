"""
TRAIN EXPLORER AGENT — Imitation + Pairwise Ranking Training

Usage:
  python3 ml/agents/train_explorer.py \
    --trace-dir runtime-artifacts/agent-traces \
    --output-dir ml/artifacts/explorer-v1

Two training modes:
  1. Pointwise BCE:  Learn to predict whether a link is useful (0/1)
  2. Pairwise Ranking: Learn to rank useful links above wasted ones (better quality)

Default: pairwise ranking (produces better ranking quality).

The training is fast on CPU (~30s for 10K examples) and even faster on MPS (M4 Pro).
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, random_split

from explorer_model import ExplorerScorerMLP, ExplorerPairwiseModel, create_explorer_model
from explorer_dataset import (
    load_agent_traces,
    compute_normalization,
    summarize_traces,
    ExplorerPointwiseDataset,
    ExplorerPairwiseDataset,
    INPUT_DIM,
)


def parse_args():
    parser = argparse.ArgumentParser(description='Train Explorer Agent Model')
    parser.add_argument('--trace-dir', type=str, required=True, help='Directory with agent trace JSONL files')
    parser.add_argument('--output-dir', type=str, required=True, help='Output directory for checkpoints')
    parser.add_argument('--mode', type=str, default='pairwise', choices=['pointwise', 'pairwise'],
                        help='Training mode: pointwise (BCE) or pairwise (ranking)')
    parser.add_argument('--epochs', type=int, default=30, help='Number of training epochs')
    parser.add_argument('--batch-size', type=int, default=128, help='Batch size')
    parser.add_argument('--lr', type=float, default=1e-3, help='Learning rate')
    parser.add_argument('--hidden1', type=int, default=64, help='First hidden layer size')
    parser.add_argument('--hidden2', type=int, default=32, help='Second hidden layer size')
    parser.add_argument('--dropout', type=float, default=0.1, help='Dropout rate')
    parser.add_argument('--val-split', type=float, default=0.15, help='Validation split ratio')
    parser.add_argument('--patience', type=int, default=7, help='Early stopping patience')
    parser.add_argument('--grad-clip', type=float, default=1.0, help='Gradient clipping max norm')
    parser.add_argument('--pairs-per-trace', type=int, default=10, help='Pairs per trace for pairwise mode')
    parser.add_argument('--seed', type=int, default=42, help='Random seed')
    return parser.parse_args()


def get_device() -> torch.device:
    if torch.backends.mps.is_available():
        print("[Device] Using Apple MPS (Metal Performance Shaders)")
        return torch.device('mps')
    elif torch.cuda.is_available():
        print("[Device] Using CUDA")
        return torch.device('cuda')
    else:
        print("[Device] Using CPU")
        return torch.device('cpu')


def train_pointwise(
    model: ExplorerScorerMLP,
    train_loader: DataLoader,
    val_loader: DataLoader,
    args,
    device: torch.device,
) -> dict:
    """Train with binary cross-entropy loss."""
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    criterion = nn.BCEWithLogitsLoss()

    best_val_loss = float('inf')
    best_epoch = 0
    patience_counter = 0
    history = []

    for epoch in range(1, args.epochs + 1):
        # ─── Train ───
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0

        for features, labels in train_loader:
            features, labels = features.to(device), labels.to(device)
            optimizer.zero_grad()
            logits = model(features).squeeze(-1)
            loss = criterion(logits, labels)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), args.grad_clip)
            optimizer.step()

            train_loss += loss.item() * features.size(0)
            preds = (torch.sigmoid(logits) > 0.5).float()
            train_correct += (preds == labels).sum().item()
            train_total += features.size(0)

        scheduler.step()

        # ─── Validate ───
        model.eval()
        val_loss = 0.0
        val_correct = 0
        val_total = 0

        with torch.no_grad():
            for features, labels in val_loader:
                features, labels = features.to(device), labels.to(device)
                logits = model(features).squeeze(-1)
                loss = criterion(logits, labels)
                val_loss += loss.item() * features.size(0)
                preds = (torch.sigmoid(logits) > 0.5).float()
                val_correct += (preds == labels).sum().item()
                val_total += features.size(0)

        avg_train_loss = train_loss / max(1, train_total)
        avg_val_loss = val_loss / max(1, val_total)
        train_acc = train_correct / max(1, train_total)
        val_acc = val_correct / max(1, val_total)

        history.append({
            'epoch': epoch,
            'train_loss': avg_train_loss,
            'val_loss': avg_val_loss,
            'train_acc': train_acc,
            'val_acc': val_acc,
        })

        print(f"  Epoch {epoch:3d}/{args.epochs} | "
              f"train_loss={avg_train_loss:.4f} train_acc={train_acc:.3f} | "
              f"val_loss={avg_val_loss:.4f} val_acc={val_acc:.3f}")

        # Early stopping
        if avg_val_loss < best_val_loss:
            best_val_loss = avg_val_loss
            best_epoch = epoch
            patience_counter = 0
        else:
            patience_counter += 1
            if patience_counter >= args.patience:
                print(f"  Early stopping at epoch {epoch} (best={best_epoch})")
                break

    return {
        'best_epoch': best_epoch,
        'best_val_loss': best_val_loss,
        'history': history,
    }


def train_pairwise(
    model: ExplorerScorerMLP,
    train_loader: DataLoader,
    val_loader: DataLoader,
    args,
    device: torch.device,
) -> dict:
    """Train with pairwise margin ranking loss."""
    pairwise_model = ExplorerPairwiseModel(model).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    best_val_loss = float('inf')
    best_epoch = 0
    patience_counter = 0
    history = []

    for epoch in range(1, args.epochs + 1):
        # ─── Train ───
        pairwise_model.train()
        train_loss = 0.0
        train_acc = 0.0
        train_batches = 0

        for pos_feat, neg_feat in train_loader:
            pos_feat, neg_feat = pos_feat.to(device), neg_feat.to(device)
            optimizer.zero_grad()
            loss, acc = pairwise_model(pos_feat, neg_feat)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), args.grad_clip)
            optimizer.step()

            train_loss += loss.item()
            train_acc += acc.item()
            train_batches += 1

        scheduler.step()

        # ─── Validate ───
        pairwise_model.eval()
        val_loss = 0.0
        val_acc = 0.0
        val_batches = 0

        with torch.no_grad():
            for pos_feat, neg_feat in val_loader:
                pos_feat, neg_feat = pos_feat.to(device), neg_feat.to(device)
                loss, acc = pairwise_model(pos_feat, neg_feat)
                val_loss += loss.item()
                val_acc += acc.item()
                val_batches += 1

        avg_train_loss = train_loss / max(1, train_batches)
        avg_val_loss = val_loss / max(1, val_batches)
        avg_train_acc = train_acc / max(1, train_batches)
        avg_val_acc = val_acc / max(1, val_batches)

        history.append({
            'epoch': epoch,
            'train_loss': avg_train_loss,
            'val_loss': avg_val_loss,
            'train_acc': avg_train_acc,
            'val_acc': avg_val_acc,
        })

        print(f"  Epoch {epoch:3d}/{args.epochs} | "
              f"train_loss={avg_train_loss:.4f} train_rank_acc={avg_train_acc:.3f} | "
              f"val_loss={avg_val_loss:.4f} val_rank_acc={avg_val_acc:.3f}")

        # Early stopping
        if avg_val_loss < best_val_loss:
            best_val_loss = avg_val_loss
            best_epoch = epoch
            patience_counter = 0
        else:
            patience_counter += 1
            if patience_counter >= args.patience:
                print(f"  Early stopping at epoch {epoch} (best={best_epoch})")
                break

    return {
        'best_epoch': best_epoch,
        'best_val_loss': best_val_loss,
        'history': history,
    }


def main():
    args = parse_args()
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)

    print("=" * 60)
    print("  EXPLORER AGENT MODEL TRAINING")
    print("=" * 60)
    print(f"  Trace dir:  {args.trace_dir}")
    print(f"  Output dir: {args.output_dir}")
    print(f"  Mode:       {args.mode}")
    print()

    # Load traces
    traces = load_agent_traces(args.trace_dir, agent_type='explorer')
    if len(traces) == 0:
        print("ERROR: No traces found. Run the swarm with SWARM_AGENT_TRACE=1 first.")
        sys.exit(1)

    stats = summarize_traces(traces)
    print(f"\n  Dataset: {stats['traces']} traces, {stats['candidates']} candidates")
    print(f"  Positive: {stats['positive']} ({stats['positive_ratio']*100:.1f}%)")
    print(f"  Negative: {stats['negative']} ({(1-stats['positive_ratio'])*100:.1f}%)")
    print()

    # Compute normalization
    normalization = compute_normalization(traces)

    # Split traces into train/val (split at trace level, not example level)
    n_val = max(1, int(len(traces) * args.val_split))
    n_train = len(traces) - n_val
    train_traces = traces[:n_train]
    val_traces = traces[n_train:]
    print(f"  Split: {n_train} train traces, {n_val} val traces")

    # Build datasets
    device = get_device()

    if args.mode == 'pointwise':
        train_dataset = ExplorerPointwiseDataset(train_traces)
        val_dataset = ExplorerPointwiseDataset(val_traces)
    else:
        train_dataset = ExplorerPairwiseDataset(train_traces, pairs_per_trace=args.pairs_per_trace)
        val_dataset = ExplorerPairwiseDataset(val_traces, pairs_per_trace=args.pairs_per_trace)

    if len(train_dataset) == 0:
        print("ERROR: No training examples. Need traces with both positive and negative outcomes.")
        sys.exit(1)

    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True, drop_last=False)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False, drop_last=False)

    print(f"  Train examples: {len(train_dataset)}")
    print(f"  Val examples:   {len(val_dataset)}")
    print()

    # Create model
    model = create_explorer_model(
        input_dim=INPUT_DIM,
        hidden1=args.hidden1,
        hidden2=args.hidden2,
        dropout=args.dropout,
    ).to(device)

    print(f"\n  Training ({args.mode} mode)...")
    print("-" * 60)

    start_time = time.time()

    if args.mode == 'pointwise':
        result = train_pointwise(model, train_loader, val_loader, args, device)
    else:
        result = train_pairwise(model, train_loader, val_loader, args, device)

    elapsed = time.time() - start_time
    print("-" * 60)
    print(f"  Training complete in {elapsed:.1f}s")
    print(f"  Best epoch: {result['best_epoch']} (val_loss={result['best_val_loss']:.4f})")

    # Save checkpoint
    os.makedirs(args.output_dir, exist_ok=True)
    checkpoint_path = os.path.join(args.output_dir, 'explorer_checkpoint.pt')

    checkpoint = {
        'model_state_dict': model.cpu().state_dict(),
        'input_dim': INPUT_DIM,
        'hidden1': args.hidden1,
        'hidden2': args.hidden2,
        'dropout': args.dropout,
        'mode': args.mode,
        'best_epoch': result['best_epoch'],
        'best_val_loss': result['best_val_loss'],
        'history': result['history'],
        'normalization': normalization,
        'dataset_stats': stats,
    }
    torch.save(checkpoint, checkpoint_path)
    print(f"\n  Checkpoint saved: {checkpoint_path}")

    # Save normalization separately for Node.js runtime
    norm_path = os.path.join(args.output_dir, 'normalization.json')
    with open(norm_path, 'w') as f:
        json.dump(normalization, f, indent=2)
    print(f"  Normalization saved: {norm_path}")

    # Save training history
    history_path = os.path.join(args.output_dir, 'training_history.json')
    with open(history_path, 'w') as f:
        json.dump(result['history'], f, indent=2)
    print(f"  History saved: {history_path}")

    print("\n  Next: Export to ONNX with:")
    print(f"    python3 ml/agents/export_explorer_onnx.py \\")
    print(f"      --checkpoint {checkpoint_path} \\")
    print(f"      --output-dir models/agents/explorer")
    print()


if __name__ == '__main__':
    main()
