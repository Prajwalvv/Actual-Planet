# Agent-Level Models — Training Pipeline

Per-ant neural networks for tactical decisions. Each agent type has its own small model.

## Architecture: Pointwise Scoring MLP

```
Input: [query_context(16) | swarm_context(16) | link_features(16)] = 48 dims
       ↓
  Linear(48 → 64) → ReLU → Dropout(0.1)
       ↓
  Linear(64 → 32) → ReLU → Dropout(0.1)
       ↓
  Linear(32 → 1) → score
```

- **~5,300 parameters** — 21KB ONNX file
- **<0.1ms** for 1,000 candidates batched
- **One ONNX session** shared across all agents of the same type

## Explorer Agent

Scores link candidates for the `LinkPathfinderAnt`. Higher score = more promising link.

### Collect Traces

```bash
SWARM_AGENT_TRACE=1 SWARM_AGENT_TRACE_DIR=runtime-artifacts/agent-traces npm run dev
```

Run queries as normal. Each `link_pathfinder` execution logs:
- Observation (swarm state at decision time)
- All link candidates with feature vectors
- Selected candidates and their outcomes

### Train

```bash
cd ml/agents
python3 train_explorer.py \
  --trace-dir ../../runtime-artifacts/agent-traces \
  --output-dir ../artifacts/explorer-v1 \
  --mode pairwise \
  --epochs 30 \
  --batch-size 128
```

**Training modes:**
- `pairwise` (default): Margin ranking loss — learns relative ordering (better quality)
- `pointwise`: BCE loss — learns absolute score prediction

**MacBook Pro M4 Pro**: ~30s for 10K examples (uses MPS automatically).

### Export to ONNX

```bash
python3 export_explorer_onnx.py \
  --checkpoint ../artifacts/explorer-v1/explorer_checkpoint.pt \
  --output-dir ../../models/agents/explorer
```

### Enable in Node.js

1. `npm install onnxruntime-node`
2. Set `enabled: true` in `models/agents/explorer/manifest.json`
3. Pass `agentRuntime` in `BreedExecutionContext`

Agent auto-detects: model if ONNX is loaded, heuristic otherwise.

## Files

| File | Purpose |
|------|---------|
| `explorer_model.py` | PyTorch model definition (MLP scorer + pairwise wrapper) |
| `explorer_dataset.py` | Trace JSONL loader, pointwise & pairwise datasets |
| `train_explorer.py` | Training script with early stopping, grad clipping |
| `export_explorer_onnx.py` | ONNX export with manifest generation |

## Feature Layout (48 dims)

| Range | Category | Features |
|-------|----------|----------|
| 0–15 | Query context | query length, symbol count, terrain one-hot(7), depth one-hot(3), time budget, coverage, frontier size, evidence count |
| 16–31 | Swarm context | source diversity, pheromone signals, step progress, usefulness, blocked ratio, binary flags |
| 32–47 | Link features | domain seen, depth, has title/snippet, terrain match, priority, domain authority, URL depth, same origin, content type, provider reliability, freshness, query relevance, URL length, HTTPS |

## Synthesizer Agent

Scores evidence candidates for combination/synthesis. Higher score = more valuable for final output.

**Architecture**: 40 → 64 → 32 → 1 (~6,500 params, ~26KB ONNX)

**Features (40 dims)**:
- Query context [0-15]: same as explorer
- Swarm context [16-23]: source diversity, usefulness, coverage gap, time flags
- Evidence features [24-39]: confidence, freshness, source score, relevance, entity/phrase/claim counts, corroboration, sentiment, terrain match, quality score

**Training**:
```bash
python3 train_synthesizer.py \
  --trace-dir ../../runtime-artifacts/agent-traces \
  --output-dir ../artifacts/synthesizer-v1 \
  --mode pairwise \
  --epochs 50
```

**Export**:
```bash
python3 export_synthesizer_onnx.py \
  --model-path ../artifacts/synthesizer-v1/synthesizer_model.pt \
  --output-dir ../../models/agents/synthesizer
```

## Validator Agent

Scores claim candidates for verification priority. Higher score = more important to validate.

**Architecture**: 36 → 64 → 32 → 1 (~5,800 params, ~23KB ONNX)

**Features (36 dims)**:
- Query context [0-15]: same as explorer
- Swarm context [16-19]: usefulness, coverage, time budget, evidence count
- Claim features [20-35]: source confidence/credibility, mention count, has specifics, verifiability, complexity, terrain authority, importance, urgency

**Training**:
```bash
python3 train_validator.py \
  --trace-dir ../../runtime-artifacts/agent-traces \
  --output-dir ../artifacts/validator-v1 \
  --mode pairwise \
  --epochs 50
```

**Export**:
```bash
python3 export_validator_onnx.py \
  --model-path ../artifacts/validator-v1/validator_model.pt \
  --output-dir ../../models/agents/validator
```

## All Agent Models Summary

| Agent | Input Dims | Params | ONNX Size | Purpose |
|-------|-----------|--------|-----------|---------|
| Explorer | 48 | ~5,300 | ~21KB | Link selection priority |
| Synthesizer | 40 | ~6,500 | ~26KB | Evidence combination priority |
| Validator | 36 | ~5,800 | ~23KB | Claim verification priority |

**Total**: ~17,600 params, ~70KB ONNX for all 3 models combined

## Next Agent Types

Same pattern for each new breed:
1. Define features in `src/agents/<type>/feature-builder.ts`
2. Create agent wrapper in `src/agents/<type>/<type>-agent.ts`
3. Add training scripts in `ml/agents/`
4. Integrate into the breed's `run()` method
