"""
Export Neural Ant Model to ONNX

Converts the trained PyTorch GRU-based neural ant model to ONNX format
for efficient inference in the TypeScript runtime.

Usage:
    python ml/export_neural_ant_onnx.py \
        --checkpoint models/neural-ant/checkpoints/best.pt \
        --output models/neural-ant/neural_ant_v1.onnx
"""

import argparse
import torch
import torch.onnx
from pathlib import Path
from neural_ant_model import NeuralAntModel, NeuralAntImitationModel


def export_to_onnx(
    checkpoint_path: str,
    output_path: str,
    input_dim: int = 51,
    hidden_dim: int = 64,
    movement_actions: int = 8,
    mode_actions: int = 4,
    use_imitation_model: bool = False,
):
    """
    Export neural ant model to ONNX format.
    
    Args:
        checkpoint_path: Path to trained PyTorch checkpoint
        output_path: Where to save ONNX file
        input_dim: Observation dimension
        hidden_dim: GRU hidden state dimension
        movement_actions: Number of movement action types
        mode_actions: Number of mode types
        use_imitation_model: Use imitation model (no value head)
    """
    device = torch.device('cpu')
    
    # Load model
    if use_imitation_model:
        model = NeuralAntImitationModel(
            input_dim=input_dim,
            hidden_dim=hidden_dim,
            movement_actions=movement_actions,
            mode_actions=mode_actions,
        )
    else:
        model = NeuralAntModel(
            input_dim=input_dim,
            hidden_dim=hidden_dim,
            movement_actions=movement_actions,
            mode_actions=mode_actions,
        )
    
    # Load checkpoint if provided
    if checkpoint_path and Path(checkpoint_path).exists():
        checkpoint = torch.load(checkpoint_path, map_location=device)
        if 'model_state_dict' in checkpoint:
            model.load_state_dict(checkpoint['model_state_dict'])
        else:
            model.load_state_dict(checkpoint)
        print(f"✓ Loaded checkpoint from {checkpoint_path}")
    else:
        print(f"⚠ No checkpoint found, exporting untrained model")
    
    model.eval()
    model.to(device)
    
    # Create dummy inputs
    batch_size = 1
    dummy_obs = torch.randn(batch_size, input_dim, device=device)
    dummy_hidden = torch.zeros(1, batch_size, hidden_dim, device=device)
    
    # Export to ONNX
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    input_names = ['observation', 'hidden_state']
    output_names = [
        'movement_logits',
        'pheromone_values',
        'communication_values',
        'mode_logits',
        'new_hidden_state',
    ]
    
    if not use_imitation_model:
        output_names.append('value')
    
    dynamic_axes = {
        'observation': {0: 'batch_size'},
        'hidden_state': {1: 'batch_size'},
        'movement_logits': {0: 'batch_size'},
        'pheromone_values': {0: 'batch_size'},
        'communication_values': {0: 'batch_size'},
        'mode_logits': {0: 'batch_size'},
        'new_hidden_state': {1: 'batch_size'},
    }
    
    if not use_imitation_model:
        dynamic_axes['value'] = {0: 'batch_size'}
    
    # Custom forward for ONNX export
    class ONNXWrapper(torch.nn.Module):
        def __init__(self, model):
            super().__init__()
            self.model = model
        
        def forward(self, obs, hidden):
            output = self.model(obs, hidden)
            if use_imitation_model:
                return (
                    output['movement_logits'],
                    output['pheromone_values'],
                    output['communication_values'],
                    output['mode_logits'],
                    output['hidden_state'],
                )
            else:
                return (
                    output['movement_logits'],
                    output['pheromone_values'],
                    output['communication_values'],
                    output['mode_logits'],
                    output['hidden_state'],
                    output['value'],
                )
    
    wrapped_model = ONNXWrapper(model)
    
    torch.onnx.export(
        wrapped_model,
        (dummy_obs, dummy_hidden),
        str(output_path),
        input_names=input_names,
        output_names=output_names,
        dynamic_axes=dynamic_axes,
        opset_version=14,
        do_constant_folding=True,
        export_params=True,
    )
    
    print(f"✓ Exported ONNX model to {output_path}")
    print(f"  Input dim: {input_dim}")
    print(f"  Hidden dim: {hidden_dim}")
    print(f"  Movement actions: {movement_actions}")
    print(f"  Mode actions: {mode_actions}")
    
    # Verify ONNX model
    try:
        import onnx
        onnx_model = onnx.load(str(output_path))
        onnx.checker.check_model(onnx_model)
        print(f"✓ ONNX model validation passed")
    except ImportError:
        print(f"⚠ onnx package not installed, skipping validation")
    except Exception as e:
        print(f"✗ ONNX validation failed: {e}")
    
    # Test inference
    try:
        import onnxruntime as ort
        session = ort.InferenceSession(str(output_path))
        
        test_obs = dummy_obs.numpy()
        test_hidden = dummy_hidden.numpy()
        
        outputs = session.run(
            None,
            {'observation': test_obs, 'hidden_state': test_hidden}
        )
        
        print(f"✓ ONNX inference test passed")
        print(f"  Output shapes:")
        for name, output in zip(output_names, outputs):
            print(f"    {name}: {output.shape}")
    except ImportError:
        print(f"⚠ onnxruntime not installed, skipping inference test")
    except Exception as e:
        print(f"✗ ONNX inference test failed: {e}")


def main():
    parser = argparse.ArgumentParser(description='Export Neural Ant model to ONNX')
    parser.add_argument('--checkpoint', type=str, default=None,
                        help='Path to PyTorch checkpoint')
    parser.add_argument('--output', type=str, required=True,
                        help='Output ONNX file path')
    parser.add_argument('--input-dim', type=int, default=51,
                        help='Observation dimension')
    parser.add_argument('--hidden-dim', type=int, default=64,
                        help='GRU hidden dimension')
    parser.add_argument('--movement-actions', type=int, default=8,
                        help='Number of movement actions')
    parser.add_argument('--mode-actions', type=int, default=4,
                        help='Number of mode actions')
    parser.add_argument('--imitation', action='store_true',
                        help='Use imitation model (no value head)')
    
    args = parser.parse_args()
    
    export_to_onnx(
        checkpoint_path=args.checkpoint,
        output_path=args.output,
        input_dim=args.input_dim,
        hidden_dim=args.hidden_dim,
        movement_actions=args.movement_actions,
        mode_actions=args.mode_actions,
        use_imitation_model=args.imitation,
    )


if __name__ == '__main__':
    main()
