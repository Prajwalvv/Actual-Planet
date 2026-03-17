# GRU Training Workspace

Offline training workspace for the adaptive policy controller.

## Architecture

```
observation (Float32) ──┐
                        ├─► GRUCell ──► action_head   (6 classes)
role_embedding (16-dim) ┘     │    ├──► units_head    (2 classes)
                              │    ├──► confidence     (scalar)
hidden_state (96-dim) ◄───────┘    └──► value_head    (PPO only)
```

- **GRU hidden state** = short-term memory (resets per query)
- **Pheromone space** = long-term shared memory (persists across queries)
- **Role embeddings** = 16-dim learned vectors per action, concatenated with observation before GRU input
- **Personality embeddings** = deferred to Phase 3 (4-dim trait vector per role)

## Phase Order

1. Collect heuristic traces with `SWARM_POLICY_TRACE=1`
2. Inspect dataset with `dataset.py`
3. Train imitation GRU with `train_imitation.py` (includes train/val split, early stopping, gradient clipping)
4. Evaluate with `eval.py`
5. Export ONNX into `../models/gru/` with `export_onnx.py`
6. Run `policyMode=gru_shadow` in the Node service
7. Promote to `gru_live` after benchmark validation
8. Fine-tune with PPO using `replay_env.py` + `train_ppo.py`

## Files

| File | Description |
|------|-------------|
| `dataset.py` | JSONL trace loader, StepExample/TraceExample dataclasses, summarizer CLI |
| `train_imitation.py` | GruStepPolicy (GRUCell + role embeddings + 3 heads), AdamW, train/val split, early stopping, gradient clipping, best/final checkpointing |
| `eval.py` | Evaluate a checkpoint against held-out traces, reports action accuracy |
| `export_onnx.py` | Export PyTorch checkpoint → ONNX with role embedding input, writes manifest.json + action-map.json |
| `replay_env.py` | Replay environment for PPO: episode builder, reward shaping, GAE, rollout buffer, episode iterator |
| `train_ppo.py` | Recurrent PPO trainer: PPOPolicy wrapper with value head, PPO-clip with GAE, truncated BPTT |
| `requirements.txt` | Python dependencies |

## Expected Artifacts

- `../models/gru/manifest.json` — model config (enabled flag, I/O names, embedding dims)
- `../models/gru/gru_scheduler.onnx` — exported ONNX model
- `../models/gru/action-map.json` — action index → role ID mapping
- `../models/gru/normalization.json` — feature normalization metadata (populated after training)

## Commands

All commands run from the `swarm-core/` root.

### 1. Inspect traces

```bash
python3 ml/dataset.py --trace-dir runtime-artifacts/policy-traces
```

### 2. Train imitation GRU

```bash
python3 ml/train_imitation.py \
  --trace-dir runtime-artifacts/policy-traces \
  --output-dir ml/artifacts/imitation-v1 \
  --epochs 40 \
  --hidden-size 96 \
  --role-embedding-dim 16 \
  --val-split 0.15 \
  --patience 8 \
  --grad-clip 1.0
```

Saves `imitation_checkpoint.pt` (final) and `imitation_checkpoint_best.pt` (best val loss).

### 3. Evaluate

```bash
python3 ml/eval.py \
  --trace-dir runtime-artifacts/policy-traces \
  --checkpoint ml/artifacts/imitation-v1/imitation_checkpoint_best.pt
```

### 4. Export ONNX

```bash
python3 ml/export_onnx.py \
  --checkpoint ml/artifacts/imitation-v1/imitation_checkpoint_best.pt \
  --output-dir models/gru
```

This writes `gru_scheduler.onnx`, `manifest.json` (with `enabled: true`), and `action-map.json`.

### 5. Inspect replay episodes

```bash
python3 ml/replay_env.py --trace-dir runtime-artifacts/policy-traces
```

### 6. PPO fine-tuning

```bash
python3 ml/train_ppo.py \
  --trace-dir runtime-artifacts/policy-traces \
  --checkpoint ml/artifacts/imitation-v1/imitation_checkpoint_best.pt \
  --output-dir ml/artifacts/ppo-v1 \
  --total-updates 100 \
  --rollout-steps 4096 \
  --ppo-epochs 4 \
  --clip-epsilon 0.2 \
  --entropy-coef 0.01
```

### 7. Export PPO model to ONNX

```bash
python3 ml/export_onnx.py \
  --checkpoint ml/artifacts/ppo-v1/ppo_checkpoint_final.pt \
  --output-dir models/gru
```

## MacBook Pro M4 Pro Guidance

This project is trainable on an M4 Pro with 24GB RAM.

- **Good fit:** trace collection, imitation training (`hidden_size=96`, 20-40 epochs), ONNX export, eval, `gru_shadow`, small PPO runs
- **Accelerator:** PyTorch `mps` on Apple Silicon (auto-detected by `select_device()`)
- **Not a good first target:** large PPO sweeps with many parallel rollouts, big replay farms

## Notes

- Runtime ONNX inference is optional. If `manifest.json` has `enabled: false` or `onnxruntime-node` is missing, the service falls back to heuristic control.
- Training is intentionally decoupled from the Node API service.
- PPO checkpoints contain both the base GruStepPolicy state and the value head state, but only the base model state is needed for ONNX export.
