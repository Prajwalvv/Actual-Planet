import { CoverageBreakdown, QueryExecutionPlan, TerrainType } from '../adaptive-types';
import { QueryFrontier } from '../discovery/frontier';
import { QueryOverlayMemory } from '../memory/query-overlay';
import { PolicyAction, PolicyObservation, PheromoneContextSummary, PolicyMode } from './policy-types';
import { CONTROLLABLE_ROLE_IDS } from './role-ids';

const TERRAIN_ORDER: TerrainType[] = ['news', 'forum', 'docs', 'academic', 'company', 'general-web', 'social-signal'];

function zeroTerrainRecord(): Record<TerrainType, number> {
  return {
    news: 0,
    forum: 0,
    docs: 0,
    academic: 0,
    company: 0,
    'general-web': 0,
    'social-signal': 0,
  };
}

function normalizeTerrainCounts(input: Record<string, number>): Record<TerrainType, number> {
  const base = zeroTerrainRecord();
  for (const terrain of TERRAIN_ORDER) {
    base[terrain] = Number(input[terrain] || 0);
  }
  return base;
}

export function buildPolicyObservation(input: {
  mode: PolicyMode;
  stepIndex: number;
  request: {
    query?: string;
    symbols?: string[];
    depth?: 'quick' | 'standard' | 'deep';
    timeoutSec: number;
    modelId: string;
  };
  plan: QueryExecutionPlan;
  frontier: QueryFrontier;
  overlay: QueryOverlayMemory;
  coverage: CoverageBreakdown;
  pheromone: PheromoneContextSummary;
  availableRoles: typeof CONTROLLABLE_ROLE_IDS[number][];
  lastAction: PolicyAction | null;
  lastEvidenceGain: number;
  lastCoverageGain: number;
  elapsedMs: number;
  remainingMs: number;
}): PolicyObservation {
  const sourceCoverage = input.overlay.getSourceCoverage();
  const frontierByTerrain = normalizeTerrainCounts(input.frontier.terrainHistogram());
  const evidenceByTerrain = normalizeTerrainCounts(sourceCoverage.terrainHits);

  return {
    mode: input.mode,
    stepIndex: input.stepIndex,
    modelId: input.request.modelId,
    depth: input.request.depth || 'standard',
    timeoutSec: input.request.timeoutSec,
    queryLength: (input.request.query || '').trim().split(/\s+/).filter(Boolean).length,
    symbolCount: input.request.symbols?.length || 0,
    plan: {
      terrains: input.plan.terrains,
      providerPlan: input.plan.providerPlan,
    },
    frontierSize: input.frontier.size(),
    frontierByTerrain,
    evidenceCount: sourceCoverage.totalEvidence,
    evidenceByTerrain,
    providerHits: sourceCoverage.providerHits,
    blockedCount: sourceCoverage.blockedCount,
    allowedCount: sourceCoverage.allowedCount,
    promotedTopics: sourceCoverage.promotedTopics,
    coverage: input.coverage,
    elapsedMs: input.elapsedMs,
    remainingMs: input.remainingMs,
    lastRoleId: input.lastAction?.roleId || null,
    lastUnits: input.lastAction?.units || 0,
    lastEvidenceGain: input.lastEvidenceGain,
    lastCoverageGain: input.lastCoverageGain,
    availableRoles: [...input.availableRoles],
    pheromone: input.pheromone,
  };
}

function roleIndex(roleId: PolicyObservation['lastRoleId']): number {
  if (!roleId || roleId === 'stop_explore') return 0;
  return CONTROLLABLE_ROLE_IDS.indexOf(roleId) + 1;
}

export function encodePolicyObservation(observation: PolicyObservation): Float32Array {
  const vector: number[] = [];
  const terrainWeights = Object.fromEntries(observation.plan.terrains.map((entry) => [entry.terrain, entry.weight]));
  const totalFrontier = Math.max(1, observation.frontierSize);
  const totalEvidence = Math.max(1, observation.evidenceCount);
  const totalTimeout = Math.max(1, observation.timeoutSec * 1000);
  const depthMap = { quick: 0.2, standard: 0.6, deep: 1 };

  vector.push(depthMap[observation.depth] || depthMap.standard);
  vector.push(Math.min(1, observation.timeoutSec / 120));
  vector.push(Math.min(1, observation.queryLength / 20));
  vector.push(Math.min(1, observation.symbolCount / 10));
  vector.push(Math.min(1, observation.stepIndex / 24));
  vector.push(Math.min(1, observation.frontierSize / 50));
  vector.push(Math.min(1, observation.evidenceCount / 50));
  vector.push(Math.min(1, observation.blockedCount / 50));
  vector.push(Math.min(1, observation.allowedCount / 50));
  vector.push(Math.min(1, observation.promotedTopics / 20));
  vector.push(observation.coverage.coverageRatio);
  vector.push(observation.coverage.usefulnessScore);
  vector.push(Math.min(1, observation.elapsedMs / totalTimeout));
  vector.push(Math.min(1, observation.remainingMs / totalTimeout));
  vector.push(roleIndex(observation.lastRoleId) / (CONTROLLABLE_ROLE_IDS.length + 1));
  vector.push(Math.min(1, observation.lastUnits / 2));
  vector.push(Math.max(-1, Math.min(1, observation.lastEvidenceGain / 10)));
  vector.push(Math.max(-1, Math.min(1, observation.lastCoverageGain)));

  for (const terrain of TERRAIN_ORDER) {
    vector.push(terrainWeights[terrain] || 0);
  }

  for (const terrain of TERRAIN_ORDER) {
    vector.push(Math.min(1, (observation.frontierByTerrain[terrain] || 0) / totalFrontier));
  }

  for (const terrain of TERRAIN_ORDER) {
    vector.push(Math.min(1, (observation.evidenceByTerrain[terrain] || 0) / totalEvidence));
  }

  for (const provider of observation.plan.providerPlan.map((entry) => entry.providerId)) {
    vector.push(Math.min(1, (observation.providerHits[provider] || 0) / totalEvidence));
  }

  for (const roleId of CONTROLLABLE_ROLE_IDS) {
    vector.push(observation.availableRoles.includes(roleId) ? 1 : 0);
  }

  for (const roleId of CONTROLLABLE_ROLE_IDS) {
    vector.push(Math.min(1, observation.pheromone.roles[roleId].concentration));
  }

  for (const terrain of TERRAIN_ORDER) {
    vector.push(Math.min(1, observation.pheromone.terrains[terrain].concentration));
  }

  for (const provider of observation.plan.providerPlan.map((entry) => entry.providerId)) {
    vector.push(Math.min(1, observation.pheromone.providers[provider]?.concentration || 0));
  }

  vector.push(Math.min(1, observation.pheromone.model.concentration));
  vector.push(Math.min(1, observation.pheromone.root.concentration));

  return Float32Array.from(vector);
}
