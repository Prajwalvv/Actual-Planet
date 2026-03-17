/**
 * RYLVO — Core Type System
 * 
 * The atomic units of stigmergic computing.
 * Intelligence doesn't live in the ant. It lives in the space between ants.
 */

// ─────────────────────────────────────────────
// PHEROMONE TYPES — the chemical vocabulary
// ─────────────────────────────────────────────

export enum PheromoneType {
  // Trend / momentum signals (any domain: price, popularity, traffic, etc.)
  MOMENTUM      = 'momentum',       // Positive trend detected
  DISTRESS      = 'distress',       // Negative trend / decline
  BREAKOUT      = 'breakout',       // Sudden change exceeding norms
  FLATLINE      = 'flatline',       // No movement — stagnation

  // Activity signals (volume, frequency, throughput in any domain)
  UNUSUAL_ACTIVITY = 'unusual_activity',  // Activity spike above baseline
  DRY_UP           = 'dry_up',           // Activity dropping to zero
  ACCUMULATION     = 'accumulation',     // Steady build-up over time

  // Sentiment / opinion signals (social, reviews, forums, any text source)
  FEAR       = 'fear',        // Negative sentiment dominates
  HYPE       = 'hype',        // Positive sentiment / excitement
  CONFUSION  = 'confusion',   // Mixed or contradictory sentiment
  SILENCE    = 'silence',     // Absence of discussion

  // Authority signals (insider filings, official sources, verified accounts)
  INSIDER_CONFIDENCE = 'insider_confidence',  // Authoritative source shows confidence
  INSIDER_EXIT       = 'insider_exit',        // Authoritative source pulling back
  INSIDER_CLUSTER    = 'insider_cluster',     // Multiple authority signals in short window

  // Correlation signals (cross-location patterns)
  DIVERGENCE  = 'divergence',    // Two related locations moving apart
  CONVERGENCE = 'convergence',   // Two related locations moving together
  DECOUPLING  = 'decoupling',   // Previously correlated locations de-syncing

  // Macro / environmental signals (broad context: economy, regulation, trends)
  MACRO_SHIFT   = 'macro_shift',     // Broad environmental change detected
  MACRO_STABLE  = 'macro_stable',    // Environment is steady
  REGIME_CHANGE = 'regime_change',   // Fundamental shift in conditions

  // Cross-colony meta signals (processor-generated)
  CLUSTER_DETECTED = 'cluster_detected',  // Multiple signal types agree at one location
  CASCADE_FORMING  = 'cascade_forming',   // Signal propagating across related locations
  ANOMALY          = 'anomaly',           // Something statistically unusual

  // Discovery signals — deposited by adaptive discovery workers
  FOOD_SOURCE = 'food_source',    // A provider or reader found a data source at this location
  TRAIL       = 'trail',          // Path marker — "data exists here, schedule more reader work"
  DEAD_TRAIL  = 'dead_trail',     // Source is broken/gone — avoid this path
  INTEREST    = 'interest',       // Something worth watching — mentions, activity, buzz

  // Guard signals — deposited by guard ants (data quality layer)
  QUARANTINE  = 'quarantine',     // Data at this location is suspicious — suppress
  VERIFIED    = 'verified',       // Data cross-validated across multiple sources
  ECHO_CHAMBER = 'echo_chamber',  // Signals here are self-reinforcing without new input

  // Nurse signals — deposited by nurse ants (colony health layer)
  STALE       = 'stale',          // Data hasn't been refreshed recently
  SATURATED   = 'saturated',      // Too many signals, noise exceeds signal
  REBALANCE   = 'rebalance',      // Resources need shifting to/from this location

  // Harvester signals — deposited by harvester ants (output layer)
  HARVEST_READY = 'harvest_ready', // Intelligence at this location is ripe for output
}

// ─────────────────────────────────────────────
// LOCATION — where in the pheromone space
// ─────────────────────────────────────────────

export type LocationType =
  | 'entity'     // A specific thing: company, product, person, topic, concept
  | 'category'   // A group: industry, genre, region, department
  | 'domain'     // Top-level domain: technology, science, politics, culture
  | 'pair';      // Relationship between two entities

