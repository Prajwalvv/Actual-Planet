"""
EXPLORER AGENT MODEL — Pointwise Scoring MLP

Architecture: 48 → 64 → ReLU → 32 → ReLU → 1 (score)
Total params: ~5,300

This is a pointwise scoring model: it takes features for ONE link candidate
and outputs a scalar score. Higher score = more promising candidate.

Training: binary cross-entropy or pairwise ranking loss.
- Positive examples: links that led to useful evidence
- Negative examples: links that were wasted (no evidence, fetch failed)

The model is intentionally tiny:
- 5,300 params ≈ 21KB ONNX file
- Inference: <0.1ms for 1000 candidates in one batch
- Memory: ~50KB per loaded model session
- Supports batched inference natively (batch dim on input)

Production references:
- Google DLRM: pointwise scoring for recommendation
- Uber DeepETA: tiny MLPs for real-time decisions
- OpenAI reward models: pointwise scoring architecture
"""

import torch
import torch.nn as nn
from typing import Optional


class ExplorerScorerMLP(nn.Module):
    """
    Pointwise link scorer.
    
    Input:  [batch_size, input_dim]  — feature vector per candidate
    Output: [batch_size, 1]          — score per candidate
    """

    def __init__(self, input_dim: int = 48, hidden1: int = 64, hidden2: int = 32, dropout: float = 0.1):
        super().__init__()
        self.input_dim = input_dim
        self.hidden1 = hidden1
        self.hidden2 = hidden2

        self.trunk = nn.Sequential(
            nn.Linear(input_dim, hidden1),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden1, hidden2),
            nn.ReLU(),
            nn.Dropout(dropout),
        )

        self.score_head = nn.Linear(hidden2, 1)

        # Initialize weights using Kaiming (He) initialization
        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, nonlinearity='relu')
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass.
        
        Args:
            x: [batch_size, input_dim] feature vectors
            
        Returns:
            [batch_size, 1] scores (raw logits, apply sigmoid for probability)
        """
        h = self.trunk(x)
        return self.score_head(h)

    def score(self, x: torch.Tensor) -> torch.Tensor:
        """Score with sigmoid activation (0-1 range)."""
        return torch.sigmoid(self.forward(x))

    def param_count(self) -> int:
        return sum(p.numel() for p in self.parameters())


class ExplorerPairwiseModel(nn.Module):
    """
    Wrapper for pairwise ranking training.
    
    Given a positive and negative candidate, computes margin-based ranking loss.
    This learns relative ordering (which link is BETTER) rather than absolute scores.
    
    Generally produces better ranking quality than pointwise BCE.
    """

    def __init__(self, scorer: ExplorerScorerMLP):
        super().__init__()
        self.scorer = scorer

    def forward(self, pos: torch.Tensor, neg: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            pos: [batch_size, input_dim] positive (useful) candidates
            neg: [batch_size, input_dim] negative (wasted) candidates
            
        Returns:
            (loss, accuracy) — margin ranking loss and fraction correctly ranked
        """
        pos_score = self.scorer(pos)
        neg_score = self.scorer(neg)

        # Margin ranking loss: score(pos) should be > score(neg) by margin
        loss = nn.functional.margin_ranking_loss(
            pos_score, neg_score,
            target=torch.ones_like(pos_score),
            margin=0.2,
        )

        # Accuracy: fraction where pos_score > neg_score
        accuracy = (pos_score > neg_score).float().mean()

        return loss, accuracy


def create_explorer_model(
    input_dim: int = 48,
    hidden1: int = 64,
    hidden2: int = 32,
    dropout: float = 0.1,
) -> ExplorerScorerMLP:
    """Factory function to create the explorer scorer model."""
    model = ExplorerScorerMLP(
        input_dim=input_dim,
        hidden1=hidden1,
        hidden2=hidden2,
        dropout=dropout,
    )
    print(f"[ExplorerModel] Created MLP: {input_dim}→{hidden1}→{hidden2}→1 "
          f"({model.param_count():,} params)")
    return model
