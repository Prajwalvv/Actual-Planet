# Neural Ant Architecture Specification

## Overview

Transform ants from heuristic-driven agents to **fully neural model-driven agents**. Each ant instance is controlled by a recurrent neural network that makes all behavioral decisions in real-time.

---

## Current vs Neural Architecture

### Current (Hybrid)
```
Ant Behavior (hardcoded) → Model (scoring only) → Select candidate → Execute
```
- ✅ Models score candidates (Explorer picks links, Validator scores claims)
- ❌ Ant behavior is hardcoded (when to stop, how to explore, pheromone logic)
- ❌ No learning of exploration strategies
- ❌ No emergent behaviors

### Neural (Fully Model-Driven)
```
Ant State → Neural Network → Actions (move, communicate, deposit) → Environment
```
- ✅ Model controls all ant decisions
- ✅ Learns exploration strategies from experience
- ✅ Emergent behaviors from multi-ant interactions
- ✅ Evolutionary selection of successful strategies

---

## Observation Space (Ant's View of World)

Each ant observes its local environment at each timestep:

### 1. **Position & Context** (12 dims)
- `current_depth`: Normalized depth in search tree (0-1)
- `steps_taken`: Normalized step count (0-1, capped at 100)
- `time_remaining`: Fraction of time budget left (0-1)
- `query_length_norm`: Query complexity (0-1)
- `terrain_onehot[7]`: Current terrain type
- `depth_mode_onehot[3]`: Query depth setting (quick/standard/deep)

### 2. **Local Pheromones** (9 dims)
- `trail_strength`: Pheromone trail at current position (0-1)
- `interest_strength`: Interest pheromone (0-1)
- `dead_trail_strength`: Dead-end marker (0-1)
- `trail_gradient[3]`: Direction of strongest trail (x, y, z normalized)
- `pheromone_age`: How old is the trail (0-1, 0=fresh)
- `trail_diversity`: How many different ants contributed (0-1)
- `evaporation_rate`: Current evaporation speed (0-1)

### 3. **Resource State** (8 dims)
- `evidence_count_norm`: Evidence collected so far (0-1)
- `coverage_ratio`: Topic coverage achieved (0-1)
- `frontier_size_norm`: Unexplored links available (0-1)
- `source_diversity_norm`: Unique domains visited (0-1)
- `blocked_ratio_norm`: Fraction of blocked URLs (0-1)
- `usefulness_score`: Quality of evidence so far (0-1)
- `energy_level`: Ant's remaining energy budget (0-1)
- `success_rate`: Fraction of successful fetches (0-1)

### 4. **Nearby Ants** (6 dims)
- `nearby_ant_count_norm`: Number of ants in local area (0-1)
- `ant_density`: Ants per unit area (0-1)
- `avg_ant_success`: Average success rate of nearby ants (0-1)
- `communication_signal`: Strength of received messages (0-1)
- `swarm_alignment`: How aligned are nearby ants' directions (0-1)
- `competition_pressure`: Resource competition level (0-1)

### 5. **Internal Memory** (16 dims)
- `gru_hidden_state[16]`: Recurrent memory from previous timestep

**Total observation size**: 12 + 9 + 8 + 6 + 16 = **51 dimensions**

---

## Action Space (What Ant Can Do)

Each timestep, the neural network outputs:

### 1. **Movement Action** (discrete, 8 options)
- `0`: STOP (terminate exploration)
- `1`: FOLLOW_TRAIL (move along strongest pheromone)
- `2`: EXPLORE_NEW (move to unexplored area)
- `3`: EXPLOIT_BEST (move to highest-value candidate)
- `4`: RANDOM_WALK (stochastic exploration)
- `5`: BACKTRACK (return to previous position)
- `6`: JUMP_FRONTIER (teleport to frontier edge)
- `7`: FOLLOW_SWARM (move toward nearby ants)

### 2. **Pheromone Deposit** (continuous, 3 values)
- `trail_amount`: How much trail pheromone to deposit (0-1)
- `interest_amount`: How much interest pheromone (0-1)
- `dead_trail_flag`: Mark as dead-end (0 or 1)

### 3. **Communication** (continuous, 4 values)
- `broadcast_strength`: Signal strength to nearby ants (0-1)
- `message_type`: Encoded message category (0-1, discretized to 4 types)
- `urgency`: Priority level (0-1)
- `resource_share`: Share discovered resources (0 or 1)

### 4. **Mode Switch** (discrete, 4 options)
- `0`: EXPLORATION (prioritize coverage)
- `1`: EXPLOITATION (prioritize quality)
- `2`: VALIDATION (verify existing evidence)
- `3`: SYNTHESIS (combine findings)

**Total action size**: 1 (movement) + 3 (pheromone) + 4 (communication) + 1 (mode) = **9 outputs**

---

## Neural Network Architecture

### Model: **GRU-based Policy Network**