export interface Location {
  /** Unique location key, e.g. "Tesla", "CATEGORY:TECH", "topic:AI", "product:iPhone" */
  id: string;
  type: LocationType;
  /** Parent locations — enables cascade. entity → category → domain */
  parents: string[];
  /** Optional domain tag — helps route to correct swarm model */
  domain?: string;
  /** Optional metadata — arbitrary key-value for the location */
  meta?: Record<string, string | number>;
}

// ─────────────────────────────────────────────
// PHEROMONE SIGNAL — what ants deposit
// ─────────────────────────────────────────────

export interface PheromoneDeposit {
  /** Which pheromone type */
  type: PheromoneType;
  /** Where in the space */
  locationId: string;
  /** Signal strength: 0.0 to 1.0 */
  strength: number;
  /** Who deposited it (ant ID) */
  sourceAntId: string;
  /** Colony the source ant belongs to */
  sourceColony: string;
  /** When deposited (epoch ms) */
  timestamp: number;
}

export interface PheromoneReading {
  /** Pheromone type */
  type: PheromoneType;
  /** Current decayed strength */
  strength: number;
  /** How many ants contributed to this signal */
  contributorCount: number;
  /** Age of the strongest signal in ms */
  peakAge: number;
}

export interface LocationSnapshot {
  locationId: string;
  /** All active pheromone readings at this location */
  signals: PheromoneReading[];
  /** Total concentration — sum of all signal strengths */
  totalConcentration: number;
  /** Number of distinct pheromone types active */
  signalDiversity: number;
  /** Timestamp of snapshot */
  timestamp: number;
}

// ─────────────────────────────────────────────
// ANT — the atomic computational unit
// ─────────────────────────────────────────────

export type AntStatus = 'idle' | 'sensing' | 'depositing' | 'dead';

export interface AntRule {
  /** Human-readable name for the rule */
  name: string;
  /** Evaluate the rule given current input and nearby pheromones */
  evaluate: (input: SensorReading, nearby: LocationSnapshot) => PheromoneDeposit | null;
}

export interface SensorReading {
  /** Raw value from the ant's ONE input source */
  value: number;
  /** Change from previous reading (percentage) */
  change: number;
  /** Additional context (e.g., volume ratio, mention count) */
  metadata: Record<string, number>;
  /** Timestamp of reading */
  timestamp: number;
}

export interface AntConfig {
  /** Unique ant ID */
  id: string;
  /** What type of ant (price, volume, sentiment, etc.) */
  colonyType: string;
  /** The ONE location this ant watches */
  locationId: string;
  /** The hardcoded rules (3-5 max) */
  rules: AntRule[];
  /** How often the ant runs its loop, in ms */
  intervalMs: number;
  /** How the ant reads its sensor data */
  sensorFn: () => Promise<SensorReading>;
}

export interface AntState {
  id: string;
  status: AntStatus;
  /** Total ticks (loop iterations) this ant has executed */
  tickCount: number;
  /** Last time the ant ran */
  lastTickAt: number;
  /** Number of deposits made in lifetime */
  depositsCount: number;
}

// ─────────────────────────────────────────────
// COLONY — a group of same-type ants
// ─────────────────────────────────────────────

export interface ColonyConfig {
  /** Colony name, e.g. "price", "volume" */
  name: string;
  /** Factory function to create ant rules for this colony type */
  createRules: (locationId: string) => AntRule[];
  /** Default interval for ants in this colony */
  defaultIntervalMs: number;
  /** Locations this colony covers */
  locations: string[];
}

export interface ColonyStats {
  name: string;
  totalAnts: number;
  activeAnts: number;
  deadAnts: number;
  totalDeposits: number;
  /** Average deposits per tick across all ants */
  avgDepositsPerTick: number;
}

// ─────────────────────────────────────────────
// EMERGENCE — patterns detected in pheromone space
// ─────────────────────────────────────────────

export type EmergenceType = 
  | 'convergence_cluster'   // Multiple signal types converging on one location
  | 'cascade_trail'         // Signal propagating across related locations
  | 'anomalous_silence'     // Unexpected absence of signals
  | 'amplification_spike';  // Rapid positive feedback loop

