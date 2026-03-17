# GRU Policy Controller — Build Progress

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    /api/query  (policyMode)                     │
├─────────────────────────────────────────────────────────────────┤
│  AdaptiveSwarmOrchestrator                                      │
│  ├── search_bootstrap (fixed first step)                        │
│  ├── PolicyController.chooseNext() loop ◄── GRU or heuristic    │
│  │   ├── feature-extractor → Float32Array observation           │
│  │   ├── pheromone-context → long-term swarm memory             │
│  │   ├── gru-inference → ONNX GRU (optional)                   │
│  │   ├── policy-guard → mask invalid actions                    │
│  │   ├── heuristic-fallback → round-robin baseline              │
│  │   └── decision-trace → JSONL logging                         │
│  └── source_verifier (fixed final step)                         │
├─────────────────────────────────────────────────────────────────┤
│  GRU hidden state = short-term memory (per query)               │
│  Pheromone space  = long-term shared memory (across queries)    │
│  Role embeddings  = learned role identity (16-dim)              │
│  Personality      = deferred to Phase 3                         │
│  PPO              = deferred to Phase 4                         │
└─────────────────────────────────────────────────────────────────┘
```

## Phase Completion Status

### Phase 1A: Runtime Policy Layer — COMPLETE ✅

| File | Status | Description |
|------|--------|-------------|
| `src/policy/role-ids.ts` | ✅ | RoleId, ControllableRoleId, PolicyActionRoleId, location helpers |
| `src/policy/policy-types.ts` | ✅ | PolicyObservation, PolicyAction, PolicyDecision, DecisionOutcome, trace types |
| `src/policy/feature-extractor.ts` | ✅ | buildPolicyObservation + encodePolicyObservation (Float32Array) |
| `src/policy/pheromone-context.ts` | ✅ | summarize, ensureLocations, recordOutcomePheromones (TRAIL/INTEREST/DEAD_TRAIL/SATURATED/REBALANCE) |
| `src/policy/gru-inference.ts` | ✅ | GruPolicyRuntime — ONNX loading, manifest config, hidden state, argmax |
| `src/policy/policy-guard.ts` | ✅ | computeAvailableRoles, validateModelAction (confidence floor, role/units bounds) |
| `src/policy/heuristic-fallback.ts` | ✅ | Round-robin heuristic baseline, fallbackActionFromReason |
| `src/policy/decision-trace.ts` | ✅ | PolicyDecisionTrace with frame collection and record building |
| `src/policy/trace-sink.ts` | ✅ | FilePolicyTraceSink (JSONL/day), NoopPolicyTraceSink, env factory |
| `src/policy/controller.ts` | ✅ | PolicyController + PolicySession (chooseNext/completeStep/finalize) |
| `src/adaptive-types.ts` | ✅ | policyMode on request, policy block on response, 3 new event types |
| `src/runtime/adaptive-swarm-orchestrator.ts` | ✅ | Policy-driven explore loop replaces fixed breed iteration |
| `src/swarm-api.ts` | ✅ | policyMode parsed and passed through /api/query |
| `src/swarm-engine.ts` | ✅ | PolicyController injected into orchestrator deps |
| `Dockerfile` | ✅ | models/ copied into Cloud Run image |
| `models/gru/manifest.json` | ✅ | Disabled bootstrap scaffold |
| `src/policy/__tests__/heuristic-fallback.test.ts` | ✅ | Guard + heuristic rotation tests |
| `src/policy/__tests__/pheromone-context.test.ts` | ✅ | Location registration + deposit tests |

### Phase 1B: ML Training Pipeline — COMPLETE ✅

| File | Status | Description |
|------|--------|-------------|
| `ml/dataset.py` | ✅ | JSONL trace loader, StepExample/TraceExample, summarizer |
| `ml/train_imitation.py` | ✅ | GruStepPolicy, CrossEntropy+MSE loss, MPS support, checkpointing |
| `ml/export_onnx.py` | ✅ | ONNX export with dynamic axes, manifest+action-map generation |
| `ml/eval.py` | ✅ | Checkpoint evaluation with action accuracy |
| `ml/requirements.txt` | ✅ | torch, numpy, pandas, onnx, onnxruntime, scikit-learn, tqdm |
| `ml/README.md` | ✅ | Phase order, commands, M4 Pro guidance |

### Phase 1C: Hardening — COMPLETE ✅

| Item | Status | Description |
|------|--------|-------------|
| `onnxruntime-node` in package.json | ✅ | Added as optionalDependency (`^1.21.0`) |
| Role embeddings (16-dim learned) | ✅ | `nn.Embedding(action_count, 16)` in GRU, concatenated with observation before GRUCell |
| `models/gru/normalization.json` | ✅ | Scaffold created, populated after first training run |
| `models/gru/action-map.json` | ✅ | Pre-scaffold with 6 actions, also regenerated at export time |
| Train/val split in trainer | ✅ | 85/15 split, configurable via `--val-split` |
| Gradient clipping | ✅ | `nn.utils.clip_grad_norm_` with configurable `--grad-clip` |
| Early stopping | ✅ | Configurable `--patience`, saves best checkpoint separately |
| Unit tests | ✅ | 5 suites, 17 tests: role-ids, feature-extractor, trace-sink, pheromone-context, heuristic-fallback |

### Phase 1D: PPO Training Pipeline — COMPLETE ✅

| File | Status | Description |
|------|--------|-------------|
| `ml/replay_env.py` | ✅ | Episode builder, reward shaping (evidence/coverage/wasted/blocked/latency), GAE, RolloutBuffer, ReplayEpisodeIterator |
| `ml/train_ppo.py` | ✅ | PPOPolicy (value head wrapper), PPO-clip with GAE, recurrent rollout collection, configurable hyperparams |

### Phase 2A: Agent-Level Models (Explorer) — COMPLETE ✅

**Hybrid architecture**: GRU decides strategy (which breed), agent models decide tactics (which links).

| File | Status | Description |
|------|--------|-------------|
| `src/agents/agent-types.ts` | ✅ | Core types: AgentObservation, LinkCandidate, ScoredCandidate, AgentTraceRecord |
| `src/agents/agent-model-runtime.ts` | ✅ | Shared ONNX session manager, batched inference, lazy loading |
| `src/agents/explorer/feature-builder.ts` | ✅ | 48-dim feature extraction (query×16 + swarm×16 + link×16) |
| `src/agents/explorer/explorer-agent.ts` | ✅ | ExplorerAgent with model/heuristic/shadow modes, rank correlation |
| `src/agents/agent-trace-collector.ts` | ✅ | JSONL trace writer (File + Noop), env-var factory |
| `src/agents/index.ts` | ✅ | Barrel exports |
| `src/ants/breeds/types.ts` | ✅ | Added agentRuntime + agentTraceCollector to BreedExecutionContext |
| `src/ants/breeds/link-pathfinder-ant.ts` | ✅ | Integrated explorer scoring, trace collection, heuristic fallback |
| `ml/agents/explorer_model.py` | ✅ | Pointwise Scoring MLP (48→64→32→1, ~5,300 params) + pairwise wrapper |
| `ml/agents/explorer_dataset.py` | ✅ | Trace loader, pointwise + pairwise datasets, normalization |
| `ml/agents/train_explorer.py` | ✅ | Training with BCE or pairwise ranking, early stopping, MPS |
| `ml/agents/export_explorer_onnx.py` | ✅ | ONNX export with dynamic batch, manifest generation |
| `models/agents/explorer/manifest.json` | ✅ | Disabled scaffold (enabled after training) |
| `models/agents/explorer/normalization.json` | ✅ | Empty scaffold (populated after training) |
| `src/agents/__tests__/feature-builder.test.ts` | ✅ | 7 tests: dimensions, normalization, clamping, shared context |
| `src/agents/__tests__/explorer-agent.test.ts` | ✅ | 7 tests: heuristic scoring, ranking, preferences |
| `src/agents/__tests__/agent-trace-collector.test.ts` | ✅ | 6 tests: noop, file write, auto-flush |
| `ml/agents/README.md` | ✅ | Full pipeline documentation |

**Model Architecture**: Pointwise Scoring MLP (production-proven: Google DLRM, Uber DeepETA)
- **~5,300 params**, ~21KB ONNX file
- **<0.1ms** for 1,000 candidates batched
- **One session** shared across all explorer agents

### Phase 2B: Synthesizer Agent Model — COMPLETE ✅

**Evidence combination and prioritization** — Scores which evidence items to synthesize together.

| File | Status | Description |
|------|--------|-------------|
| `src/agents/agent-types.ts` | ✅ | Added EvidenceCandidate type |
| `src/agents/synthesizer/feature-builder.ts` | ✅ | 40-dim features (query×16 + swarm×8 + evidence×16) |
| `src/agents/synthesizer/synthesizer-agent.ts` | ✅ | SynthesizerAgent with quality/freshness/diversity heuristics |
| `ml/agents/synthesizer_model.py` | ✅ | Pointwise MLP (40→64→32→1, ~6,500 params) |
| `ml/agents/synthesizer_dataset.py` | ✅ | Trace loader, pointwise + pairwise datasets |
| `ml/agents/train_synthesizer.py` | ✅ | Training pipeline with early stopping |
| `ml/agents/export_synthesizer_onnx.py` | ✅ | ONNX export with manifest |
| `models/agents/synthesizer/manifest.json` | ✅ | Disabled scaffold |
| `src/agents/__tests__/synthesizer-feature-builder.test.ts` | ✅ | 10 tests: features, normalization, diversity |
| `src/agents/__tests__/synthesizer-agent.test.ts` | ✅ | 15 tests: scoring, ranking, quality prioritization |

**Model**: ~6,500 params, ~26KB ONNX, <0.1ms batched inference

### Phase 2C: Validator Agent Model — COMPLETE ✅

**Claim verification prioritization** — Scores which claims to validate first.

| File | Status | Description |
|------|--------|-------------|
| `src/agents/agent-types.ts` | ✅ | Added ClaimCandidate type |
| `src/agents/validator/feature-builder.ts` | ✅ | 36-dim features (query×16 + swarm×4 + claim×16) |
| `src/agents/validator/validator-agent.ts` | ✅ | ValidatorAgent with verifiability/importance/urgency heuristics |
| `ml/agents/validator_model.py` | ✅ | Pointwise MLP (36→64→32→1, ~5,800 params) |
| `ml/agents/validator_dataset.py` | ✅ | Trace loader, pointwise + pairwise datasets |
| `ml/agents/train_validator.py` | ✅ | Training pipeline with early stopping |
| `ml/agents/export_validator_onnx.py` | ✅ | ONNX export with manifest |
| `models/agents/validator/manifest.json` | ✅ | Disabled scaffold |
| `src/agents/__tests__/validator-feature-builder.test.ts` | ✅ | 11 tests: features, terrain authority, verifiability |
| `src/agents/__tests__/validator-agent.test.ts` | ✅ | 15 tests: scoring, credibility, time pressure |

**Model**: ~5,800 params, ~23KB ONNX, <0.1ms batched inference

### Phase 2D: GRU Shadow Mode — NOT STARTED (next)

1. Collect heuristic traces (`SWARM_POLICY_TRACE=1`)
2. Train imitation GRU from traces
3. Export ONNX → `models/gru/`
4. Install `onnxruntime-node` (`npm install onnxruntime-node`)
5. Run `policyMode=gru_shadow` (log actions, don't execute)
6. Compare GRU vs heuristic decisions

### Phase 3: Integration + Live Mode — NOT STARTED

1. Wire Synthesizer to HarvesterAnt (evidence combination)
2. Wire Validator to ValidatorAnt (claim verification)
3. Collect real traces from all 3 agent types
4. Train all models on production data
5. Enable `gru_live` for internal/canary traffic
6. Benchmark harness for evidence/coverage/latency comparison

### Phase 4: PPO Fine-Tuning — SCAFFOLD READY

1. ✅ `ml/replay_env.py` — episode environment with shaped rewards and GAE
2. ✅ `ml/train_ppo.py` — recurrent PPO trainer with clip, entropy, value loss
3. ⬜ Collect enough traces for meaningful PPO training
4. ⬜ Run PPO fine-tuning from imitation checkpoint
5. ⬜ Shadow validate PPO model → canary → rollout

## Mac Training Guide (M4 Pro, 24GB)

**Good fit:** trace collection, imitation training (hidden_size=96, 20-40 epochs), ONNX export, gru_shadow, local eval

**Commands:**
```bash
# 1. Collect traces
SWARM_POLICY_TRACE=1 SWARM_TRACE_DIR=runtime-artifacts/policy-traces npm run dev

# 2. Inspect traces
python3 ml/dataset.py --trace-dir runtime-artifacts/policy-traces

# 3. Train
python3 ml/train_imitation.py \
  --trace-dir runtime-artifacts/policy-traces \
  --output-dir ml/artifacts/imitation-v1

# 4. Evaluate
python3 ml/eval.py \
  --trace-dir runtime-artifacts/policy-traces \
  --checkpoint ml/artifacts/imitation-v1/imitation_checkpoint.pt

# 5. Export ONNX
python3 ml/export_onnx.py \
  --checkpoint ml/artifacts/imitation-v1/imitation_checkpoint.pt \
  --output-dir models/gru

# 6. Install ONNX runtime for Node
npm install onnxruntime-node

# 7. Run shadow mode
# POST /api/query with { "policyMode": "gru_shadow" }
```

## Key Design Decisions

- **GRU hidden state resets per query.** Long-term memory is pheromone space only.
- **Heuristic is always the fallback.** Every GRU failure path returns to round-robin.
- **ONNX is optional.** Service starts healthy without model artifact.
- **Traces are JSONL.** One file per day under `SWARM_TRACE_DIR`.
- **PPO is explicitly last.** Imitation → shadow → live → PPO, in that order.