```
Input (51 dims) → GRU(64 hidden) → Action Head
                                  ├─ Movement (8 logits) → Softmax
                                  ├─ Pheromone (3 values) → Sigmoid
                                  ├─ Communication (4 values) → Sigmoid
                                  └─ Mode (4 logits) → Softmax
```

**Key design choices**:
- **GRU**: Maintains memory across timesteps (remembers past exploration)
- **Multi-head output**: Different action types have different distributions
- **Recurrent state**: 64-dim hidden state persists across ant's lifetime
- **Lightweight**: ~50K parameters per ant model (fast inference)

### Training Pipeline

#### Phase 1: Imitation Learning (Bootstrap)
1. **Collect traces** from current heuristic ants
2. **Record**: (observation, action, outcome) tuples
3. **Train**: Supervised learning to mimic heuristic behavior
4. **Validate**: 90%+ accuracy on held-out traces

#### Phase 2: Reinforcement Learning (Optimize)
1. **Reward function**:
   - `+1.0` per high-quality evidence found
   - `+0.5` per new domain discovered
   - `+0.3` per topic coverage increase
   - `-0.1` per failed fetch
   - `-0.05` per timestep (efficiency pressure)
   - `+2.0` bonus for query completion
2. **Algorithm**: PPO (Proximal Policy Optimization)
3. **Training**: Self-play with 100+ ants per episode
4. **Evaluation**: Compare to heuristic baseline

#### Phase 3: Evolution (Emergence)
1. **Fitness scoring**: Cumulative reward over 10 queries
2. **Selection**: Top 20% ants survive
3. **Mutation**: Add Gaussian noise to weights (σ=0.01)
4. **Crossover**: Blend weights from 2 parent ants
5. **Population**: 100 ants, 10 generations
6. **Measure**: Emergent behaviors (clustering, specialization, cooperation)

---

## Implementation Plan

### Step 1: Define Types
- `NeuralAntObservation`: 51-dim observation vector
- `NeuralAntAction`: 9-dim action vector
- `NeuralAntTrace`: Training data format
- `NeuralAntModel`: PyTorch GRU model

### Step 2: Trace Collection
- Instrument current ants to log (state, action, reward)
- Run 100 diverse queries
- Save to `runtime-artifacts/neural-ant-traces/`

### Step 3: Train Imitation Model
- `ml/train_neural_ant.py`: Supervised learning
- Target: 90%+ action prediction accuracy
- Export to ONNX: `models/neural-ant/ant_v1.onnx`

### Step 4: Implement NeuralAnt Class
- `src/agents/neural-ant/neural-ant.ts`
- Replace `breed.run()` with model inference loop
- Maintain GRU hidden state across steps
- Execute actions (movement, pheromone, communication)

### Step 5: A/B Testing
- Run queries with 50% heuristic ants, 50% neural ants
- Compare: evidence quality, coverage, efficiency
- Measure: emergent behaviors (do neural ants cluster?)

### Step 6: Evolution
- `ml/evolve_neural_ants.py`: Evolutionary algorithm
- 100 ants, 10 generations
- Track fitness over time
- Visualize: behavior diversity, specialization

---

## Expected Emergent Behaviors

Once neural ants are trained and evolved, we expect to see:

1. **Spontaneous clustering**: Ants form groups around high-value resources
2. **Role specialization**: Some ants become explorers, others validators
3. **Communication protocols**: Ants develop pheromone "languages"
4. **Adaptive strategies**: Swarm adjusts behavior based on query type
5. **Collective intelligence**: Multi-ant solutions exceed single-ant capability

---

## Success Metrics

### Quantitative
- **Performance**: Neural ants match or exceed heuristic baseline (evidence quality, coverage)
- **Efficiency**: 20%+ reduction in fetch count for same quality
- **Emergence**: 3+ distinct behavioral clusters in ant population
- **Evolution**: Fitness improvement of 50%+ over 10 generations

### Qualitative
- **Diversity**: Ants exhibit varied exploration strategies
- **Cooperation**: Ants coordinate without explicit programming
- **Adaptation**: Swarm behavior changes based on query difficulty
- **Robustness**: System degrades gracefully with ant failures

---

## Next Steps

1. ✅ **Design complete** (this document)
2. ⏳ **Define observation/action types** in TypeScript
3. ⏳ **Create trace collection system**
4. ⏳ **Train initial imitation model**
5. ⏳ **Implement NeuralAnt class**
6. ⏳ **Run A/B tests**
7. ⏳ **Enable evolution**
8. ⏳ **Measure emergence**

---

## References

- **Ant Colony Optimization**: Dorigo & Stützle (2004)
- **Multi-Agent RL**: Lowe et al. (2017) - MADDPG
- **Emergent Communication**: Lazaridou et al. (2020)
- **Evolutionary Strategies**: Salimans et al. (2017)
