/**
 * AGENT-LEVEL MODEL TYPES
 *
 * Defines the core abstractions for per-ant neural network models.
 * Each agent type (explorer, synthesizer, validator, etc.) has its own
 * small model that makes tactical decisions within a breed.run() call.
 *
 * Architecture: Pointwise Scoring MLP
 * - Production-proven pattern (Google DLRM, Uber DeepETA)
 * - Each candidate is scored independently → naturally batchable
 * - All agents of the same type share one ONNX session
 * - 1000 agents × 20 candidates = 20,000 rows in one batch = <10ms
 */

// ─────────────────────────────────────────────
// Agent Model Manifest (loaded from models/agents/<type>/manifest.json)
// ─────────────────────────────────────────────

export interface AgentModelManifest {
  /** Whether this agent model is enabled */
  enabled: boolean;
  /** Semantic version of the model */
  version: string;
  /** Relative path to the ONNX file */
  modelFile: string;
  /** Agent type identifier */
  agentType: AgentType;
  /** Input tensor name */
  inputName: string;
  /** Output tensor name */
  outputName: string;
  /** Number of input features per candidate */
  inputDim: number;
  /** Feature normalization config path (relative) */
  normalizationFile: string;
}

// ─────────────────────────────────────────────
// Agent Types
// ─────────────────────────────────────────────

export type AgentType =
  | 'explorer'
  | 'synthesizer'
  | 'validator'
  | 'reader'
  | 'bootstrapper';

// ─────────────────────────────────────────────
// Feature Normalization
// ─────────────────────────────────────────────

export interface FeatureNormalization {
  means: number[];
  stds: number[];
}

// ─────────────────────────────────────────────
// Link Candidate (Explorer-specific)
// ─────────────────────────────────────────────

export interface LinkCandidate {
  url: string;
  domain: string;
  /** Depth of the page this link was discovered on */
  discoveredDepth: number;
  /** Whether the link has a human-readable title */
  hasTitle: boolean;
  /** Whether the link has a snippet/description */
  hasSnippet: boolean;
  /** Priority assigned by the discovery source */
  sourcePriority: number;
  /** The terrain type hint, if available */
  terrainHint?: string;
  /** Source provider ID that found this link */
  sourceProviderId: string;
  /** Title text if available */
  title?: string;
  /** Snippet text if available */
  snippet?: string;
  /** URL this was discovered from */
  discoveredFrom?: string;
}

// ─────────────────────────────────────────────
// Evidence Candidate (Synthesizer-specific)
// ─────────────────────────────────────────────

export interface EvidenceCandidate {
  /** Evidence item ID */
  id: string;
  /** Source domain */
  domain: string;
  /** Terrain type */
  terrain: string;
  /** Confidence score from extraction */
  confidence: number;
  /** Freshness score */
  freshnessScore: number;
  /** Source credibility score */
  sourceScore: number;
  /** Relevance to query */
  relevanceScore: number;
  /** Number of entities mentioned */
  entityCount: number;
  /** Number of phrases extracted */
  phraseCount: number;
  /** Number of claims made */
  claimCount: number;
  /** Whether this evidence has been corroborated */
  isCorroborated: boolean;
  /** Number of discovered links */
  linkCount: number;
  /** Sentiment score (-1 to 1) */
  sentimentScore: number;
}

// ─────────────────────────────────────────────
// Claim Candidate (Validator-specific)
// ─────────────────────────────────────────────

export interface ClaimCandidate {
  /** Claim text */
  claim: string;
  /** Source evidence ID */
  sourceEvidenceId: string;
  /** Source domain */
  sourceDomain: string;
  /** Source terrain */
  sourceTerrain: string;
  /** Source confidence */
  sourceConfidence: number;
  /** Source credibility */
  sourceCredibility: number;
  /** How many other sources mention this claim */
  mentionCount: number;
  /** Whether claim has specific numbers/facts */
  hasSpecifics: boolean;
  /** Whether claim is verifiable (not opinion) */
  isVerifiable: boolean;
  /** Claim complexity (word count) */
  complexity: number;
}

// ─────────────────────────────────────────────
// Agent Observation (shared context for all agent types)
// ─────────────────────────────────────────────

export interface AgentObservation {
  /** Normalized query length (0-1) */
  queryLengthNorm: number;
  /** Number of input symbols */
  symbolCount: number;
  /** One-hot terrain vector [news, forum, docs, academic, company, general-web, social-signal] */
  terrainOneHot: number[];
  /** Depth enum: [quick=1,0,0  standard=0,1,0  deep=0,0,1] */
  depthOneHot: number[];
  /** Time budget remaining as fraction (0-1) */
  timeBudgetRemaining: number;
  /** Current coverage ratio (0-1) */
  coverageRatio: number;
  /** Frontier size normalized (0-1, capped at 200) */
  frontierSizeNorm: number;
  /** Evidence count normalized (0-1, capped at 100) */
  evidenceCountNorm: number;
  /** Number of unique source domains normalized */
  sourceDiversityNorm: number;
  /** Pheromone trail strength at current terrain */
  trailStrength: number;
  /** Pheromone interest strength */
  interestStrength: number;
  /** Dead trail strength */
  deadTrailStrength: number;
  /** Current step progress within this breed run (0-1) */
  stepProgress: number;
  /** Overlay usefulness score (0-1) */
  usefulnessScore: number;
  /** Number of blocked URLs normalized */
  blockedRatioNorm: number;
}

// ─────────────────────────────────────────────
// Agent Scoring Result
// ─────────────────────────────────────────────

export interface ScoredCandidate<T = LinkCandidate> {
  candidate: T;
  /** Model-predicted score (higher = more promising) */
  score: number;
  /** Rank among candidates (0 = best) */
  rank: number;
}

// ─────────────────────────────────────────────
// Agent Trace Record (for training data collection)
// ─────────────────────────────────────────────

export interface AgentTraceRecord {
  /** Unique trace ID */
  traceId: string;
  /** Agent type */
  agentType: AgentType;
  /** Timestamp */
  timestamp: number;
  /** The observation context when decision was made */
  observation: AgentObservation;
  /** All candidates that were available */
  candidates: any[];
  /** Feature vectors for each candidate (flattened) */
  featureVectors: number[][];
  /** Which candidates were selected (indices) */
  selectedIndices: number[];
  /** Outcome: did the selected candidates produce useful results? */
  outcomes: CandidateOutcome[];
}

export interface CandidateOutcome {
  /** Index into the candidates array */
  candidateIndex: number;
  /** Did this candidate yield evidence? */
  yieldedEvidence: boolean;
  /** Evidence count produced */
  evidenceCount: number;
  /** Coverage delta from this candidate */
  coverageDelta: number;
  /** Time taken (ms) */
  elapsedMs: number;
  /** Was the URL successfully fetched? */
  fetchSuccess: boolean;
}

// ─────────────────────────────────────────────
// Agent Model Interface
// ─────────────────────────────────────────────

export interface IAgentModel<TCandidate = LinkCandidate> {
  /** Whether the model is loaded and ready */
  isReady(): boolean;
  /** Score a batch of candidates given the current observation */
  scoreCandidates(
    observation: AgentObservation,
    candidates: TCandidate[],
  ): Promise<ScoredCandidate<TCandidate>[]>;
  /** Dispose of ONNX session resources */
  dispose(): Promise<void>;
}
