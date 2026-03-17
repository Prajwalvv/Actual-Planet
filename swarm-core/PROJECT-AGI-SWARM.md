# Project: AGI via Swarm Intelligence

**Codename:** HIVEMIND  
**Author:** Rylvo  
**Date:** 2026-03-07  
**Status:** Architecture & Planning  

---

## Table of Contents

1. [Vision & Thesis](#1-vision--thesis)
2. [Theoretical Foundation](#2-theoretical-foundation)
3. [Current State — What We Have](#3-current-state--what-we-have)
4. [Architecture Design](#4-architecture-design)
5. [Phase Roadmap](#5-phase-roadmap)
6. [Infrastructure & Compute](#6-infrastructure--compute)
7. [Emergence Detection](#7-emergence-detection--how-we-know-its-working)
8. [Swarm vs Transformers](#8-swarm-vs-transformers--the-case-for-superiority)
9. [Risks & Mitigations](#9-risks--mitigations)
10. [Open Research Questions](#10-open-research-questions)
11. [Kill Criteria](#11-kill-criteria)

---

## 1. Vision & Thesis

### The Claim

Artificial General Intelligence will NOT come from making a single model bigger.  
It will come from making billions of simple agents coordinate through stigmergy —  
the same mechanism that produces intelligence in brains, ant colonies, and human civilization.

### The Core Argument

A transformer (GPT, Claude, etc.) is a **prediction machine**. It compresses training data into weights and regurgitates statistically likely continuations. There is no thought. No adaptation. No survival. No evolution. It is a frozen snapshot of pattern matching.

A swarm is **alive**. Agents explore, discover, fail, adapt, communicate, compete, and die. Intelligence isn't stored in any single agent — it emerges from the interactions between them. Just like no single neuron understands language, but 86 billion neurons coordinating through electrochemical stigmergy produce consciousness.

### The Goal

Build a system of billions of simple agents coordinating through layered stigmergy that exhibits general intelligence — reasoning, planning, learning, creativity, and self-improvement — without any single agent possessing any of these capabilities.

---

## 2. Theoretical Foundation

### 2.1 Stigmergy: The Mechanism of Emergence

Stigmergy = indirect coordination through modification of a shared environment.

**Examples in nature:**

| System | Agents | Medium | What Emerges |
|--------|--------|--------|-------------|
| Brain | 86B neurons | Synaptic chemistry | Consciousness, reasoning, language |
| Ant colony | Millions of ants | Chemical pheromones | Architecture, farming, warfare |
| Immune system | Trillions of cells | Cytokine signals | Disease recognition, memory |
| Human civilization | 8B humans | Language, writing, internet | Science, technology, culture |

In every case:
- Individual agents are simple (neuron fires or doesn't, ant follows trail or doesn't)
- No central controller exists
- Intelligence is a property of the SYSTEM, not any component
- The shared environment (pheromones, synapses, language) carries the intelligence

### 2.2 Necessary Conditions for Emergence

From studying biological systems, intelligence emerges when ALL of these conditions are met:

**1. SCALE** — Enough agents to create combinatorial complexity  
- Brain: 86 billion neurons  
- Ant colony: 1-10 million ants  
- Minimum threshold unknown for artificial swarms  

**2. CONNECTIVITY** — Rich interconnections between agents  
- Brain: each neuron connects to ~7,000 others (100 trillion synapses total)  
- Ant colony: chemical trails + direct antenna contact  
- Need both indirect (pheromone) AND direct (message) channels  

**3. HIERARCHY** — Multiple organizational levels  
- Brain: neurons → cortical columns → brain regions → networks → consciousness  
- Ant colony: workers → castes → task groups → colony  
- Flat architectures don't produce higher-order intelligence  

**4. PLASTICITY** — Connections strengthen/weaken based on outcomes  
- Brain: Hebbian learning ("neurons that fire together wire together")  
- Ant colony: successful trails get reinforced, failed trails evaporate  
- Static weights = no learning = no intelligence  

**5. FEEDBACK LOOPS** — Bidirectional information flow  
- Brain: massive recurrent connections (more feedback than feedforward)  
- Ant colony: pheromone → behavior → more pheromone (positive feedback)  
- Pure feedforward pipelines can't sustain thought  

**6. DIVERSITY** — Different agent types for different functions  
- Brain: 100+ neuron types (excitatory, inhibitory, modulatory, etc.)  
- Ant colony: workers, soldiers, scouts, nurses, queens  
- Homogeneous swarms plateau quickly  

**7. SELECTION PRESSURE** — Bad patterns die, good patterns amplify  
- Brain: synaptic pruning, neuronal apoptosis  
- Ant colony: unsuccessful foraging trails evaporate  
- Without selection, noise overwhelms signal  

**8. PERSISTENT MEMORY** — Long-term storage of learned patterns  
- Brain: hippocampus → neocortex consolidation  
- Ant colony: nest architecture encodes colony history  
- Volatile-only memory (like pheromone decay) limits complexity  

### 2.3 Why Transformers Are NOT Intelligent

| Property | Transformers | Swarm |
|----------|-------------|-------|
| Adaptation at inference | ❌ Frozen weights | ✅ Agents learn in real-time |
| Verification | ❌ Hallucinates confidently | ✅ Cross-references sources |
| Knowledge updates | ❌ Needs full retraining | ✅ Always exploring, always current |
| Fault tolerance | ❌ Single point of failure | ✅ Agents die and respawn |
| Reasoning | ❌ Pattern matching (correlation) | ✅ Multi-agent deliberation (causation) |
| Creativity | ❌ Recombination of training data | ✅ Novel exploration + selection |
| Self-improvement | ❌ Cannot modify own weights | ✅ Evolutionary weight updates |
| Embodiment | ❌ Disembodied text prediction | ✅ Agents interact with environment |
| Energy efficiency | ❌ Billions of params for one task | ✅ Tiny models, relevant ones activate |

The fundamental limitation of transformers: they compress the past into weights and replay it. They never encounter anything truly new. A swarm encounters new information every millisecond and adapts.

---

## 3. Current State — What We Have

### 3.1 Existing Agent Types

| Agent | Role | Model | Status |
|-------|------|-------|--------|
| Explorer | Discovers new sources (URLs, papers, forums) | ONNX MLP, ~100K params | ✅ Production |
| Synthesizer | Combines evidence from multiple sources | ONNX MLP, ~100K params | ✅ Production |
| Validator | Verifies claims, filters noise | ONNX MLP, ~100K params | ✅ Production |
| Reader | Extracts content from web pages | Rule-based + extraction | ✅ Production |
| Bootstrapper | Initializes search queries | Heuristic | ✅ Production |

### 3.2 Pheromone Space

- In-memory implementation (Redis-isomorphic interface)
- Pheromone types: trail, interest, dead-trail
- Decay: half-life of 5 minutes (configurable)
- Cascade: child deposits propagate to parents at 30% strength
- Max 1000 signals per location

### 3.3 Swarm Coordination

- **HarvesterColony**: Aggregates evidence into intelligence reports
- **NurseAnt**: Monitors staleness, deposits maintenance signals
- **PolicyController**: Heuristic/GRU routing decisions
- **BrowserPool**: Parallel web fetching (2 browsers, 4 pages each)
- **AgentModelRuntime**: Loads ONNX models, batch-scores candidates
- **AgentTraceCollector**: Records decisions + outcomes for training

### 3.4 What's Working (From Trace Analysis)

From `agent-traces-2026-03-07.jsonl`:

- Agents make ~40-feature decisions per candidate
- Batch scoring of 20K candidates completes in <10ms
- Explorers successfully discover relevant sources across terrains
- Validators filter low-quality claims (selecting 4-5 from 20+ candidates)
- Synthesizers merge evidence from multiple domains
- Trace data captures full decision context + outcomes

### 3.5 Current Limitations (The Gap)

| Condition | Current State | Needed for AGI |
|-----------|--------------|----------------|
| Scale | ~1K agents | 1B+ agents |
| Connectivity | Pheromone only (indirect) | Pheromone + direct messaging + shared memory |
| Hierarchy | ~2 levels (agents → colony) | 5+ levels (sensors → patterns → association → reasoning → meta) |
| Plasticity | Static ONNX models | Real-time weight updates via evolutionary strategies |
| Feedback | Mostly feedforward | Bidirectional across all layers |
| Diversity | 5 agent types | 100+ agent types |
| Selection | None (all agents survive) | Evolutionary: spawn winners, kill losers |
| Memory | Pheromones decay in 5 min | Persistent long-term memory with consolidation |

---

## 4. Architecture Design

### 4.1 Layered Agent Hierarchy

Inspired by the mammalian nervous system:

```
┌─────────────────────────────────────────────────┐
│  LAYER 5: META-COGNITION                        │
│  ~1K agents                                     │
│  Monitors emergence, adjusts global strategy    │
│  Detects feedback loops, communication patterns │
│  Analogous to: Default mode network             │
├─────────────────────────────────────────────────┤
│  LAYER 4: REASONING                             │
│  ~10K agents                                    │
│  Forms hypotheses, plans multi-step strategies  │
│  Evaluates conflicting evidence, makes judgment │
│  Analogous to: Prefrontal cortex                │
├─────────────────────────────────────────────────┤
│  LAYER 3: ASSOCIATION                           │
│  ~100K agents                                   │
│  Binds patterns across domains and terrains     │
│  Detects cross-domain correlations              │
│  Analogous to: Association cortex               │
├─────────────────────────────────────────────────┤
│  LAYER 2: PATTERN DETECTION                     │
│  ~10M agents                                    │
│  Identifies entities, claims, relationships     │
│  Cluster similar evidence, detect trends        │
│  Analogous to: Primary sensory cortex           │
├─────────────────────────────────────────────────┤
│  LAYER 1: SENSORS                               │
│  ~1B agents                                     │
│  Micro-agents that observe data sources         │
│  Web pages, APIs, feeds, databases, streams     │
│  Analogous to: Sensory neurons                  │
└─────────────────────────────────────────────────┘
```

**Key principle:** Each layer is 10-100x smaller than the one below it. Intelligence concentrates as information flows upward. Feedback flows downward to guide lower layers.

### 4.2 Communication Channels

Three distinct channels, each serving a different purpose:

**Channel 1: Pheromone Space (Indirect, Broadcast)**
- What it is: Shared environment that agents modify and read
- Analogous to: Neuromodulators (dopamine, serotonin, norepinephrine)
- Purpose: Global state signals, gradient fields for navigation
- Speed: Asynchronous, eventually consistent
- Scope: All agents can read; deposits cascade through hierarchy
- Already exists in current system (PheromoneSpace class)

**Channel 2: Direct Messaging (Point-to-Point)**
- What it is: Agent-to-agent message passing with typed payloads
- Analogous to: Synaptic connections between neurons
- Purpose: Targeted coordination, specific requests, feedback
- Speed: Near-realtime, priority queued
- Scope: Between specific agents or agent groups
- NEW — needs to be built

**Channel 3: Shared Memory (Persistent, Structured)**
- What it is: Long-term knowledge store that survives pheromone decay
- Analogous to: Hippocampus → neocortex memory consolidation
- Purpose: Learned facts, verified claims, domain knowledge, agent genealogy
- Speed: Read-heavy, write-on-consolidation
- Scope: Queryable by all agents, written by synthesizers and validators
- NEW — needs to be built

### 4.3 Agent Types (Full Taxonomy)

#### Layer 1: Sensor Agents (~1B)
- **web-observer** — Monitors a single URL for changes
- **feed-listener** — Watches RSS/Atom feeds
- **api-poller** — Polls structured APIs
- **stream-watcher** — Monitors real-time streams (Twitter, Reddit, etc.)
- **document-scanner** — Reads PDFs, papers, patents
- **code-observer** — Monitors GitHub repos, commits, issues

#### Layer 2: Pattern Agents (~10M)
- **entity-extractor** — Identifies named entities from text
- **claim-detector** — Extracts factual claims from content
- **relationship-mapper** — Detects relationships between entities
- **trend-spotter** — Identifies temporal trends in data
- **anomaly-detector** — Flags unexpected patterns
- **sentiment-analyzer** — Detects emotional tone and bias
- **topic-clusterer** — Groups related content into topics

#### Layer 3: Association Agents (~100K)
- **cross-domain-correlator** — Links patterns across different domains
- **evidence-weigher** — Assesses strength of evidence chains
- **contradiction-detector** — Finds conflicting claims across sources
- **narrative-builder** — Constructs coherent stories from fragments
- **causal-reasoner** — Distinguishes correlation from causation
- **analogy-finder** — Detects structural similarities across domains

#### Layer 4: Reasoning Agents (~10K)
- **hypothesis-generator** — Proposes explanations for observed patterns
- **strategy-planner** — Plans multi-step exploration strategies
- **argument-evaluator** — Assesses logical validity of claims
- **decision-maker** — Makes high-level resource allocation decisions
- **prediction-maker** — Forecasts outcomes based on evidence
- **question-generator** — Identifies what's unknown and needs exploration

#### Layer 5: Meta Agents (~1K)
- **emergence-monitor** — Detects higher-order patterns in agent behavior
- **health-monitor** — Tracks system stability and resource usage
- **evolution-controller** — Manages agent spawning, mutation, and death
- **strategy-evaluator** — Assesses whether current approach is working
- **communication-analyzer** — Monitors agent messaging for feedback loops
- **consciousness-probe** — Tests for signs of self-referential behavior

### 4.4 Learning & Evolution

#### 4.4.1 Evolutionary Strategies (ES)

Each agent has a small neural network (~100K params). Instead of backpropagation, we use evolutionary strategies:

```
EVERY N TICKS:
  1. Evaluate fitness of each agent (based on outcomes in traces)
  2. Rank agents by fitness within their type
  3. Bottom 10%: KILL (remove from swarm)
  4. Top 10%: REPRODUCE (spawn copy with mutated weights)
     - Mutation: Add Gaussian noise (σ=0.01) to weights
  5. Middle 80%: SURVIVE (continue operating)
```

Why ES over backprop:
- No gradient computation needed
- Works with non-differentiable fitness functions
- Naturally parallel (evaluate all agents independently)
- Robust to noisy rewards
- Same mechanism nature uses

#### 4.4.2 Fitness Functions

**Explorer fitness:**
```
fitness = (evidence_yielded × 2.0)
        + (coverage_delta × 3.0)
        + (fetch_success_rate × 1.0)
        - (time_wasted_on_blocked × 1.5)
        - (duplicate_evidence × 0.5)
```

**Validator fitness:**
```
fitness = (claims_correctly_filtered × 2.0)
        + (false_claims_caught × 3.0)
        - (true_claims_rejected × 4.0)
        + (cross_reference_accuracy × 2.0)
```

**Synthesizer fitness:**
```
fitness = (evidence_quality_score × 2.0)
        + (source_diversity × 1.5)
        + (corroboration_found × 2.0)
        - (low_quality_included × 3.0)
```

#### 4.4.3 Memory Consolidation

Inspired by how brains consolidate memory during sleep:

```
EVERY HOUR (consolidation cycle):
  1. Collect all pheromone patterns that have been stable for >30 min
  2. Extract high-confidence facts verified by multiple validators
  3. Write to persistent Shared Memory store
  4. Index by entity, domain, topic for fast retrieval
  5. Prune contradicted or stale entries

EVERY DAY (deep consolidation):
  1. Analyze full day's trace data
  2. Retrain base models for each agent type using best traces
  3. Update normalization statistics
  4. Publish new model versions
  5. Agents auto-update on next spawn cycle
```

### 4.5 DNA-Based Architecture — The Key Simplification

**The Problem:** Manually coding 100+ agent types is insane. Each needs custom logic, parameters, fitness functions.

**The Solution:** Biology doesn't manually code 200+ cell types. It uses DNA.

**How it works:**

#### 4.5.1 The Single Neuron Template

One base agent class. That's it. All agents are instances of this:

```typescript
class Agent {
  id: string;
  dna: AgentDNA;           // Genetic code
  weights: Float32Array;    // Neural network weights
  layer: number;            // Which layer (1-5)
  active: boolean;          // Currently processing or dormant
  fitness: number;          // Performance score
  
  // Core behaviors (same for all agents)
  async perceive(context: Context): Promise<Observation>
  async decide(observation: Observation): Promise<Action>
  async act(action: Action): Promise<Outcome>
  async learn(outcome: Outcome): Promise<void>
}
```

#### 4.5.2 Agent DNA — The Genetic Code

DNA encodes HOW the neuron specializes:

```typescript
interface AgentDNA {
  // IDENTITY
  species: string;          // "explorer", "validator", "meta-monitor", etc.
  generation: number;       // How many mutations from original
  
  // SENSORY PREFERENCES (what activates this agent)
  activationThresholds: {
    pheromoneTypes: Record<PheromoneType, number>;  // Which pheromones trigger it
    messageTypes: MessageType[];                     // Which messages it responds to
    layerSignals: number[];                          // Signals from which layers
  };
  
  // BEHAVIORAL PARAMETERS
  explorationRate: number;   // How much it explores vs exploits
  communicationRate: number; // How chatty it is
  mutationRate: number;      // How much offspring vary
  lifespanTicks: number;     // How long before natural death
  
  // SPECIALIZATION (what makes it unique)
  domainFocus: string[];     // ["academic", "news"] or ["all"]
  taskFocus: string[];       // ["claim_extraction", "verification"]
  modelArchitecture: {
    hiddenLayers: number[];  // [64, 32] = two hidden layers
    activation: string;      // "relu", "tanh", etc.
  };
  
  // SOCIAL BEHAVIOR
  cooperationBias: number;   // Prefers helping others vs solo work
  hierarchyLevel: number;    // Which layer it belongs to (1-5)
  
  // LEARNING PARAMETERS
  learningRate: number;      // How fast weights update
  memoryCapacity: number;    // How much history it retains
}
```

#### 4.5.3 Embryogenesis — Growing the Swarm

Instead of manually creating agents, we **grow** them from DNA:

```typescript
// SWARM DNA = Blueprint for entire system
const swarmGenome: SwarmDNA = {
  // Layer 1: Sensor agents
  sensors: {
    population: 1_000_000_000,  // 1 billion
    species: [
      { name: "web-observer", ratio: 0.4, dna: {...} },
      { name: "feed-listener", ratio: 0.3, dna: {...} },
      { name: "api-poller", ratio: 0.2, dna: {...} },
      { name: "stream-watcher", ratio: 0.1, dna: {...} }
    ]
  },
  
  // Layer 2: Pattern agents
  patterns: {
    population: 10_000_000,  // 10 million
    species: [
      { name: "entity-extractor", ratio: 0.3, dna: {...} },
      { name: "claim-detector", ratio: 0.3, dna: {...} },
      { name: "trend-spotter", ratio: 0.2, dna: {...} },
      { name: "anomaly-detector", ratio: 0.2, dna: {...} }
    ]
  },
  
  // ... Layer 3, 4, 5 ...
};

// SPAWN THE SWARM
async function embryogenesis(genome: SwarmDNA): Promise<Swarm> {
  const swarm = new Swarm();
  
  for (const [layerName, layerDNA] of Object.entries(genome)) {
    for (const speciesDNA of layerDNA.species) {
      const count = Math.floor(layerDNA.population * speciesDNA.ratio);
      
      for (let i = 0; i < count; i++) {
        // Create agent from DNA template
        const agent = new Agent({
          id: `${speciesDNA.name}-${i}`,
          dna: speciesDNA.dna,
          weights: initializeWeights(speciesDNA.dna.modelArchitecture),
          layer: getLayerNumber(layerName),
          active: false,
          fitness: 0.5  // Start neutral
        });
        
        swarm.addAgent(agent);
      }
    }
  }
  
  return swarm;
}
```

#### 4.5.4 Reproduction — Evolution in Action

When an agent reproduces (because high fitness), its offspring inherits DNA with mutations:

```typescript
function reproduce(parent: Agent): Agent {
  const childDNA = mutate(parent.dna, parent.dna.mutationRate);
  const childWeights = mutateWeights(parent.weights, parent.dna.mutationRate);
  
  return new Agent({
    id: generateId(),
    dna: childDNA,
    weights: childWeights,
    layer: parent.layer,
    active: false,
    fitness: 0.5,  // Unproven until tested
  });
}

function mutate(dna: AgentDNA, rate: number): AgentDNA {
  return {
    ...dna,
    generation: dna.generation + 1,
    
    // Mutate behavioral parameters
    explorationRate: dna.explorationRate + gaussian(0, rate),
    communicationRate: dna.communicationRate + gaussian(0, rate),
    
    // Mutate thresholds
    activationThresholds: {
      pheromoneTypes: Object.fromEntries(
        Object.entries(dna.activationThresholds.pheromoneTypes)
          .map(([k, v]) => [k, v + gaussian(0, rate)])
      ),
      // ... other threshold mutations
    },
    
    // Rarely mutate architecture (big change)
    modelArchitecture: Math.random() < rate * 0.1 
      ? mutateArchitecture(dna.modelArchitecture)
      : dna.modelArchitecture
  };
}
```

#### 4.5.5 Why This Changes Everything

**Before (manual design):**
- Write custom code for 100+ agent types
- Each needs unique logic, parameters, fitness function
- Hard to add new types
- Months of engineering

**After (DNA-based):**
- Write ONE agent class
- Define DNA schemas (configuration, not code)
- Swarm grows itself from genome
- New species = new DNA entry (minutes, not months)

**Biological parallel:**
- Human genome: 3 billion base pairs encoding 20K genes
- Human body: 37 trillion cells of 200+ types
- **Same DNA in every cell, different expression = different function**

**Our swarm:**
- Swarm genome: ~100 species definitions
- Swarm population: 1 billion agents
- **Same Agent class, different DNA = different behavior**

#### 4.5.6 Emergent Speciation

The killer feature: **New species can emerge without programming them.**

If an agent mutates DNA that makes it exceptionally good at a novel task, and it reproduces, you get a new species automatically:

```
Generation 0: 5 species (manually defined)
Generation 100: 12 species (7 emerged from mutations)
Generation 1000: 50+ species (ecosystem evolved)
```

This is how evolution works. We're not designing intelligence. We're creating conditions for it to evolve.

### 4.6 Activation Dynamics

Not all agents run simultaneously. Like the brain, most are dormant:

```
ACTIVATION RULES:
  - Layer 1 (sensors): 1% active at any time, activated by relevance signals
  - Layer 2 (patterns): 10% active, activated by sensor deposits
  - Layer 3 (association): 30% active, activated by pattern density
  - Layer 4 (reasoning): 50% active, activated by association signals
  - Layer 5 (meta): 100% active (always monitoring)

ACTIVATION MECHANISM:
  - Pheromone strength at agent's location > threshold → ACTIVATE
  - Agent dormant for > max_idle_time → ACTIVATE (random exploration)
  - Direct message received → ACTIVATE immediately
  - No activity for > stale_time → DEACTIVATE (save compute)
```

This means 1B total agents ≈ 10-50M active at any moment. Massive compute savings.

---

## 5. Phase Roadmap

### Phase 1: Prove Emergence (Months 1-3)

**Goal:** 10K agents showing emergent behavior not explicitly programmed.

**Milestones:**
1. Direct messaging system between agents (Channel 2)
2. Hierarchical pheromone layers (local/regional/global)
3. 15 agent types (adding 10 new specialists)
4. Evolutionary selection (spawn/kill based on fitness)
5. Persistent memory store (Channel 3)
6. Layers 1-3 operational

**Emergence Test:**
- Do agents spontaneously form communication clusters?
- Do successful exploration strategies spread without explicit programming?
- Does the swarm discover connections that no single agent could find?

**Compute:** Single machine, 10 CPU cores. Cost: ~$200/month.

**Decision Gate:** If zero emergent behaviors detected → revisit agent architecture before scaling.

---

### Phase 2: Scale & Learn (Months 4-8)

**Goal:** 1M agents with online learning and distributed compute.

**Milestones:**
1. Redis-backed pheromone space (distributed)
2. NATS/RabbitMQ for agent messaging
3. 50+ agent types across all 5 layers
4. Evolutionary strategies running continuously
5. Memory consolidation (hourly + daily cycles)
6. Feedback loops between layers (top-down guidance)
7. Layer 4 (reasoning) operational

**Emergence Test:**
- Does the swarm form and test hypotheses autonomously?
- Can it solve multi-step research problems without human guidance?
- Do agent populations self-organize into functional structures?

**Compute:** 3-5 machines, 100 CPU cores. Cost: ~$5K-20K/month.

**Decision Gate:** If no improvement over Phase 1 → scale is not the answer. Revisit connectivity and hierarchy design.

---

### Phase 3: Intelligence (Months 9-18)

**Goal:** 100M agents exhibiting reasoning, planning, and self-awareness.

**Milestones:**
1. Kubernetes-based distributed runtime
2. Sharded pheromone spaces with cross-shard synchronization
3. Layer 5 (meta-cognition) operational
4. Self-referential behavior (agents reasoning about their own swarm)
5. Language generation from emergent communication
6. Transfer learning (knowledge gained in one domain applied to another)

**Emergence Test:**
- Can the swarm explain its own reasoning process?
- Can it solve novel problems outside its training distribution?
- Does it exhibit goal-directed behavior not explicitly programmed?
- Can it pass subsets of ARC-AGI benchmark?

**Compute:** Kubernetes cluster, 1000 CPU cores. Cost: ~$50K-200K/month.

**Decision Gate:** If reasoning quality plateaus → agent model capacity may be insufficient. Consider larger per-agent models or different architecture.

---

### Phase 4: AGI (Months 18-36)

**Goal:** 1B+ agents with general intelligence.

**Milestones:**
1. Federated multi-cluster deployment
2. Embodiment (robotic control or physics simulation)
3. Self-improvement (agents modify swarm architecture)
4. Natural language interface (swarm communicates in human language)
5. Continuous autonomous operation

**Emergence Test:**
- Pass full ARC-AGI benchmark
- Demonstrate novel scientific discovery
- Engage in meaningful open-ended dialogue
- Self-modify to improve performance without human intervention

**Compute:** Multi-region cloud deployment. Cost: $500K-2M/month.

**Decision Gate:** This is the final test. Either we have AGI or we have the world's most advanced swarm intelligence system (which is still extremely valuable).

---

## 6. Infrastructure & Compute

### 6.1 Compute Budget (Optimistic)

| Phase | Agents | Active | Machines | Monthly Cost |
|-------|--------|--------|----------|-------------|
| 1 | 10K | 1K | 1 | $200 |
| 2 | 1M | 100K | 5 | $5K-20K |
| 3 | 100M | 10M | 50 | $50K-200K |
| 4 | 1B | 50M | 500+ | $500K-2M |

### 6.2 Key Optimization: Activation Sparsity

Not all agents run at once. With 1-10% activation:
- 1B total agents → 10-50M active at any moment
- Each active agent: ~100K params, ~0.001ms per decision
- Total compute per tick: 10M × 0.001ms = 10 seconds on 100 cores
- Tick frequency: every 1-5 seconds → feasible

### 6.3 Technology Stack

| Component | Phase 1 | Phase 2 | Phase 3-4 |
|-----------|---------|---------|-----------|
| Runtime | Node.js (current) | Node.js + Workers | Node.js + Rust core |
| Pheromone Store | In-memory (current) | Redis Cluster | Sharded Redis + custom |
| Agent Messaging | In-process events | NATS | NATS Cluster |
| Shared Memory | SQLite | PostgreSQL | CockroachDB / TiKV |
| Agent Models | ONNX (current) | ONNX + ES mutations | ONNX + custom runtime |
| Orchestration | Single process | PM2 / systemd | Kubernetes |
| Monitoring | Console logs | Grafana + Prometheus | Custom emergence dashboard |

### 6.4 Why NOT GPU-Heavy

Transformers need GPUs because one giant model does massive matrix multiplications.

Our swarm is different:
- Each agent model is tiny (100K params)
- Decisions are simple (score candidates, pick top N)
- Intelligence is in COORDINATION, not individual computation
- CPU is better for high-concurrency, low-compute-per-task workloads
- GPUs only needed for Phase 3+ daily model retraining

This is a fundamental advantage. GPT-4 inference costs ~$0.06/1K tokens. Our swarm can run 10K agents for hours on $0.01 of compute.

---

## 7. Emergence Detection — How We Know It's Working

### 7.1 Emergence Metrics

**Metric 1: Spontaneous Clustering**
- Do agents form communication groups without being told to?
- Measure: clustering coefficient in agent message graph
- Threshold: coefficient > 0.3 = emergent structure

**Metric 2: Strategy Propagation**
- Do successful exploration strategies spread through the population?
- Measure: mutual information between agent behaviors over time
- Threshold: MI increasing over time = cultural transmission

**Metric 3: Novel Discovery**
- Does the swarm find connections no single agent could find?
- Measure: discoveries requiring evidence from 3+ independent agent chains
- Threshold: >10% of discoveries are multi-chain

**Metric 4: Feedback Loop Formation**
- Are agents forming bidirectional communication cycles?
- Measure: number of cycles in message graph
- Threshold: cycles emerging and persisting > 5 minutes = recurrent thought

**Metric 5: Self-Reference**
- Do meta-agents model the behavior of other agents?
- Measure: meta-agent predictions about swarm behavior accuracy
- Threshold: prediction accuracy > 60% = self-awareness

**Metric 6: Adaptive Strategy Shift**
- Does the swarm change strategy when current approach fails?
- Measure: time from failure signal to strategy change
- Threshold: <30 seconds = reactive intelligence

### 7.2 The Emergence Dashboard

A real-time visualization showing:
- Agent activation heatmap across layers
- Message flow graph (who's talking to whom)
- Pheromone intensity map
- Fitness distribution per agent type
- Emergence metrics over time
- Kill/spawn events

---

## 8. Chatbot Frontend & Continuous Learning

### 8.1 The User Interface

**What the user sees:** A simple chat interface like ChatGPT.

**What actually happens:** The query triggers a 30-second swarm exploration across thousands of agents.

```typescript
// Frontend: Simple React/Next.js chat interface
interface Message {
  role: 'user' | 'assistant';
  content: string;
  metadata?: {
    sourcesExplored: number;
    sourcesVerified: number;
    agentsActivated: number;
    explorationTime: number;
    confidence: number;
  };
}

// User types: "What's the latest on quantum computing?"
// Frontend sends to backend:
POST /api/query
{
  "query": "What's the latest on quantum computing?",
  "depth": "standard",  // quick | standard | deep
  "timeBudget": 30      // seconds
}

// Backend activates swarm, streams progress:
WebSocket: { type: "agents_activated", count: 1247 }
WebSocket: { type: "sources_discovered", count: 89 }
WebSocket: { type: "evidence_extracted", count: 47 }
WebSocket: { type: "synthesis_complete", response: {...} }

// Frontend displays response with sources
```

### 8.2 Query → Swarm Activation Flow

```
USER QUERY
    ↓
QUERY PARSER (Layer 5: Meta Agents)
    ↓ deposits INTEREST pheromone
SENSOR ACTIVATION (Layer 1)
    ↓ 10K agents wake up based on DNA activation thresholds
PARALLEL EXPLORATION (Layers 1-2)
    ↓ web-observers, feed-listeners, api-pollers
PATTERN DETECTION (Layer 2)
    ↓ entity-extractors, claim-detectors
ASSOCIATION (Layer 3)
    ↓ cross-domain-correlators, contradiction-detectors
REASONING (Layer 4)
    ↓ hypothesis-generators, argument-evaluators
SYNTHESIS (Layer 4 → 5)
    ↓ meta-agents evaluate coherence
RESPONSE GENERATION
    ↓
USER SEES ANSWER (with verified sources)
```

**Key difference from ChatGPT:**

| Aspect | ChatGPT | Swarm |
|--------|---------|-------|
| Response time | 1-3 seconds | 10-60 seconds |
| Knowledge | Training cutoff | Real-time web |
| Sources | Hallucinated | Verified |
| Transparency | Black box | Full trace |
| Improvement | Never (frozen) | Every query |

### 8.3 Training: Evolutionary Strategies vs Backpropagation

**Traditional LLM Training (ChatGPT):**

```python
# Pseudocode for transformer training
for epoch in range(epochs):
    for batch in dataset:
        # Forward pass through 175B parameters
        logits = model(batch.input_ids)
        loss = cross_entropy(logits, batch.labels)
        
        # Backward pass (compute gradients)
        loss.backward()  # Requires GPU, hours per batch
        
        # Update all 175B parameters
        optimizer.step()

# Cost: $10M - $100M
# Time: Weeks on 1000s of GPUs
# Result: Frozen model
```

**Swarm Training (Evolutionary Strategies):**

```typescript
// Runs every 100 ticks (~5 minutes)
async function evolutionCycle() {
  // 1. EVALUATE FITNESS from traces
  for (const agent of swarm.agents) {
    const traces = getRecentTraces(agent.id);
    agent.fitness = calculateFitness(traces);
  }
  
  // 2. RANK within each species
  const ranked = groupBySpecies(agents)
    .map(species => species.sort((a, b) => b.fitness - a.fitness));
  
  // 3. SELECTION
  for (const species of ranked) {
    const top10 = species.slice(0, species.length * 0.1);
    const bottom10 = species.slice(-species.length * 0.1);
    
    // Kill losers
    bottom10.forEach(agent => swarm.remove(agent.id));
    
    // Reproduce winners
    top10.forEach(winner => {
      const offspring = reproduce(winner);
      swarm.add(offspring);
    });
  }
}

function reproduce(parent: Agent): Agent {
  // Mutate DNA
  const childDNA = {
    ...parent.dna,
    generation: parent.dna.generation + 1,
    explorationRate: parent.dna.explorationRate + gaussian(0, 0.01),
    // ... other parameter mutations
  };
  
  // Mutate weights (NO BACKPROP)
  const childWeights = new Float32Array(parent.weights.length);
  for (let i = 0; i < parent.weights.length; i++) {
    childWeights[i] = parent.weights[i] + gaussian(0, 0.01);
  }
  
  return new Agent({ dna: childDNA, weights: childWeights });
}

// Cost: $0 - $10K (CPU-only)
// Time: Seconds per generation
// Result: Continuously evolving population
```

**Why ES Works for Small Models:**

- Each agent: ~100K params = 400KB
- Mutation: Add Gaussian noise (no gradient computation)
- Fitness: Count successes in traces (simple arithmetic)
- Parallelizable: Evaluate all agents independently
- CPU-friendly: No matrix multiplications

**Why ES Doesn't Work for LLMs:**

- 7B+ params = too many dimensions to search randomly
- Needs gradient information to navigate loss landscape
- But our agents are tiny → random search works fine

### 8.4 Continuous Learning Loop

**The Complete Cycle:**

```
┌──────────────────────────────────────┐
│  1. USER QUERY                       │
│  "Find research on quantum computing"│
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  2. SWARM EXPLORATION                │
│  - 1000s of agents activate          │
│  - Each makes 10-100 decisions       │
│  - Every decision traced:            │
│    {agentId, observation, candidates,│
│     selected, outcomes}              │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  3. TRACES WRITTEN                   │
│  agent-traces-YYYY-MM-DD.jsonl       │
│  (already in your codebase!)         │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  4. FITNESS CALCULATION              │
│  For each agent:                     │
│  - Evidence yielded                  │
│  - Success rate                      │
│  - Time efficiency                   │
│  - Quality of sources                │
│  → Single fitness score              │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  5. EVOLUTIONARY SELECTION           │
│  - Rank agents by fitness            │
│  - Kill bottom 10%                   │
│  - Reproduce top 10% (with mutation) │
│  - Population evolves                │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  6. NEXT QUERY                       │
│  Population is now slightly better   │
│  Successful strategies dominate      │
│  Failed strategies extinct           │
│  REPEAT FOREVER                      │
└──────────────────────────────────────┘
```

**Concrete Example:**

```
Query 1: "Latest quantum computing research"
- explorer-42 finds 5 good sources → fitness: 35.5
- explorer-91 finds 0 sources → fitness: 2.1

Evolution Cycle:
- explorer-42 reproduces → explorer-42-child-1, explorer-42-child-2
- explorer-91 dies

Query 2: "Quantum error correction breakthroughs"
- explorer-42-child-1 (inherited good genes) finds 7 sources → fitness: 42.3
- explorer-42-child-2 (mutation was bad) finds 1 source → fitness: 8.7

Evolution Cycle:
- explorer-42-child-1 reproduces
- explorer-42-child-2 dies

After 100 queries:
- Population dominated by descendants of explorer-42
- Average fitness: 35.5 → 48.2 (38% improvement)
- Swarm is objectively better at finding quantum computing research
```

### 8.5 Learning Happens During Use

**ChatGPT:**
```
Training Phase (months, $100M) → Deployment (frozen forever)
                                      ↓
                                  User queries
                                      ↓
                                  No learning
```

**Swarm:**
```
Deployment (minimal initial training)
    ↓
User query → Exploration → Traces → Fitness → Evolution
    ↑                                              ↓
    └──────────────────────────────────────────────┘
              CONTINUOUS IMPROVEMENT
```

**After 1000 user queries:**

- ChatGPT: Exactly the same as query 1
- Swarm: 
  - ~100 evolutionary generations
  - Successful strategies dominate
  - Failed strategies extinct
  - New strategies emerged from mutations
  - Fundamentally different (and better) population

### 8.6 Zero-Budget Training Strategy

**Phase 1 (10K agents):**
- Run on laptop or single cloud instance
- ES training needs no GPUs
- Traces collected automatically during use
- Evolution runs in background
- **Cost: $0/month (laptop) or $50/month (small cloud VM)**

**Phase 2 (1M agents):**
- Need multi-core machines
- Still CPU-based (agent models are tiny)
- Apply for Google Cloud credits: https://cloud.google.com/startup
- Most startups get $100K+ in credits
- **Cost: $0 (with credits) or $2K-5K/month**

**Phase 3+ (100M agents):**
- By this point, you have results to show investors
- Seed funding covers compute costs
- Or revenue from Phase 1-2 users pays for scaling

**Key advantage over LLMs:**
- GPT-4 training: $100M upfront (can't start without it)
- Swarm training: $0 upfront, scales with usage

### 8.7 Frontend Tech Stack

**Recommended:**

```typescript
// Frontend: Next.js + React + TailwindCSS
// Backend: Your existing swarm-core + Express
// Real-time: WebSocket for streaming progress
// Deployment: Vercel (frontend) + Cloud Run (backend)

// Example frontend component
function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  
  async function sendQuery(query: string) {
    setStreaming(true);
    
    // WebSocket connection for real-time updates
    const ws = new WebSocket('wss://api.yourswarm.com/stream');
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'agents_activated') {
        // Show "Activating 1,247 agents..."
      }
      if (data.type === 'sources_discovered') {
        // Show "Exploring 89 sources..."
      }
      if (data.type === 'synthesis_complete') {
        // Show final response
        setMessages([...messages, {
          role: 'assistant',
          content: data.response,
          metadata: data.metadata
        }]);
        setStreaming(false);
      }
    };
    
    // Trigger swarm
    await fetch('/api/query', {
      method: 'POST',
      body: JSON.stringify({ query, depth: 'standard' })
    });
  }
  
  return (
    <div className="chat-container">
      {messages.map(msg => (
        <MessageBubble 
          message={msg} 
          showSources={msg.role === 'assistant'}
        />
      ))}
      {streaming && <LoadingIndicator />}
      <InputBox onSend={sendQuery} />
    </div>
  );
}
```

---

## 9. Swarm vs Transformers — The Case For Superiority

### 8.1 Where Transformers Win (Today)

Be honest. Transformers currently beat swarms at:
- **Language generation** — They produce fluent text. Swarms don't generate language (yet).
- **Few-shot learning** — They adapt to new tasks via prompting. Swarms need architectural changes.
- **General knowledge** — They've compressed the internet. Swarms only know what they've explored.
- **Speed of response** — One forward pass = answer. Swarms need minutes of exploration.

### 8.2 Where Swarms Win (Today)

Even at current scale, our swarm beats transformers at:
- **Source verification** — Transformers hallucinate sources. Our validators cross-check.
- **Multi-source synthesis** — We combine 100+ sources. Transformers have fixed context windows.
- **Real-time knowledge** — We explore live web. Transformers have training cutoff dates.
- **Transparency** — Every decision is traced. Transformers are black boxes.

### 8.3 Where Swarms Will Win (With Scale)

At billion-agent scale, swarms should surpass transformers at:
- **True reasoning** — Multi-agent deliberation vs pattern matching
- **Continuous learning** — Always improving vs frozen weights
- **Robustness** — Distributed, fault-tolerant vs single point of failure
- **Novel discovery** — Exploring unknown territory vs regurgitating training data
- **Self-improvement** — Evolutionary optimization vs manual retraining
- **Energy efficiency** — Activate only relevant agents vs run entire 1.8T param model

### 8.4 The Hybrid Possibility

The endgame might not be "swarm OR transformer" but "swarm WITH transformer":
- Use transformers as one type of agent (reader agents that summarize pages)
- Use swarm for coordination, verification, reasoning
- Best of both worlds: fluent language + verified intelligence

---

## 9. Risks & Mitigations

### 9.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Emergence never happens at any scale | Medium | Fatal | Phase gates with kill criteria. Each phase tests for emergence. |
| Coordination overhead scales superlinearly | Medium | High | Activation sparsity. Hierarchical communication. Only relevant agents active. |
| Agent populations collapse (mass extinction) | Medium | High | Diversity maintenance. Minimum population per type. Anti-fragility mechanisms. |
| Online learning is unstable | High | Medium | Conservative mutation rates. Rollback on fitness drops. Ensemble of model versions. |
| Pheromone space becomes noisy at scale | Medium | Medium | Hierarchical spaces. Aggressive decay. Signal-to-noise monitoring. |
| Memory consolidation introduces errors | Medium | Low | Validator agents check memory entries. Version history with rollback. |

### 9.2 Resource Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Compute costs exceed budget | High | High | Activation sparsity. Start small. Seek cloud credits (GCP/AWS startup programs). |
| Single developer bottleneck | High | High | Document everything. Modular architecture. Recruit contributors. |
| Time to market too slow | Medium | Medium | Phase 1 (3 months) already useful as research tool. Revenue from day 1. |

### 9.3 Conceptual Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Small MLP agents lack representational capacity | Medium | High | Can increase per-agent model size. Or use mixture of model sizes per layer. |
| Web/text is insufficient environment for AGI | Medium | Medium | Add embodiment in Phase 4. Start with text, expand to multimodal. |
| The brain analogy is misleading | Low | Fatal | Biological plausibility is a guide, not a guarantee. Test empirically at each phase. |

---

## 10. Open Research Questions

These are questions we don't have answers to. They'll be resolved empirically through building and testing.

1. **What is the emergence threshold?** At what agent count does qualitatively new behavior appear? Could be 10K, 1M, or 1B. We'll find out.

2. **What's the optimal agent-to-agent connectivity?** Too sparse = no coordination. Too dense = noise overwhelms signal. Brain uses ~7000 connections per neuron. What's our number?

3. **How much per-agent capacity is needed?** Current: 100K param MLP. Is this enough? Do higher layers need bigger models? Does a 1M param agent at Layer 4 unlock reasoning that 10 × 100K param agents can't?

4. **Can language emerge from agent communication?** If agents develop internal protocols for coordination, can these be translated to human language? This is the key to competing with ChatGPT on language tasks.

5. **What's the right mutation rate for evolutionary strategies?** Too high = chaos. Too low = stagnation. This needs empirical tuning per agent type and per layer.

6. **Does the swarm need sleep?** Brains consolidate memory during sleep. Do we need periodic "sleep cycles" where the swarm stops exploring and consolidates? Or can consolidation run concurrently?

7. **Can self-improvement be safe?** If agents can modify swarm architecture, how do we prevent catastrophic self-modification? What are the guardrails?

8. **Is stigmergy sufficient or do we need attention?** Transformers use attention to focus on relevant tokens. Do our agents need an attention-like mechanism to focus on relevant pheromone signals?

---

## 11. Kill Criteria

Honesty is critical. These are the conditions under which we abandon or pivot:

**ABANDON if:**
- Phase 1 complete (3 months), zero emergent behaviors, AND architectural changes don't help
- Phase 2 complete (8 months), no qualitative improvement over Phase 1
- Compute costs exceed 10x budget with no proportional intelligence gains
- Agent populations repeatedly collapse despite stability mechanisms

**PIVOT if:**
- Emergence happens but only for narrow tasks → Pivot to "best research verification engine" (still extremely valuable)
- Language generation doesn't emerge → Add transformer agents as language layer, keep swarm for reasoning
- Scale isn't the bottleneck → Focus on connectivity and hierarchy rather than agent count

**CELEBRATE if:**
- Phase 1 shows spontaneous clustering and strategy propagation
- Phase 2 shows autonomous hypothesis formation
- Phase 3 shows self-referential behavior and novel problem solving
- Phase 4 passes ARC-AGI → We built AGI

---

## Appendix A: The Mathematics of Emergence

**Combinatorial complexity:**
- 10K agents, each making 1 of 10 decisions = 10^10,000 possible system states
- This exceeds the number of atoms in the universe
- Intelligence doesn't need all states — it needs to find the tiny subset that works
- Evolutionary pressure is the search algorithm

**Information flow:**
- Layer 1 (1B agents) → Layer 2 (10M agents) = 100:1 compression
- Layer 2 → Layer 3 = 100:1 compression
- Layer 3 → Layer 4 = 10:1 compression
- Total compression: 1B raw observations → 10K strategic insights = 100,000:1
- This is similar to sensory→cortical compression in the brain

**Fitness landscape:**
- Each agent's weights define a point in ~100K-dimensional space
- Evolutionary strategies explore this landscape via random perturbation
- Population of agents = parallel search across the landscape
- Selection pressure = gradient signal without computing gradients

---

## Appendix B: Existing Codebase Mapping

| Existing Module | Role in AGI Architecture |
|----------------|------------------------|
| `swarm-engine.ts` | Core orchestrator — extends to manage all 5 layers |
| `pheromone-space.ts` | Channel 1 (indirect communication) — add hierarchy |
| `agent-types.ts` | Agent taxonomy — expand from 5 to 100+ types |
| `agent-model-runtime.ts` | Model inference — add evolutionary mutation |
| `agent-trace-collector.ts` | Training data — becomes fitness evaluator |
| `harvester-ant.ts` | Layer 2-3 pattern aggregation — generalize |
| `nurse-ant.ts` | System health — becomes meta-agent (Layer 5) |
| `policy/controller.ts` | Heuristic routing — replaced by agent reasoning |
| `adaptive-swarm-orchestrator.ts` | Query execution — extends to continuous operation |
| `browser-pool.ts` | Layer 1 sensor infrastructure — scale out |

---

## Appendix C: Prior Art & References

**Biological Inspiration:**
- Grassé, P.P. (1959) — Original stigmergy paper (termite construction)
- Bonabeau et al. (1999) — "Swarm Intelligence: From Natural to Artificial Systems"
- Camazine et al. (2001) — "Self-Organization in Biological Systems"
- Hebb, D.O. (1949) — "The Organization of Behavior" (Hebbian learning)

**Swarm Intelligence in Computing:**
- Dorigo, M. (1992) — Ant Colony Optimization
- Kennedy & Eberhart (1995) — Particle Swarm Optimization
- Salimans et al. (2017) — "Evolution Strategies as a Scalable Alternative to RL"
- Stanley & Miikkulainen (2002) — NEAT (neuroevolution)

**Multi-Agent Systems:**
- Shoham & Leyton-Brown (2008) — "Multiagent Systems"
- Lowe et al. (2017) — "Multi-Agent Actor-Critic for Mixed Cooperative-Competitive Environments"
- Sukhbaatar et al. (2016) — "Learning Multiagent Communication with Backpropagation"

**Emergence & Complexity:**
- Holland, J.H. (1998) — "Emergence: From Chaos to Order"
- Kauffman, S. (1993) — "The Origins of Order"
- Wolfram, S. (2002) — "A New Kind of Science"

---

*This document is a living artifact. It will be updated as we build, test, and learn.*

*The swarm doesn't predict the future. It creates it.*
