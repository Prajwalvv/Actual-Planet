# Neural Ant System - Implementation Progress

## Overview

Transforming the swarm from **heuristic-driven ants** to **fully neural model-driven ants**. Each ant will be an autonomous agent controlled by a recurrent neural network that makes all behavioral decisions.

---

## ✅ Completed

### 1. Architecture Design
- **Specification**: `docs/NEURAL-ANT-SPEC.md`
- **Observation space**: 51 dimensions (position, pheromones, resources, nearby ants, memory)
- **Action space**: 9 outputs (movement, pheromone deposit, communication, mode)
- **Model**: GRU-based policy network (~24K parameters)

### 2. Neural Network Implementation
- **File**: `ml/neural_ant_model.py`
- **Models**:
  - `NeuralAntModel`: Full RL model with value head (for PPO training)
  - `NeuralAntImitationModel`: Simplified for imitation learning
- **Features**:
  - GRU recurrent layer (64 hidden units)
  - Multi-head output (movement, pheromone, communication, mode)
  - Action sampling with log probabilities
  - Entropy calculation for exploration
- **Verified**: ✓ Model runs successfully, 23,764 parameters

### 3. TypeScript Type Definitions
- **File**: `src/agents/neural-ant/neural-ant-types.ts`
- **Types defined**:
  - `NeuralAntObservation`: Complete observation structure
  - `NeuralAntAction`: Action output structure
  - `NeuralAntTraceRecord`: Training data format
  - `NeuralAntModelManifest`: Model configuration
  - `INeuralAntModel`: Runtime interface

### 4. Observation Builder
- **File**: `src/agents/neural-ant/observation-builder.ts`
- **Functions**:
  - `buildNeuralAntObservation()`: Construct 51-dim observation from swarm state
  - `flattenObservation()`: Convert to Float32Array for ONNX inference
  - `extractSwarmState()`: Extract state from execution context
- **Features**: Proper normalization, one-hot encoding, bounds checking

### 5. ONNX Export Pipeline
- **File**: `ml/export_neural_ant_onnx.py`
- **Capabilities**:
  - Export trained PyTorch model to ONNX
  - Support for both full RL and imitation models
  - Dynamic batch size support
  - Automatic validation and inference testing
- **Verified**: ✓ Successfully exported untrained model to `models/neural-ant/neural_ant_v1.onnx`

### 6. Model Manifest
- **File**: `models/neural-ant/manifest.json`
- **Configuration**:
  - Model file path
  - Input/output tensor names
  - Dimensions and action counts
  - Currently disabled (will enable after training)

---

## 🔄 Next Steps

### Phase 1: Trace Collection (Next)
**Goal**: Collect behavioral traces from current heuristic ants to bootstrap neural model

**Tasks**:
1. Create trace collection system
   - Instrument current ant implementations to log state-action-reward tuples
   - Record: observation (51-dim), action taken, reward received, next observation
   - Save to `runtime-artifacts/neural-ant-traces/`

2. Run diverse queries
   - 100+ queries across different terrains, depths, complexities
   - Capture successful and failed exploration strategies
   - Ensure balanced coverage of all action types

3. Validate traces
   - Verify observation dimensions are correct
   - Check action distributions (no degenerate policies)
   - Confirm reward signals are meaningful

**Expected output**: 1000+ trace episodes with 10K+ timesteps

### Phase 2: Imitation Training
**Goal**: Train neural ant to mimic heuristic ant behavior

**Tasks**:
1. Create training script (`ml/train_neural_ant_imitation.py`)
   - Load traces from disk
   - Supervised learning: predict actions from observations
   - Loss: Cross-entropy (discrete actions) + MSE (continuous actions)
   - Target: 90%+ action prediction accuracy

2. Train model
   - 50 epochs with early stopping
   - Validation split: 80/20
   - Batch size: 32
   - Learning rate: 1e-3 with decay

3. Export to ONNX
   - Use `export_neural_ant_onnx.py` with trained checkpoint
   - Validate inference matches PyTorch

**Expected output**: Trained model with 90%+ accuracy on held-out traces

### Phase 3: Runtime Integration
**Goal**: Deploy neural ants alongside heuristic ants

