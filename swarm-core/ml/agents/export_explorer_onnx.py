"""
EXPORT EXPLORER AGENT MODEL TO ONNX

Converts a trained PyTorch checkpoint to ONNX format for Node.js inference.
Also generates manifest.json and copies normalization.json to the output directory.

Usage:
  python3 ml/agents/export_explorer_onnx.py \
    --checkpoint ml/artifacts/explorer-v1/explorer_checkpoint.pt \
    --output-dir models/agents/explorer
"""

import argparse
import json
import os
import shutil

import torch
import onnx

from explorer_model import ExplorerScorerMLP


def parse_args():
    parser = argparse.ArgumentParser(description='Export Explorer Agent Model to ONNX')
    parser.add_argument('--checkpoint', type=str, required=True, help='Path to PyTorch checkpoint')
    parser.add_argument('--output-dir', type=str, required=True, help='Output directory for ONNX model')
    parser.add_argument('--opset', type=int, default=17, help='ONNX opset version')
    return parser.parse_args()


def main():
    args = parse_args()

    print("=" * 60)
    print("  EXPORT EXPLORER AGENT MODEL TO ONNX")
    print("=" * 60)

    # Load checkpoint
    checkpoint = torch.load(args.checkpoint, map_location='cpu', weights_only=False)
    input_dim = checkpoint.get('input_dim', 48)
    hidden1 = checkpoint.get('hidden1', 64)
    hidden2 = checkpoint.get('hidden2', 32)
    dropout = checkpoint.get('dropout', 0.1)
    normalization = checkpoint.get('normalization', {})

    print(f"  Checkpoint: {args.checkpoint}")
    print(f"  Architecture: {input_dim}→{hidden1}→{hidden2}→1")
    print(f"  Best epoch: {checkpoint.get('best_epoch', '?')}")
    print(f"  Best val loss: {checkpoint.get('best_val_loss', '?')}")
    print()

    # Recreate model and load weights
    model = ExplorerScorerMLP(
        input_dim=input_dim,
        hidden1=hidden1,
        hidden2=hidden2,
        dropout=dropout,
    )
    model.load_state_dict(checkpoint['model_state_dict'])
    model.eval()

    # Prepare output directory
    os.makedirs(args.output_dir, exist_ok=True)
    onnx_path = os.path.join(args.output_dir, 'explorer_scorer.onnx')

    # Export to ONNX
    # Use dynamic batch dimension so we can batch any number of candidates
    dummy_input = torch.randn(1, input_dim)

    print(f"  Exporting to ONNX (opset {args.opset})...")
    torch.onnx.export(
        model,
        dummy_input,
        onnx_path,
        export_params=True,
        opset_version=args.opset,
        do_constant_folding=True,
        input_names=['features'],
        output_names=['score'],
        dynamic_axes={
            'features': {0: 'batch_size'},
            'score': {0: 'batch_size'},
        },
    )

    # Verify the exported model
    onnx_model = onnx.load(onnx_path)
    onnx.checker.check_model(onnx_model)
    file_size_kb = os.path.getsize(onnx_path) / 1024
    print(f"  ONNX model saved: {onnx_path} ({file_size_kb:.1f} KB)")
    print(f"  ONNX model verified ✓")

    # Generate manifest.json
    manifest = {
        'enabled': True,
        'version': '1.0.0',
        'modelFile': 'explorer_scorer.onnx',
        'agentType': 'explorer',
        'inputName': 'features',
        'outputName': 'score',
        'inputDim': input_dim,
        'normalizationFile': 'normalization.json',
        'architecture': {
            'type': 'pointwise_scoring_mlp',
            'hidden1': hidden1,
            'hidden2': hidden2,
            'dropout': dropout,
            'params': model.param_count(),
        },
        'training': {
            'mode': checkpoint.get('mode', 'unknown'),
            'best_epoch': checkpoint.get('best_epoch', 0),
            'best_val_loss': checkpoint.get('best_val_loss', 0),
            'dataset_stats': checkpoint.get('dataset_stats', {}),
        },
    }

    manifest_path = os.path.join(args.output_dir, 'manifest.json')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f"  Manifest saved: {manifest_path}")

    # Save normalization
    norm_path = os.path.join(args.output_dir, 'normalization.json')
    with open(norm_path, 'w') as f:
        json.dump(normalization, f, indent=2)
    print(f"  Normalization saved: {norm_path}")

    print()
    print("  Export complete!")
    print()
    print("  To use in Node.js:")
    print("    1. npm install onnxruntime-node")
    print("    2. Set agentRuntime in BreedExecutionContext")
    print("    3. Explorer agents will auto-detect the model")
    print()


if __name__ == '__main__':
    main()
