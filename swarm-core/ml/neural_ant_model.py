"""
Neural Ant Model - GRU-based Policy Network

Architecture:
  Input (51 dims) → GRU(64 hidden) → Multi-head Action Output
    ├─ Movement (8 logits) → Softmax
    ├─ Pheromone (3 values) → Sigmoid
    ├─ Communication (4 values) → Sigmoid
    └─ Mode (4 logits) → Softmax

Each ant maintains a 64-dim hidden state that persists across timesteps,
allowing it to remember past exploration and make temporally coherent decisions.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class NeuralAntModel(nn.Module):
    """
    GRU-based policy network for fully autonomous ant agents.
    
    Args:
        input_dim: Observation vector size (default 51)
        hidden_dim: GRU hidden state size (default 64)
        movement_actions: Number of movement action types (default 8)
        mode_actions: Number of mode types (default 4)
    """
    
    def __init__(
        self,
        input_dim: int = 51,
        hidden_dim: int = 64,
        movement_actions: int = 8,
        mode_actions: int = 4,
    ):
        super().__init__()
        
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.movement_actions = movement_actions
        self.mode_actions = mode_actions
        
        # Core recurrent layer
        self.gru = nn.GRU(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=1,
            batch_first=True,
        )
        
        # Action heads
        self.movement_head = nn.Linear(hidden_dim, movement_actions)
        self.pheromone_head = nn.Linear(hidden_dim, 3)  # trail, interest, dead_flag
        self.communication_head = nn.Linear(hidden_dim, 4)  # broadcast, type, urgency, share
        self.mode_head = nn.Linear(hidden_dim, mode_actions)
        
        # Value head (for RL training)
        self.value_head = nn.Linear(hidden_dim, 1)
        
    def forward(self, obs: torch.Tensor, hidden: torch.Tensor = None):
        """
        Forward pass through the model.
        
        Args:
            obs: Observation tensor [batch, seq_len, input_dim] or [batch, input_dim]
            hidden: Previous hidden state [1, batch, hidden_dim] or None
            
        Returns:
            Dictionary containing:
                - movement_logits: [batch, movement_actions]
                - pheromone_values: [batch, 3]
                - communication_values: [batch, 4]
                - mode_logits: [batch, mode_actions]
                - value: [batch, 1]
                - hidden_state: [1, batch, hidden_dim]
        """
        # Handle 2D input (single timestep)
        if obs.dim() == 2:
            obs = obs.unsqueeze(1)  # [batch, 1, input_dim]
        
        batch_size = obs.size(0)
        
        # Initialize hidden state if not provided
        if hidden is None:
            hidden = torch.zeros(1, batch_size, self.hidden_dim, device=obs.device)
        
        # GRU forward pass
        gru_out, new_hidden = self.gru(obs, hidden)
        
        # Take last timestep output
        features = gru_out[:, -1, :]  # [batch, hidden_dim]
        
        # Compute action logits/values
        movement_logits = self.movement_head(features)
        pheromone_values = torch.sigmoid(self.pheromone_head(features))
        communication_values = torch.sigmoid(self.communication_head(features))
        mode_logits = self.mode_head(features)
        value = self.value_head(features)
        
        return {
            'movement_logits': movement_logits,
            'pheromone_values': pheromone_values,
            'communication_values': communication_values,
            'mode_logits': mode_logits,
            'value': value,
            'hidden_state': new_hidden,
        }
    
    def sample_action(self, obs: torch.Tensor, hidden: torch.Tensor = None, deterministic: bool = False):
        """
        Sample an action from the policy.
        
        Args:
            obs: Observation tensor [batch, input_dim]
            hidden: Previous hidden state [1, batch, hidden_dim]
            deterministic: If True, take argmax instead of sampling
            
        Returns:
            Dictionary containing sampled actions and log probabilities
        """
        with torch.no_grad():
            output = self.forward(obs, hidden)
            
            # Sample movement action
            movement_probs = F.softmax(output['movement_logits'], dim=-1)
            if deterministic:
                movement_action = movement_probs.argmax(dim=-1)
            else:
                movement_action = torch.multinomial(movement_probs, 1).squeeze(-1)
            movement_log_prob = F.log_softmax(output['movement_logits'], dim=-1)[
                torch.arange(movement_action.size(0)), movement_action
            ]
            
            # Sample mode action
            mode_probs = F.softmax(output['mode_logits'], dim=-1)
            if deterministic:
                mode_action = mode_probs.argmax(dim=-1)
            else:
                mode_action = torch.multinomial(mode_probs, 1).squeeze(-1)
            mode_log_prob = F.log_softmax(output['mode_logits'], dim=-1)[
                torch.arange(mode_action.size(0)), mode_action
            ]
            
            # Continuous actions (pheromone, communication) are already in [0, 1]
            pheromone = output['pheromone_values']
            communication = output['communication_values']
            
            return {
                'movement_action': movement_action,
                'movement_log_prob': movement_log_prob,
                'mode_action': mode_action,
                'mode_log_prob': mode_log_prob,
                'pheromone': pheromone,
                'communication': communication,
                'value': output['value'],
                'hidden_state': output['hidden_state'],
            }
    
    def evaluate_actions(self, obs: torch.Tensor, hidden: torch.Tensor, actions: dict):
        """
        Evaluate log probabilities and entropy for given actions (for PPO training).
        
        Args:
            obs: Observation tensor [batch, seq_len, input_dim]
            hidden: Hidden state [1, batch, hidden_dim]
            actions: Dictionary with 'movement' and 'mode' action indices
            
        Returns:
            log_probs, entropy, value
        """
        output = self.forward(obs, hidden)
        
        # Movement action log prob
        movement_log_probs = F.log_softmax(output['movement_logits'], dim=-1)
        movement_action_log_prob = movement_log_probs.gather(1, actions['movement'].unsqueeze(-1)).squeeze(-1)
        
        # Mode action log prob
        mode_log_probs = F.log_softmax(output['mode_logits'], dim=-1)
        mode_action_log_prob = mode_log_probs.gather(1, actions['mode'].unsqueeze(-1)).squeeze(-1)
        
        # Total log prob (product of independent actions)
        total_log_prob = movement_action_log_prob + mode_action_log_prob
        
        # Entropy (for exploration bonus)
        movement_probs = F.softmax(output['movement_logits'], dim=-1)
        mode_probs = F.softmax(output['mode_logits'], dim=-1)
        movement_entropy = -(movement_probs * movement_log_probs).sum(dim=-1)
        mode_entropy = -(mode_probs * mode_log_probs).sum(dim=-1)
        total_entropy = movement_entropy + mode_entropy
        
        return total_log_prob, total_entropy, output['value']


class NeuralAntImitationModel(nn.Module):
    """
    Simplified version for imitation learning (no value head).
    Used for initial bootstrapping from heuristic ant traces.
    """
    
    def __init__(
        self,
        input_dim: int = 51,
        hidden_dim: int = 64,
        movement_actions: int = 8,
        mode_actions: int = 4,
    ):
        super().__init__()
        
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        
        self.gru = nn.GRU(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=1,
            batch_first=True,
        )
        
        self.movement_head = nn.Linear(hidden_dim, movement_actions)
        self.pheromone_head = nn.Linear(hidden_dim, 3)
        self.communication_head = nn.Linear(hidden_dim, 4)
        self.mode_head = nn.Linear(hidden_dim, mode_actions)
        
    def forward(self, obs: torch.Tensor, hidden: torch.Tensor = None):
        if obs.dim() == 2:
            obs = obs.unsqueeze(1)
        
        batch_size = obs.size(0)
        if hidden is None:
            hidden = torch.zeros(1, batch_size, self.hidden_dim, device=obs.device)
        
        gru_out, new_hidden = self.gru(obs, hidden)
        features = gru_out[:, -1, :]
        
        return {
            'movement_logits': self.movement_head(features),
            'pheromone_values': torch.sigmoid(self.pheromone_head(features)),
            'communication_values': torch.sigmoid(self.communication_head(features)),
            'mode_logits': self.mode_head(features),
            'hidden_state': new_hidden,
        }


def count_parameters(model: nn.Module) -> int:
    """Count trainable parameters in the model."""
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


if __name__ == '__main__':
    model = NeuralAntModel()
    print(f"Neural Ant Model")
    print(f"  Input dim: {model.input_dim}")
    print(f"  Hidden dim: {model.hidden_dim}")
    print(f"  Movement actions: {model.movement_actions}")
    print(f"  Mode actions: {model.mode_actions}")
    print(f"  Total parameters: {count_parameters(model):,}")
    
    batch_size = 4
    obs = torch.randn(batch_size, 51)
    hidden = torch.zeros(1, batch_size, 64)
    
    output = model(obs, hidden)
    print(f"\nOutput shapes:")
    for key, val in output.items():
        if isinstance(val, torch.Tensor):
            print(f"  {key}: {val.shape}")
    
    action = model.sample_action(obs, hidden)
    print(f"\nSampled action:")
    for key, val in action.items():
        if isinstance(val, torch.Tensor):
            print(f"  {key}: {val.shape}")