**Tasks**:
1. Create `NeuralAntRuntime` class
   - Load ONNX model and manifest
   - Manage GRU hidden state across timesteps
   - Batch inference for multiple ants

2. Implement `NeuralAnt` class
   - Replace `breed.run()` with model inference loop
   - Execute actions: movement, pheromone deposit, communication
   - Track fitness metrics

3. A/B testing framework
   - Run queries with 50% neural ants, 50% heuristic ants
   - Compare: evidence quality, coverage, efficiency
   - Measure: emergent behaviors (clustering, specialization)

**Expected output**: Neural ants performing at 80%+ of heuristic baseline

### Phase 4: Reinforcement Learning (Future)
**Goal**: Optimize neural ants beyond heuristic performance

**Tasks**:
1. Implement PPO training loop
2. Self-play with 100+ ants per episode
3. Reward shaping for desired behaviors
4. Fine-tune for 1000+ episodes

**Expected output**: Neural ants exceeding heuristic baseline by 20%+

### Phase 5: Evolution (Future)
**Goal**: Enable emergent behaviors through evolutionary selection

**Tasks**:
1. Fitness scoring system
2. Selection, mutation, crossover operators
3. Population management (100 ants, 10 generations)
4. Behavior diversity metrics

**Expected output**: Spontaneous role specialization, communication protocols, collective intelligence

---

## Architecture Comparison

### Before (Current)
```
Query → GRU Queen (policy) → Deploy Heuristic Ants
                              ├─ Explorer (heuristic logic + model scoring)
                              ├─ Validator (heuristic logic + model scoring)
                              └─ Synthesizer (heuristic logic + model scoring)
```

**Limitations**:
- Ant behavior is hardcoded (when to stop, how to explore)
- No learning of exploration strategies
- No emergent multi-ant behaviors
- Models only used for candidate scoring

### After (Neural Ants)
```
Query → GRU Queen (policy) → Deploy Neural Ants
                              ├─ NeuralAnt #1 (fully model-driven)
                              ├─ NeuralAnt #2 (fully model-driven)
                              └─ NeuralAnt #N (fully model-driven)
                                   ↓
                              Each ant's neural network controls:
                              - Movement decisions
                              - Pheromone deposition
                              - Communication
                              - Mode switching
                              - Stopping conditions
```

**Benefits**:
- ✅ Ants learn optimal exploration strategies
- ✅ Emergent behaviors from multi-ant interactions
- ✅ Evolutionary selection of successful strategies
- ✅ Adaptive to different query types
- ✅ Collective intelligence exceeds individual capability

---

## Key Metrics

### Model Size
- **Parameters**: 23,764
- **ONNX file**: ~100 KB
- **Inference**: <1ms per ant per timestep (estimated)

### Observation Space
- **Total dimensions**: 51
  - Position context: 12
  - Local pheromones: 9
  - Resource state: 8
  - Nearby ants: 6
  - Hidden memory: 16

### Action Space
- **Movement**: 8 discrete actions
- **Pheromone**: 3 continuous values [0, 1]
- **Communication**: 4 continuous values [0, 1]
- **Mode**: 4 discrete modes

---

## Files Created

### Documentation
- `docs/NEURAL-ANT-SPEC.md` - Complete architecture specification
- `docs/NEURAL-ANT-PROGRESS.md` - This file

### Python (ML)
- `ml/neural_ant_model.py` - PyTorch model implementation
- `ml/export_neural_ant_onnx.py` - ONNX export script

### TypeScript (Runtime)
- `src/agents/neural-ant/neural-ant-types.ts` - Type definitions
- `src/agents/neural-ant/observation-builder.ts` - State → observation conversion

### Models
- `models/neural-ant/manifest.json` - Model configuration
- `models/neural-ant/neural_ant_v1.onnx` - Exported ONNX model (untrained)

---

## Status Summary

**Current state**: Foundation complete, ready for trace collection and training

**Next immediate action**: Create trace collection system to record heuristic ant behaviors

**Timeline estimate**:
- Trace collection: 1 day
- Imitation training: 1 day
- Runtime integration: 2 days
- A/B testing: 1 day
- **Total to first neural ants live**: ~5 days

**Blocker**: None - all dependencies in place, ready to proceed
