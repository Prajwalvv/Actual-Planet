import { PheromoneType } from './types';

export type TerrainType =
  | 'news'
  | 'forum'
  | 'docs'
  | 'academic'
  | 'company'
  | 'general-web'
  | 'social-signal';

export type DiscoveryProviderKind = 'search' | 'feed' | 'forum' | 'sitemap' | 'direct';

export interface DiscoveryInput {
  query: string;
  symbols: string[];
  terrains: TerrainType[];
  domains?: string[];
}

export interface ProviderBudget {
  maxCandidates: number;
  maxRequests: number;
  maxDepth: number;
  deadlineMs: number;
}

export interface DiscoveryCandidate {
  url: string;
  domain: string;
  title?: string;
  snippet?: string;
  sourceProviderId: string;
  providerKind: DiscoveryProviderKind;
  terrainHint?: TerrainType;
  confidence: number;
  discoveredAt: number;
  publishedAt?: number;
  metadata?: Record<string, string | number | boolean | string[]>;
}

export interface QueryPolicyEvent {
  url: string;
  domain: string;
  action: 'allowed' | 'blocked' | 'skipped';
  reason: string;
  sourceProviderId?: string;
  timestamp: number;
}

export interface EvidenceItem {
  id: string;
  url: string;
  domain: string;
  terrain: TerrainType;
  title?: string;
  snippet?: string;
  entities: string[];
  phrases: string[];
  claims: string[];
  discoveredLinks: string[];
  feedHints: string[];
  publishedAt?: number;
  fetchedAt: number;
  confidence: number;
  freshnessScore: number;
  sourceScore: number;
  relevanceScore: number;
  sentimentScore: number;
  corroborationScore?: number;
  metadata?: Record<string, string | number | boolean | string[]>;
}

export interface TopicAggregate {
  topic: string;
  normalizedTopic: string;
  mentions: number;
  evidenceIds: string[];
  sourceDomains: string[];
  terrains: TerrainType[];
  averageConfidence: number;
  averageFreshness: number;
  sentimentScore: number;
  corroborationScore: number;
  phrases: string[];
  firstSeenAt: number;
  lastSeenAt: number;
}

export type TopicResolutionStatus =
  | 'exact'
  | 'phrase_match'
  | 'alias_match'
  | 'fuzzy_match'
  | 'related_only'
  | 'not_found';

export interface TopicResolution {
  input: string;
  normalized: string;
  status: TopicResolutionStatus;
  matchedTopic?: string;
  confidence: number;
  evidenceIds: string[];
  alternatives: string[];
  nextActions: string[];
  summary?: string;
}

export interface CoverageBreakdown {
  requestedSymbols: number;
  exactCount: number;
  resolvedCount: number;
  relatedOnlyCount: number;
  notFoundCount: number;
  coverageRatio: number;
  usefulnessScore: number;
}

export interface SourceCoverage {
  totalEvidence: number;
  totalDomains: number;
  providerHits: Record<string, number>;
  terrainHits: Record<string, number>;
  blockedCount: number;
  allowedCount: number;
  promotedTopics: number;
}

export interface QueryExecutionPlan {
  query: string;
  terrains: Array<{ terrain: TerrainType; weight: number }>;
  providerPlan: Array<{ providerId: string; budgetPct: number }>;
  breedPlan: Array<{ breedId: string; count: number }>;
  timeBudgetMs: number;
  phaseBudgetsMs: {
    bootstrap: number;
    explore: number;
    corroborate: number;
    synthesize: number;
  };
}

export type PolicyMode = 'heuristic' | 'gru_shadow' | 'gru_live' | 'auto';

export interface AdaptiveQueryRequest {
  query?: string;
  symbols?: string[];
  depth?: 'quick' | 'standard' | 'deep';
  modelId: string;
  timeoutSec: number;
  stream?: boolean;
  terrainHints?: TerrainType[];
  policyMode?: PolicyMode;
}

export interface RuntimeEventPayload {
  type:
    | 'query_started'
    | 'plan_ready'
    | 'sources_discovered'
    | 'evidence_added'
    | 'policy_step'
    | 'policy_fallback'
    | 'policy_trace_ready'
    | 'resolution_updated'
    | 'coverage_updated'
    | 'final';
  data: any;
}

export interface QueryExecutionMetrics {
  queueWaitMs: number;
  coldStartMs: number;
  elapsedMs: number;
  timeToFirstEvidenceMs: number | null;
  timeToFirstUsefulMs: number | null;
  policyBlocked: number;
  promotions: number;
}

export interface AdaptiveQueryResult {
  topicResolutions: TopicResolution[];
  symbolResolutions?: TopicResolution[];
  evidence: EvidenceItem[];
  executionPlan: QueryExecutionPlan;
  sourceCoverage: SourceCoverage;
  queryMeta: {
    modelUsed: string;
    timeoutAcceptedSec: number;
    partial: boolean;
    respondedAt: string;
    phaseTimings: QueryExecutionPlan['phaseBudgetsMs'];
    coverage: CoverageBreakdown;
    corroboration: { promoted: number; withheld: number };
    streaming: { enabled: boolean; eventCount: number };
    performance: {
      timeToFirstEvidenceMs: number | null;
      timeToFirstUsefulMs: number | null;
    };
    queuePosition: number;
    queueWaitMs: number;
    autoStarted: boolean;
    restartedForModel: boolean;
    coldStartMs: number;
    elapsedMs: number;
    modelRequested?: string | null;
    timeoutRequestedSec?: number | null;
    timeoutLimitsSec?: { min: number; default: number; max: number };
    shardId?: string;
    policy: {
      mode: PolicyMode;
      controllerUsed: 'heuristic' | 'gru';
      fallbackUsed: boolean;
      decisionSteps: number;
      inferenceMs: number;
      traceId: string;
      modelVersion?: string | null;
    };
  };
}

export interface TopicPromotionDecision {
  target: string;
  promote: boolean;
  reason: string;
  corroborationScore: number;
  sourceDomains: string[];
  signals: Array<{ type: PheromoneType; strength: number }>;
}

export interface RuntimePolicySnapshot {
  crawlMode: 'robots-first';
  maxPagesPerDomainPerQuery: number;
  maxTotalPagesPerQuery: number;
  streamingSupported: boolean;
  providerKinds: DiscoveryProviderKind[];
  policyModes: PolicyMode[];
  defaultPolicyMode: PolicyMode;
}
