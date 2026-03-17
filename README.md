# Actual Planet 🌍🐜

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-49.0%25-blue)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-13.4%25-yellow)](https://www.python.org/)
[![Website](https://img.shields.io/badge/Website-actualplanet.com-00d4ff)](https://actualplanet.com)

> **A research project exploring swarm intelligence through neural ant colonies, adaptive multi-agent systems, and machine learning for emergent collective behavior patterns**

🌐 **Website**: [actualplanet.com](https://actualplanet.com) | 📖 **GitHub**: [Prajwalvv/Actual-Planet](https://github.com/Prajwalvv/Actual-Planet)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Core Concepts](#core-concepts)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Key Components](#key-components)
- [Research Foundation](#research-foundation)
- [Machine Learning Pipeline](#machine-learning-pipeline)
- [Installation & Setup](#installation--setup)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Development Workflow](#development-workflow)
- [Research Papers](#research-papers)
- [Contributing](#contributing)
- [License](#license)

---

## 🎯 Overview

**Actual Planet** is a cutting-edge research platform that implements **stigmergic computing** - a bio-inspired computational paradigm where simple, non-intelligent agents coordinate through environmental modifications (pheromones) to solve complex problems. This project bridges theoretical swarm intelligence research with practical machine learning applications.

### What This Project Does

1. **Swarm Intelligence Engine**: Simulates ant colony behavior for distributed problem-solving
2. **Neural Agent Training**: Trains recurrent neural networks (GRU) to control individual ant behavior
3. **Adaptive Orchestration**: Dynamically allocates computational resources based on query complexity
4. **Emergent Behavior Research**: Studies how collective intelligence emerges from simple agent interactions
5. **Real-time Discovery**: Implements web-scale information retrieval using swarm algorithms

### Why This Matters

Traditional AI systems rely on centralized control and explicit programming. **Actual Planet** explores an alternative paradigm:
- **Decentralized**: No single point of control
- **Emergent**: Complex behaviors arise from simple rules
- **Adaptive**: System self-organizes based on environmental feedback
- **Scalable**: Performance improves with more agents
- **Robust**: Graceful degradation when agents fail

---

## 🧠 Core Concepts

### 1. Stigmergy

**Definition**: Indirect coordination through environmental modification.

**In Nature**: Ants deposit pheromone trails. Other ants follow stronger trails, reinforcing successful paths.

**In This Project**: 
- Ants deposit virtual pheromones in a shared memory space
- Pheromones encode information about resource quality, exploration paths, and dead-ends
- Trails evaporate over time, allowing the system to adapt to changing conditions

**Implementation**: `src/pheromone-space.ts` and `src/redis-pheromone-space.ts`

---

### 2. Multi-Agent System

**Agents in This System**:

#### **Ants** (Worker Agents)
- **Explorer Ants**: Discover new information sources
- **Harvester Ants**: Extract structured data from sources
- **Validator Ants**: Verify claim accuracy and source credibility
- **Synthesizer Ants**: Combine findings into coherent answers
- **Sentiment Ants**: Analyze emotional tone and opinion
- **Price/Volume Ants**: Track quantitative metrics

Each ant type has:
- **Breed-specific behavior**: Defined in `src/ants/breeds/`
- **Neural policy**: Optional ML-driven decision-making
- **Pheromone interaction**: Reads and writes to shared memory
- **Energy budget**: Limited resources force efficient exploration

#### **Meta-Agents** (Orchestrators)
- **Policy Controller**: Decides which ant types to deploy (`src/policy/controller.ts`)
- **Query Planner**: Analyzes query intent and selects terrain (`src/planner/`)
- **Swarm Orchestrator**: Manages agent lifecycle and resource allocation (`src/runtime/adaptive-swarm-orchestrator.ts`)

---

### 3. Neural Ant Architecture

**Motivation**: Replace hardcoded heuristics with learned behavior.

**Current State**: Hybrid system
- Ants use heuristics for behavior
- ML models score candidates (e.g., link quality, claim validity)

**Target State**: Fully neural ants
- GRU network controls all ant decisions
- Observation space: 51 dimensions (position, pheromones, resources, nearby ants)
- Action space: 9 outputs (movement, pheromone deposit, communication, mode)
- Training: Imitation learning → Reinforcement learning (PPO) → Evolution

**Why GRU?**
- Maintains memory across timesteps (remembers exploration history)
- Lightweight (~50K parameters per ant)
- Fast inference for real-time control

**See**: `docs/NEURAL-ANT-SPEC.md` for complete specification

---

### 4. Adaptive Policy Learning

**Problem**: How does the swarm decide which ant types to deploy?

**Solution**: Train a GRU-based scheduler that learns from experience.

**Pipeline**:
1. **Trace Collection**: Record (state, action, outcome) from heuristic controller
2. **Imitation Learning**: Train GRU to mimic heuristic decisions (90%+ accuracy)
3. **Shadow Mode**: Run GRU in parallel, compare to heuristic
4. **Live Deployment**: Replace heuristic with GRU
5. **PPO Fine-tuning**: Optimize for query-specific rewards

**Observation Features** (input to GRU):
- Query complexity, terrain type, depth mode
- Current evidence count, coverage ratio, frontier size
- Pheromone trail strength, ant density
- Resource quality, success rate

**Actions** (output from GRU):
- Which ant breed to spawn next
- How many units (1-5 ants)
- Confidence in decision

**See**: `ml/README.md` for training instructions

---

## 🏗️ Architecture

### System Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Layer                            │
│  (Web Dashboard, API Consumers, Firebase Auth)              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   API Gateway Layer                         │
│  (Express Server, WebSocket, Rate Limiting, Auth)           │
│  File: src/swarm-api.ts                                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                 Orchestration Layer                         │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │Query Planner│  │Policy Control│  │Swarm Manager │       │
│  └─────────────┘  └──────────────┘  └──────────────┘       │
│  Files: planner/, policy/, runtime/                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Agent Layer                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐             │
│  │Explor│ │Harves│ │Valida│ │Synthe│ │Sentim│ ...          │
│  │er Ant│ │ter   │ │tor   │ │sizer │ │ent   │              │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘              │
│  Files: ants/, agents/                                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  Memory & State Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Pheromone     │  │Firestore     │  │Redis Cache   │      │
│  │Space (Redis) │  │(User/Credits)│  │(Rate Limits) │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  Files: pheromone-space.ts, firebase-config.ts              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  External Services                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Web Scrape│  │Search API│  │ML Models │  │Browser   │   │
│  │(Puppeteer│  │(Providers│  │(ONNX)    │  │Pool      │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User Query → Query Planner → Policy Controller → Spawn Ants
                                                      ↓
                                            Ants explore web
                                                      ↓
                                         Deposit pheromones
                                                      ↓
                                    Other ants follow trails
                                                      ↓
                                      Evidence accumulates
                                                      ↓
                                    Synthesizer combines
                                                      ↓
                                      Return to user
```

---

## 📁 Project Structure

```
actual-planet/
├── swarm-core/                    # Main TypeScript application
│   ├── src/
│   │   ├── swarm-api.ts          # 🌐 Express API server (58KB - main entry)
│   │   ├── swarm-engine.ts       # 🧠 Core swarm logic
│   │   ├── types.ts              # 📝 TypeScript type definitions
│   │   │
│   │   ├── ants/                 # 🐜 Ant implementations
│   │   │   ├── breeds/           # Specialized ant types
│   │   │   │   ├── explorer-ant.ts      # Discovers new sources
│   │   │   │   ├── validator-ant.ts     # Verifies claims
│   │   │   │   ├── synthesizer-ant.ts   # Combines evidence
│   │   │   │   ├── search-bootstrap-ant.ts  # Initial search
│   │   │   │   ├── link-pathfinder-ant.ts   # Follows links
│   │   │   │   ├── docs-reader-ant.ts       # Reads documentation
│   │   │   │   ├── news-reader-ant.ts       # Analyzes news
│   │   │   │   ├── forum-thread-ant.ts      # Parses forums
│   │   │   │   ├── paper-abstract-ant.ts    # Extracts from papers
│   │   │   │   └── source-verifier-ant.ts   # Checks credibility
│   │   │   ├── harvester-ant.ts  # Data extraction
│   │   │   ├── sentiment-ant.ts  # Opinion analysis
│   │   │   ├── price-ant.ts      # Price tracking
│   │   │   └── volume-ant.ts     # Volume metrics
│   │   │
│   │   ├── agents/               # 🤖 Neural agent system
│   │   │   ├── neural-ant/       # Neural ant implementation
│   │   │   │   ├── neural-ant-types.ts
│   │   │   │   └── observation-builder.ts
│   │   │   ├── explorer/         # Explorer agent with ML
│   │   │   ├── synthesizer/      # Synthesizer agent with ML
│   │   │   ├── validator/        # Validator agent with ML
│   │   │   ├── agent-types.ts
│   │   │   └── agent-trace-collector.ts  # Training data collection
│   │   │
│   │   ├── policy/               # 🎯 Decision-making system
│   │   │   ├── controller.ts     # Main policy controller
│   │   │   ├── gru-inference.ts  # Neural policy execution
│   │   │   ├── heuristic-fallback.ts  # Rule-based backup
│   │   │   ├── feature-extractor.ts   # State → features
│   │   │   ├── pheromone-context.ts   # Pheromone state
│   │   │   ├── decision-trace.ts      # Training trace format
│   │   │   └── trace-sink.ts          # Trace persistence
│   │   │
│   │   ├── runtime/              # ⚙️ Orchestration
│   │   │   ├── adaptive-swarm-orchestrator.ts  # Main orchestrator
│   │   │   ├── query-router.ts   # Query classification
│   │   │   ├── model-shard-manager.ts  # ML model loading
│   │   │   ├── topic-resolver.ts # Topic extraction
│   │   │   └── qos.ts            # Quality of service
│   │   │
│   │   ├── planner/              # 🗺️ Query planning
│   │   │   ├── query-intent-classifier.ts  # Intent detection
│   │   │   └── query-terrain-planner.ts    # Terrain selection
│   │   │
│   │   ├── pheromone-space.ts    # 💾 In-memory pheromone store
│   │   ├── redis-pheromone-space.ts  # Redis-backed store
│   │   │
│   │   ├── discovery/            # 🔍 URL discovery & frontier
│   │   │   ├── frontier.ts       # Priority queue for URLs
│   │   │   ├── provider.ts       # Search provider interface
│   │   │   ├── provider-registry.ts  # Available providers
│   │   │   ├── policy-engine.ts  # URL filtering rules
│   │   │   ├── url-policy.ts     # URL validation
│   │   │   └── robots-cache.ts   # robots.txt compliance
│   │   │
│   │   ├── extractors/           # 📄 Content extraction
│   │   │   ├── terrain-adapter.ts  # Terrain-specific extraction
│   │   │   └── adapters/         # Per-terrain extractors
│   │   │       ├── generic-web-adapter.ts
│   │   │       ├── docs-adapter.ts
│   │   │       ├── news-adapter.ts
│   │   │       ├── forum-adapter.ts
│   │   │       └── paper-adapter.ts
│   │   │
│   │   ├── ranking/              # 📊 Evidence ranking
│   │   │   ├── evidence-ranker.ts    # Score evidence quality
│   │   │   ├── source-quality.ts     # Domain reputation
│   │   │   └── noise-suppressor.ts   # Filter low-quality
│   │   │
│   │   ├── nlp/                  # 🔤 Natural language processing
│   │   │   ├── phrase-miner.ts   # Extract key phrases
│   │   │   ├── topic-normalizer.ts  # Normalize topics
│   │   │   └── cooccurrence-ranker.ts  # Term relationships
│   │   │
│   │   ├── memory/               # 🧩 Memory management
│   │   │   ├── query-overlay.ts  # Per-query memory
│   │   │   └── promotion-manager.ts  # Short→long term
│   │   │
│   │   ├── resolver/             # 🎨 Result processing
│   │   │   ├── normalization.ts  # Normalize outputs
│   │   │   └── noise-filter.ts   # Remove duplicates
│   │   │
│   │   ├── browser-pool.ts       # 🌐 Puppeteer pool manager
│   │   ├── firebase-config.ts    # 🔥 Firebase Admin SDK
│   │   └── adaptive-types.ts     # 📐 Shared type definitions
│   │
│   ├── ml/                       # 🤖 Machine learning pipeline
│   │   ├── dataset.py            # Training data loader
│   │   ├── train_imitation.py    # Supervised learning
│   │   ├── train_ppo.py          # Reinforcement learning
│   │   ├── eval.py               # Model evaluation
│   │   ├── export_onnx.py        # ONNX export
│   │   ├── replay_env.py         # RL environment
│   │   ├── neural_ant_model.py   # Neural ant GRU model
│   │   ├── export_neural_ant_onnx.py  # Neural ant export
│   │   ├── agents/               # Agent-specific models
│   │   │   ├── explorer/
│   │   │   ├── validator/
│   │   │   └── synthesizer/
│   │   └── artifacts/            # Training outputs
│   │
│   ├── models/                   # 🎓 Trained models (ONNX)
│   │   ├── gru/                  # Policy controller models
│   │   │   ├── gru_scheduler.onnx
│   │   │   ├── manifest.json
│   │   │   ├── action-map.json
│   │   │   └── normalization.json
│   │   ├── neural-ant/           # Neural ant models
│   │   │   ├── neural_ant_v1.onnx
│   │   │   └── manifest.json
│   │   └── agents/               # Agent models
│   │       ├── explorer/
│   │       ├── validator/
│   │       └── synthesizer/
│   │
│   ├── public/                   # 🎨 Web dashboard
│   │   ├── dashboard.html        # Admin dashboard
│   │   └── site/                 # React-based console
│   │       ├── index.html        # Landing page
│   │       ├── console.html      # User console
│   │       ├── playground.html   # API playground
│   │       ├── firebase-init.js  # Firebase client SDK
│   │       └── src/              # React components
│   │
│   ├── docs/                     # 📚 Documentation
│   │   ├── NEURAL-ANT-SPEC.md    # Neural ant architecture
│   │   └── NEURAL-ANT-PROGRESS.md  # Implementation status
│   │
│   ├── runtime-artifacts/        # 📦 Runtime outputs
│   │   ├── policy-traces/        # Policy training data
│   │   └── agent-traces/         # Agent training data
│   │
│   ├── scripts/                  # 🚀 Deployment scripts
│   │   ├── deploy-hosting.sh     # Firebase Hosting
│   │   ├── deploy-cloudrun.sh    # Google Cloud Run
│   │   └── deploy-firestore.sh   # Firestore rules
│   │
│   ├── package.json              # Node dependencies
│   ├── tsconfig.json             # TypeScript config
│   ├── firebase.json             # Firebase config
│   └── Dockerfile                # Container definition
│
├── research papers/              # 📖 Academic papers (22 PDFs)
│   ├── A brief history of stigmergy.pdf
│   ├── Ant Colony Optimization.pdf
│   ├── Collective Behavior in Biophysical Systems.pdf
│   └── ... (19 more papers)
│
├── output/                       # 📝 Extracted paper summaries
│   └── paper_extractions/        # Markdown summaries (44 files)
│       ├── 01_the_principles_of_collective_animal_behavior.md
│       ├── 02_the_ecology_of_collective_behavior.md
│       └── ... (42 more files)
│
├── .gitignore                    # Git ignore rules
├── .env.example                  # Environment template
├── LICENSE                       # AGPL-3.0 license
├── SECURITY-WARNING.md           # Security notes
├── GIT-WORKFLOW-GUIDE.md         # Git workflow
└── README.md                     # This file
```

---

## 🔑 Key Components

### 1. Swarm API (`src/swarm-api.ts`)

**Purpose**: Main HTTP/WebSocket server exposing swarm intelligence as a service.

**Key Features**:
- RESTful API for query submission
- WebSocket for real-time updates
- Firebase authentication
- Credit-based usage tracking
- Rate limiting (Redis-backed)
- Admin endpoints for system stats

**Endpoints**:
```typescript
POST   /api/query          // Submit query, get swarm result
GET    /api/me             // User profile & credits
POST   /api/keys           // Generate API key
GET    /api/keys           // List API keys
DELETE /api/keys/:id       // Revoke API key
GET    /api/usage          // Usage statistics
POST   /api/sync-user      // Sync Firebase user
GET    /api/admin/users    // Admin: list users
GET    /api/admin/stats    // Admin: system stats
```

**WebSocket Protocol**:
```typescript
// Client → Server
{ type: 'query', query: string, model: string }

// Server → Client
{ type: 'progress', stage: string, percent: number }
{ type: 'evidence', item: Evidence }
{ type: 'complete', result: QueryResult }
{ type: 'error', message: string }
```

---

### 2. Pheromone Space (`src/pheromone-space.ts`)

**Purpose**: Shared memory where ants deposit and read pheromones.

**Data Structure**:
```typescript
interface PheromoneDeposit {
  position: string;        // URL or topic identifier
  type: 'trail' | 'interest' | 'dead';
  strength: number;        // 0-1, decays over time
  metadata: {
    quality?: number;      // Resource quality
    depth?: number;        // Search depth
    timestamp: number;     // Deposition time
  };
}
```

**Operations**:
- `deposit(position, type, strength, metadata)`: Add pheromone
- `read(position)`: Get pheromone strength at location
- `evaporate(rate)`: Decay all pheromones
- `getGradient(position)`: Find strongest nearby trail

**Implementations**:
- **In-memory**: Fast, single-instance (`pheromone-space.ts`)
- **Redis**: Persistent, multi-instance (`redis-pheromone-space.ts`)

---

### 3. Policy Controller (`src/policy/controller.ts`)

**Purpose**: Decides which ant types to spawn based on current state.

**Modes**:
1. **Heuristic**: Rule-based decisions (baseline)
2. **GRU Shadow**: ML model runs in parallel, logs differences
3. **GRU Live**: ML model makes decisions

**Decision Process**:
```typescript
State → Feature Extraction → GRU Inference → Action
  ↓                              ↓              ↓
Pheromones              Hidden State      Spawn Ant
Evidence Count          (96-dim)          (breed + units)
Frontier Size
```

**Features Extracted** (input to GRU):
- Query complexity (length, depth mode)
- Terrain type (web, docs, news, forum, paper)
- Current evidence (count, coverage, quality)
- Pheromone state (trail strength, diversity)
- Ant population (active count, success rate)
- Resource state (frontier size, blocked ratio)

**Actions** (output from GRU):
- Ant breed to spawn (6 options: explorer, harvester, validator, etc.)
- Number of units (1-5 ants)
- Confidence score (0-1)

---

### 4. Adaptive Swarm Orchestrator (`src/runtime/adaptive-swarm-orchestrator.ts`)

**Purpose**: Manages ant lifecycle, resource allocation, and query execution.

**Responsibilities**:
- Initialize swarm for query
- Spawn ants based on policy decisions
- Monitor ant progress
- Collect evidence
- Terminate when complete or timeout
- Clean up resources

**Lifecycle**:
```
Query Received
    ↓
Initialize Pheromone Space
    ↓
Query Planner → Select Terrain
    ↓
Policy Controller → Spawn Initial Ants
    ↓
┌─────────────────────────────┐
│ Ant Execution Loop          │
│  1. Ants explore            │
│  2. Deposit pheromones      │
│  3. Collect evidence        │
│  4. Policy spawns more ants │
│  5. Repeat until done       │
└─────────────────────────────┘
    ↓
Synthesizer Combines Evidence
    ↓
Return Result to User
```

---

### 5. Neural Ant Model (`ml/neural_ant_model.py`)

**Purpose**: GRU-based neural network that controls individual ant behavior.

**Architecture**:
```python
class NeuralAntPolicy(nn.Module):
    def __init__(self):
        self.gru = nn.GRUCell(input_size=51, hidden_size=64)
        self.movement_head = nn.Linear(64, 8)      # 8 movement actions
        self.pheromone_head = nn.Linear(64, 3)     # 3 pheromone values
        self.communication_head = nn.Linear(64, 4) # 4 communication values
        self.mode_head = nn.Linear(64, 4)          # 4 mode switches
    
    def forward(self, observation, hidden_state):
        # observation: [batch, 51] - ant's view of world
        # hidden_state: [batch, 64] - recurrent memory
        
        hidden_next = self.gru(observation, hidden_state)
        
        movement = F.softmax(self.movement_head(hidden_next), dim=-1)
        pheromone = torch.sigmoid(self.pheromone_head(hidden_next))
        communication = torch.sigmoid(self.communication_head(hidden_next))
        mode = F.softmax(self.mode_head(hidden_next), dim=-1)
        
        return {
            'movement': movement,
            'pheromone': pheromone,
            'communication': communication,
            'mode': mode,
            'hidden_next': hidden_next
        }
```

**Training Pipeline**:
1. **Imitation Learning**: Learn from heuristic ant traces
2. **PPO Fine-tuning**: Optimize for query success rewards
3. **Evolution**: Mutate and select best-performing ants

---

## 🔬 Research Foundation

This project is built on 22 academic papers covering:

### Core Topics

1. **Stigmergy & Self-Organization**
   - "A Brief History of Stigmergy" - Foundational concepts
   - "Ant Algorithms and Stigmergy" - Computational applications
   - "From Natural to Artificial Systems" - Bio-inspired computing

2. **Collective Behavior**
   - "The Principles of Collective Animal Behavior" - Theoretical framework
   - "The Ecology of Collective Behavior" - Environmental interactions
   - "Collective Motion as a Distinct Behavioral State" - Movement patterns

3. **Decision Making**
   - "Honeybee Democracy" - Consensus mechanisms
   - "Group Decision Making in Nest Site Selection" - Distributed decisions
   - "The Geometry of Decision Making in Individuals and Collectives"

4. **Ant Colony Optimization**
   - "Ant Colony Optimization: Artificial Ants as a Computational Intelligence Technique"
   - "A Survey of Model Classification" - ACO variants

5. **Emergent Phenomena**
   - "Morphogenesis of Termite Mounds" - Structural emergence
   - "Quorum Sensing and Its Role in Mediating Interkingdom Interactions"
   - "Control Pseudomonas Aeruginosa Collective Behaviors"

**All papers are in**: `research papers/` (PDFs) and `output/paper_extractions/` (summaries)

---

## 🤖 Machine Learning Pipeline

### Phase 1: Imitation Learning

**Goal**: Train GRU to mimic heuristic controller decisions.

**Steps**:
```bash
# 1. Collect traces from heuristic controller
SWARM_POLICY_TRACE=1 npm run api

# 2. Inspect collected data
python3 ml/dataset.py --trace-dir runtime-artifacts/policy-traces

# 3. Train imitation model
python3 ml/train_imitation.py \
  --trace-dir runtime-artifacts/policy-traces \
  --output-dir ml/artifacts/imitation-v1 \
  --epochs 40 \
  --hidden-size 96 \
  --role-embedding-dim 16

# 4. Evaluate accuracy
python3 ml/eval.py \
  --checkpoint ml/artifacts/imitation-v1/imitation_checkpoint_best.pt

# 5. Export to ONNX
python3 ml/export_onnx.py \
  --checkpoint ml/artifacts/imitation-v1/imitation_checkpoint_best.pt \
  --output-dir models/gru
```

**Expected Accuracy**: 90%+ on held-out traces

---

### Phase 2: Reinforcement Learning (PPO)

**Goal**: Optimize policy for query success, not just imitation.

**Reward Function**:
```python
reward = (
    +1.0 * high_quality_evidence_found
    +0.5 * new_domain_discovered
    +0.3 * topic_coverage_increase
    -0.1 * failed_fetch
    -0.05 * timestep  # Efficiency pressure
    +2.0 * query_completion_bonus
)
```

**Training**:
```bash
python3 ml/train_ppo.py \
  --trace-dir runtime-artifacts/policy-traces \
  --checkpoint ml/artifacts/imitation-v1/imitation_checkpoint_best.pt \
  --output-dir ml/artifacts/ppo-v1 \
  --total-updates 100 \
  --rollout-steps 4096 \
  --ppo-epochs 4
```

---

### Phase 3: Evolution

**Goal**: Discover novel ant behaviors through mutation and selection.

**Algorithm**:
1. Initialize population of 100 neural ants
2. Evaluate fitness (cumulative reward over 10 queries)
3. Select top 20% ants
4. Mutate weights (Gaussian noise, σ=0.01)
5. Crossover (blend weights from 2 parents)
6. Repeat for 10 generations

**Expected Outcomes**:
- Behavioral diversity (clustering, specialization)
- Emergent communication protocols
- Adaptive strategies per query type

---

## 🚀 Installation & Setup

### Prerequisites

- **Node.js**: v20+ (TypeScript runtime)
- **Python**: 3.9+ (ML training)
- **Redis**: 5+ (optional, for pheromone persistence)
- **Firebase**: Project with Firestore + Auth

### 1. Clone Repository

```bash
git clone https://github.com/Prajwalvv/Actual-Planet.git
cd Actual-Planet/swarm-core
```

### 2. Install Dependencies

**Node.js**:
```bash
npm install
```

**Python** (for ML training):
```bash
cd ml
pip install -r requirements.txt
cd ..
```

### 3. Configure Environment

Copy `.env.example` to `.env` and fill in:

```bash
# Firebase Configuration
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
FIREBASE_MEASUREMENT_ID=your_measurement_id

# Firebase Admin SDK (path to service account JSON)
FIREBASE_SERVICE_ACCOUNT_PATH=./path/to/serviceAccount.json

# Redis (optional)
REDIS_URL=redis://localhost:6379

# API Configuration
API_PORT=3388
NODE_ENV=development
```

**Important**: Never commit your service account JSON file! It's in `.gitignore`.

### 4. Build TypeScript

```bash
npm run build
```

### 5. Start Server

**Development** (with auto-reload):
```bash
npm run dev
```

**Production**:
```bash
npm start
```

Server runs on `http://localhost:3388`

---

## 📖 Usage

### API Query

```bash
curl -X POST http://localhost:3388/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the latest developments in quantum computing?",
    "model": "discover",
    "depth": "standard"
  }'
```

**Response**:
```json
{
  "answer": "Recent developments in quantum computing include...",
  "evidence": [
    {
      "claim": "Google achieved quantum supremacy in 2023",
      "source": "https://example.com/quantum-news",
      "confidence": 0.92,
      "timestamp": "2023-10-15"
    }
  ],
  "metadata": {
    "queryTime": 4523,
    "evidenceCount": 12,
    "sourcesVisited": 45,
    "antsSpawned": 23
  }
}
```

### WebSocket (Real-time)

```javascript
const ws = new WebSocket('ws://localhost:3388');

ws.send(JSON.stringify({
  type: 'query',
  query: 'Explain swarm intelligence',
  model: 'discover'
}));

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  if (msg.type === 'progress') {
    console.log(`Progress: ${msg.stage} - ${msg.percent}%`);
  } else if (msg.type === 'evidence') {
    console.log('New evidence:', msg.item);
  } else if (msg.type === 'complete') {
    console.log('Result:', msg.result);
  }
};
```

### Dashboard

Open `http://localhost:3388/dashboard.html` for admin interface.

---

## 🛠️ Development Workflow

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

### Trace Collection

**Policy traces** (for GRU training):
```bash
SWARM_POLICY_TRACE=1 npm run dev
# Submit queries via API
# Traces saved to runtime-artifacts/policy-traces/
```

**Agent traces** (for neural ant training):
```bash
SWARM_AGENT_TRACE=1 npm run dev
# Traces saved to runtime-artifacts/agent-traces/
```

### Training Models

See `ml/README.md` for detailed ML pipeline instructions.

### Deployment

**Firebase Hosting**:
```bash
npm run deploy:hosting
```

**Google Cloud Run**:
```bash
npm run deploy:cloudrun
```

**Firestore Rules**:
```bash
npm run deploy:firestore
```

**All at once**:
```bash
npm run deploy:all
```

---

## 📚 API Reference

### Models

- **`discover`**: General-purpose discovery (default)
- **`precise`**: High-precision, slower search
- **`correlate`**: Find relationships between topics
- **`sentiment`**: Analyze opinions and emotions
- **`full`**: Comprehensive analysis (all models)

### Depth Modes

- **`quick`**: Fast, shallow search (1-2 minutes)
- **`standard`**: Balanced depth (3-5 minutes)
- **`deep`**: Thorough exploration (5-10 minutes)

### Credit Costs

| Model       | Credits per Query |
|-------------|-------------------|
| discover    | 1                 |
| sentiment   | 1                 |
| precise     | 3                 |
| correlate   | 3                 |
| full        | 5                 |

---

## 🤝 Contributing

This is a research project. Contributions are welcome!

### Areas for Contribution

1. **New Ant Breeds**: Implement specialized ants for new domains
2. **ML Improvements**: Better reward functions, architectures
3. **Performance**: Optimize pheromone operations, caching
4. **Documentation**: Improve code comments, tutorials
5. **Testing**: Add unit/integration tests
6. **Visualization**: Better dashboards for swarm behavior

### Development Setup

See [GIT-WORKFLOW-GUIDE.md](GIT-WORKFLOW-GUIDE.md) for branch management.

---

## 📄 License

**GNU Affero General Public License v3.0 (AGPL-3.0)**

This project is open-source with a copyleft license:
- ✅ **Free to use** for personal, educational, and research purposes
- ✅ **Source code available** for inspection and learning
- ⚠️ **Commercial use requires** either:
  - Open-sourcing your entire application under AGPL-3.0, OR
  - Purchasing a commercial license (contact: iamvv2024@gmail.com)

**Why AGPL?**
- Ensures improvements benefit the community
- Prevents proprietary forks without contribution
- Allows dual-licensing for commercial applications

See [LICENSE](LICENSE) for full terms.

---

## 🙏 Acknowledgments

**Theoretical Foundation**:
- Marco Dorigo (Ant Colony Optimization)
- Thomas Seeley (Honeybee Democracy)
- Iain Couzin (Collective Animal Behavior)
- Guy Theraulaz (Stigmergy)

**Technical Inspiration**:
- OpenAI (Reinforcement Learning)
- DeepMind (Multi-Agent Systems)
- Anthropic (Constitutional AI)

**Research Papers**: 22 papers in `research papers/` directory

---

## 📧 Contact

**Author**: Prajwalvv
**GitHub**: [@Prajwalvv](https://github.com/Prajwalvv)  
**Repository**: [Actual-Planet](https://github.com/Prajwalvv/Actual-Planet)

---

## 🔮 Future Roadmap

- [ ] **Neural Ant Deployment**: Replace heuristic ants with fully neural agents
- [ ] **Multi-Query Learning**: Transfer learning across query types
- [ ] **Swarm Visualization**: Real-time 3D visualization of ant movements
- [ ] **Distributed Swarms**: Multi-server pheromone synchronization
- [ ] **Evolutionary Diversity**: Automatic discovery of ant specializations
- [ ] **Hybrid Intelligence**: Human-in-the-loop swarm guidance
- [ ] **Domain Expansion**: Support for code search, image analysis, audio processing

---

**Built with 🐜 by researchers exploring the frontier of collective intelligence**