export interface EmergenceEvent {
  type: EmergenceType;
  /** Primary location where the pattern was detected */
  locationId: string;
  /** All locations involved in the pattern */
  involvedLocations: string[];
  /** The pheromone types involved */
  involvedSignals: PheromoneType[];
  /** Strength of the emergent pattern (0.0 to 1.0) */
  strength: number;
  /** When it was first detected */
  detectedAt: number;
  /** Human-readable description */
  description: string;
}

// ─────────────────────────────────────────────
// PHEROMONE SPACE — the shared environment interface
// ─────────────────────────────────────────────

export interface IPheromoneSpace {
  /** Deposit a pheromone signal at a location */
  deposit(signal: PheromoneDeposit): Promise<void>;

  /** Read all signals at a specific location */
  read(locationId: string): Promise<LocationSnapshot>;

  /** Read signals at a location filtered by pheromone type */
  readType(locationId: string, type: PheromoneType): Promise<PheromoneReading | null>;

  /** Get total concentration at a location */
  concentration(locationId: string): Promise<number>;

  /** Get all locations with concentration above a threshold */
  hotspots(threshold: number): Promise<LocationSnapshot[]>;

  /** Register a location with its spatial relationships */
  registerLocation(location: Location): Promise<void>;

  /** Get parent locations (for cascade) */
  getParents(locationId: string): Promise<string[]>;

  /** Trigger decay across all signals — called periodically */
  decay(): Promise<number>;

  /** Get full space snapshot (for visualization) */
  snapshot(): Promise<Map<string, LocationSnapshot>>;

  /** Get all registered location IDs */
  getLocationIds(): Promise<string[]>;
}

// ─────────────────────────────────────────────
// INTELLIGENCE REPORT — Harvester output
// ─────────────────────────────────────────────

/** Signal polarity: which direction the evidence points */
export type SignalPolarity = 'positive' | 'negative' | 'neutral' | 'mixed';

/** Confidence tier for human / LLM consumption */
export type ConfidenceTier = 'high' | 'medium' | 'low' | 'unverified';

/**
 * IntelligenceReport — the structured output of the swarm.
 * Domain-agnostic. Works for entities, products, topics, anything.
 * This is what the API serves to LLMs.
 */
export interface IntelligenceReport {
  /** Location this report is about */
  locationId: string;
  /** When the report was generated */
  generatedAt: number;
  /** Overall polarity: are the signals positive, negative, mixed? */
  polarity: SignalPolarity;
  /** Conviction score: 0.0 (no data) to 1.0 (all signals strongly agree) */
  conviction: number;
  /** Confidence tier based on data quality and source count */
  confidence: ConfidenceTier;
  /** Active signal summary — each signal type and its current strength */
  signals: IntelligenceSignal[];
  /** Cross-location correlations involving this location */
  correlations: IntelligenceCorrelation[];
  /** Data quality assessment from guard ants */
  quality: DataQualityAssessment;
  /** Auto-generated natural-language summary for LLM consumption */
  summary: string;
  /** How fresh the underlying data is */
  dataFreshnessMs: number;
  /** How many distinct sources contributed */
  sourceCount: number;
}

export interface IntelligenceSignal {
  type: PheromoneType;
  strength: number;
  contributors: number;
  ageMs: number;
}

export interface IntelligenceCorrelation {
  withLocationId: string;
  type: 'convergence' | 'divergence' | 'decoupling';
  strength: number;
}

export interface DataQualityAssessment {
  isQuarantined: boolean;
  isVerified: boolean;
  isEchoChamber: boolean;
  isStale: boolean;
  isSaturated: boolean;
  qualityScore: number;  // 0.0 to 1.0
}

// ─────────────────────────────────────────────
// COLONY HEALTH — Nurse output
// ─────────────────────────────────────────────

export interface ColonyHealthReport {
  /** When generated */
  timestamp: number;
  /** Total locations being monitored */
  totalLocations: number;
  /** Locations with active signals */
  activeLocations: number;
  /** Locations flagged as stale */
  staleLocations: string[];
  /** Locations flagged as saturated */
  saturatedLocations: string[];
  /** Locations recommended for rebalancing */
  rebalanceTargets: { locationId: string; reason: string }[];
  /** Overall colony health score 0.0 to 1.0 */
  healthScore: number;
  /** Signal-to-noise ratio across the colony */
  signalToNoiseRatio: number;
}
