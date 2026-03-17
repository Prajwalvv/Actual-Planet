"""
EXPORT VALIDATOR MODEL TO ONNX

Converts the trained PyTorch model to ONNX format for production inference.

Usage:
    python export_validator_onnx.py --model-path ../../models/agents/validator/validator_model.pt
"""

import argparse
import json
from pathlib import Path
import torch
import onnx
import onnxruntime as ort
import numpy as np

from validator_model import ValidatorPointwiseModel


def export_to_onnx(
    model_path: Path,
    output_dir: Path,
    input_dim: int = 36,
    hidden_dim: int = 64,
) -> None:
    """Export trained model to ONNX format."""
    
    # Load trained model
    model = ValidatorPointwiseModel(input_dim=input_dim, hidden_dim=hidden_dim)
    model.load_state_dict(torch.load(model_path, map_location="cpu"))
    model.eval()
    
    print(f"Loaded model from {model_path}")
    
    # Create dummy input
    dummy_input = torch.randn(1, input_dim)
    
    # Export to ONNX
    output_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = output_dir / "validator_model.onnx"
    
    torch.onnx.export(
        model,
        dummy_input,
        onnx_path,
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=["features"],
        output_names=["scores"],
        dynamic_axes={
            "features": {0: "batch_size"},
            "scores": {0: "batch_size"},
        },
    )
    
    print(f"Exported ONNX model to {onnx_path}")
    
    # Verify ONNX model
    onnx_model = onnx.load(str(onnx_path))
    onnx.checker.check_model(onnx_model)
    print("ONNX model is valid")
    
    # Test with ONNX Runtime
    ort_session = ort.InferenceSession(str(onnx_path))
    
    # Test inference
    test_input = np.random.randn(10, input_dim).astype(np.float32)
    ort_inputs = {"features": test_input}
    ort_outputs = ort_session.run(None, ort_inputs)
    
    print(f"ONNX Runtime test:")
    print(f"  Input shape: {test_input.shape}")
    print(f"  Output shape: {ort_outputs[0].shape}")
    print(f"  Score range: [{ort_outputs[0].min():.3f}, {ort_outputs[0].max():.3f}]")
    
    # Compare with PyTorch
    with torch.no_grad():
        torch_output = model(torch.from_numpy(test_input)).numpy()
    
    max_diff = np.abs(torch_output - ort_outputs[0]).max()
    print(f"  Max difference vs PyTorch: {max_diff:.6f}")
    
    if max_diff > 1e-5:
        print("  WARNING: Large difference between PyTorch and ONNX outputs")
    else:
        print("  ✓ ONNX output matches PyTorch")
    
    # Get file size
    file_size = onnx_path.stat().st_size
    print(f"  ONNX file size: {file_size:,} bytes ({file_size/1024:.1f} KB)")
    
    # Create manifest
    manifest = {
        "enabled": False,
        "version": "0.1.0",
        "modelFile": "validator_model.onnx",
        "agentType": "validator",
        "inputName": "features",
        "outputName": "scores",
        "inputDim": input_dim,
        "normalizationFile": "normalization.json",
    }
    
    manifest_path = output_dir / "manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    
    print(f"Created manifest at {manifest_path}")
    print("\nTo enable this model, set 'enabled: true' in manifest.json")


def main():
    parser = argparse.ArgumentParser(description="Export validator model to ONNX")
    parser.add_argument(
        "--model-path",
        type=Path,
        required=True,
        help="Path to trained PyTorch model (.pt file)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("../../models/agents/validator"),
        help="Output directory for ONNX model",
    )
    parser.add_argument(
        "--input-dim",
        type=int,
        default=36,
        help="Input feature dimension",
    )
    parser.add_argument(
        "--hidden-dim",
        type=int,
        default=64,
        help="Hidden layer dimension",
    )
    
    args = parser.parse_args()
    
    export_to_onnx(
        model_path=args.model_path,
        output_dir=args.output_dir,
        input_dim=args.input_dim,
        hidden_dim=args.hidden_dim,
    )


if __name__ == "__main__":
    main()
