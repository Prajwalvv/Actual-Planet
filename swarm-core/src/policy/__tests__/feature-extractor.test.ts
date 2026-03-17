import { encodePolicyObservation } from '../feature-extractor';
import { PolicyObservation, PheromoneContextSummary, PheromoneBucketSummary } from '../policy-types';
import { CONTROLLABLE_ROLE_IDS, ALL_ROLE_IDS } from '../role-ids';
import { TerrainType } from '../../adaptive-types';

function zeroBucket(locationId: string): PheromoneBucketSummary {
  return { locationId, concentration: 0, signalDiversity: 0, dominantType: null };
}

function makePheromoneContext(providerIds: string[]): PheromoneContextSummary {
  const terrains: TerrainType[] = ['news', 'forum', 'docs', 'academic', 'company', 'general-web', 'social-signal'];
  return {
    root: zeroBucket('DOMAIN:DISCOVERED'),
    model: zeroBucket('MODEL:full'),
    roles: Object.fromEntries(ALL_ROLE_IDS.map((r) => [r, zeroBucket(`ROLE:${r}`)])) as any,
    terrains: Object.fromEntries(terrains.map((t) => [t, zeroBucket(`TERRAIN:${t}`)])) as any,
    providers: Object.fromEntries(providerIds.map((p) => [p, zeroBucket(`PROVIDER:${p}`)])),
  };
}

function makeObservation(overrides: Partial<PolicyObservation> = {}): PolicyObservation {
  const providerIds = ['duckduckgo_html', 'reddit_search'];
  return {
    mode: 'heuristic',
    stepIndex: 0,
    modelId: 'full',
    depth: 'standard',
    timeoutSec: 45,
    queryLength: 3,
    symbolCount: 1,
    plan: {
      terrains: [
        { terrain: 'news', weight: 0.5 },
        { terrain: 'docs', weight: 0.5 },
      ],
      providerPlan: providerIds.map((id) => ({ providerId: id, budgetPct: 0.5 })),
    },
    frontierSize: 10,
    frontierByTerrain: { news: 5, forum: 0, docs: 3, academic: 0, company: 0, 'general-web': 2, 'social-signal': 0 },
    evidenceCount: 4,
    evidenceByTerrain: { news: 2, forum: 0, docs: 1, academic: 0, company: 0, 'general-web': 1, 'social-signal': 0 },
    providerHits: { duckduckgo_html: 3, reddit_search: 1 },
    blockedCount: 1,
    allowedCount: 5,
    promotedTopics: 0,
    coverage: { requestedSymbols: 1, exactCount: 1, resolvedCount: 1, relatedOnlyCount: 0, notFoundCount: 0, coverageRatio: 1, usefulnessScore: 1 },
    elapsedMs: 2000,
    remainingMs: 18000,
    lastRoleId: null,
    lastUnits: 0,
    lastEvidenceGain: 0,
    lastCoverageGain: 0,
    availableRoles: [...CONTROLLABLE_ROLE_IDS],
    pheromone: makePheromoneContext(providerIds),
    ...overrides,
  };
}

describe('feature-extractor', () => {
  it('encodePolicyObservation returns a Float32Array of consistent length', () => {
    const obs = makeObservation();
    const vec = encodePolicyObservation(obs);

    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBeGreaterThan(0);

    const vec2 = encodePolicyObservation(makeObservation({ stepIndex: 5, frontierSize: 20 }));
    expect(vec2.length).toBe(vec.length);
  });

  it('all feature values are finite numbers in [-1, 1] range or slightly above', () => {
    const obs = makeObservation();
    const vec = encodePolicyObservation(obs);

    for (let i = 0; i < vec.length; i++) {
      expect(Number.isFinite(vec[i])).toBe(true);
      expect(vec[i]).toBeGreaterThanOrEqual(-1.01);
      expect(vec[i]).toBeLessThanOrEqual(1.01);
    }
  });

  it('step index normalization works correctly', () => {
    const vec0 = encodePolicyObservation(makeObservation({ stepIndex: 0 }));
    const vec12 = encodePolicyObservation(makeObservation({ stepIndex: 12 }));
    const vec24 = encodePolicyObservation(makeObservation({ stepIndex: 24 }));

    expect(vec0[4]).toBe(0);
    expect(vec12[4]).toBe(0.5);
    expect(vec24[4]).toBe(1);
  });

  it('different observations produce different vectors', () => {
    const vecA = encodePolicyObservation(makeObservation({ frontierSize: 5 }));
    const vecB = encodePolicyObservation(makeObservation({ frontierSize: 40 }));

    let different = false;
    for (let i = 0; i < vecA.length; i++) {
      if (vecA[i] !== vecB[i]) { different = true; break; }
    }
    expect(different).toBe(true);
  });
});
