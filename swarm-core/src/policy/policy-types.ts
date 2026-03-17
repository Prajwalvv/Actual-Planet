import { CoverageBreakdown, PolicyMode, QueryExecutionPlan, TerrainType } from '../adaptive-types';
import { PheromoneType } from '../types';
import { ControllableRoleId, PolicyActionRoleId, RoleId } from './role-ids';

export type { PolicyMode } from '../adaptive-types';
export type PolicyControllerUsed = 'heuristic' | 'gru';
export type PolicyActionSource = 'heuristic' | 'gru' | 'fallback';

export interface PheromoneBucketSummary {
  locationId: string;
  concentration: number;
  signalDiversity: number;
  dominantType: PheromoneType | null;
}

export interface PheromoneContextSummary {
  root: PheromoneBucketSummary;
  roles: Record<RoleId, PheromoneBucketSummary>;
  terrains: Record<TerrainType, PheromoneBucketSummary>;
  providers: Record<string, PheromoneBucketSummary>;
  model: PheromoneBucketSummary;
}

export interface PolicyObservation {
  mode: PolicyMode;
  stepIndex: number;
  modelId: string;
  depth: 'quick' | 'standard' | 'deep';
  timeoutSec: number;
  queryLength: number;
  symbolCount: number;
  plan: Pick<QueryExecutionPlan, 'terrains' | 'providerPlan'>;
  frontierSize: number;
  frontierByTerrain: Record<TerrainType, number>;
  evidenceCount: number;
  evidenceByTerrain: Record<TerrainType, number>;
  providerHits: Record<string, number>;
  blockedCount: number;
  allowedCount: number;
  promotedTopics: number;
  coverage: CoverageBreakdown;
  elapsedMs: number;
  remainingMs: number;
  lastRoleId: PolicyActionRoleId | null;
  lastUnits: number;
  lastEvidenceGain: number;
  lastCoverageGain: number;
  availableRoles: ControllableRoleId[];
  pheromone: PheromoneContextSummary;
}

export interface PolicyAction {
  roleId: PolicyActionRoleId;
  units: number;
  confidence: number;
  source: PolicyActionSource;
  reason: string;
  modelVersion?: string | null;
}

export interface PolicyDecision {
  stepIndex: number;
  observation: PolicyObservation;
  availableRoles: ControllableRoleId[];
  heuristicAction: PolicyAction;
  modelAction: PolicyAction | null;
  executedAction: PolicyAction;
  fallbackUsed: boolean;
  fallbackReason?: string;
}

export interface DecisionOutcome {
  processed: number;
  added: number;
  elapsedMs: number;
  evidenceDelta: number;
  coverageDelta: number;
  usefulnessDelta: number;
  frontierDelta: number;
  blockedDelta: number;
  allowedDelta: number;
  promotedDelta: number;
  terrainDeltaIds: TerrainType[];
  providerDeltaIds: string[];
  useful: boolean;
}

export interface DecisionTraceFrame {
  stepIndex: number;
  availableRoles: ControllableRoleId[];
  featureVector: number[];
  observation: {
    frontierSize: number;
    evidenceCount: number;
    coverageRatio: number;
    usefulnessScore: number;
    elapsedMs: number;
    remainingMs: number;
  };
  heuristicAction: PolicyAction;
  modelAction: PolicyAction | null;
  executedAction: PolicyAction;
  fallbackUsed: boolean;
  fallbackReason?: string;
  outcome?: DecisionOutcome;
}

export interface PolicySessionSummary {
  mode: PolicyMode;
  controllerUsed: PolicyControllerUsed;
  fallbackUsed: boolean;
  decisionSteps: number;
  inferenceMs: number;
  traceId: string;
  modelVersion?: string | null;
}

export interface PolicyTraceRecord {
  traceId: string;
  mode: PolicyMode;
  query: string;
  symbols: string[];
  modelId: string;
  startedAt: number;
  completedAt: number;
  controllerUsed: PolicyControllerUsed;
  fallbackUsed: boolean;
  decisionSteps: number;
  inferenceMs: number;
  modelVersion?: string | null;
  frames: DecisionTraceFrame[];
  finalMetrics: {
    evidenceCount: number;
    coverageRatio: number;
    usefulnessScore: number;
    promotedTopics: number;
    elapsedMs: number;
  };
}

export interface PolicyGuardResult {
  ok: boolean;
  reason?: string;
  action?: PolicyAction;
}
