"""
SYNTHESIZER AGENT MODEL

Pointwise scoring MLP for evidence combination decisions.
Architecture: 40 → 64 → 32 → 1 (sigmoid)
~6,500 parameters, ~26KB ONNX file
"""

import torch
import torch.nn as nn


class SynthesizerPointwiseModel(nn.Module):
    """
    Pointwise scoring model for evidence candidates.
    Takes a single candidate's features and outputs a score in [0, 1].
    """

    def __init__(self, input_dim: int = 40, hidden_dim: int = 64):
        super().__init__()
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim

        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim // 2, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: [batch_size, input_dim] feature tensor
        Returns:
            scores: [batch_size, 1] scores in [0, 1]
        """
        return self.net(x)


class SynthesizerPairwiseWrapper(nn.Module):
    """
    Wraps the pointwise model for pairwise ranking training.
    Given two candidates, predicts which one should be ranked higher.
    """

    def __init__(self, pointwise_model: SynthesizerPointwiseModel):
        super().__init__()
        self.pointwise = pointwise_model

    def forward(self, x_pos: torch.Tensor, x_neg: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x_pos: [batch_size, input_dim] features of positive (better) candidate
            x_neg: [batch_size, input_dim] features of negative (worse) candidate
        Returns:
            logits: [batch_size, 1] logit(score_pos > score_neg)
        """
        score_pos = self.pointwise(x_pos)
        score_neg = self.pointwise(x_neg)
        # Margin: how much better is pos than neg?
        margin = score_pos - score_neg
        # Convert to logit for BCE loss (target=1 means pos > neg)
        return margin


def create_synthesizer_model(input_dim: int = 40, hidden_dim: int = 64) -> SynthesizerPointwiseModel:
    """Factory function to create a synthesizer model."""
    return SynthesizerPointwiseModel(input_dim, hidden_dim)


def count_parameters(model: nn.Module) -> int:
    """Count trainable parameters."""
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


if __name__ == "__main__":
    # Test model creation
    model = create_synthesizer_model()
    print(f"Synthesizer Model: {count_parameters(model):,} parameters")

    # Test forward pass
    batch_size = 10
    x = torch.randn(batch_size, 40)
    scores = model(x)
    print(f"Input shape: {x.shape}")
    print(f"Output shape: {scores.shape}")
    print(f"Score range: [{scores.min():.3f}, {scores.max():.3f}]")

    # Test pairwise wrapper
    wrapper = SynthesizerPairwiseWrapper(model)
    x_pos = torch.randn(batch_size, 40)
    x_neg = torch.randn(batch_size, 40)
    margin = wrapper(x_pos, x_neg)
    print(f"\nPairwise margin shape: {margin.shape}")
    print(f"Margin range: [{margin.min():.3f}, {margin.max():.3f}]")
