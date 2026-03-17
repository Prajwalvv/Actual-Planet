import { describe, it, expect } from 'vitest';
import { buildExplorerFeatures, buildExplorerObservation, EXPLORER_INPUT_DIM } from '../explorer/feature-builder';
import { AgentObservation, LinkCandidate } from '../agent-types';

function makeObservation(overrides: Partial<ReturnType<typeof buildExplorerObservation>> = {}): AgentObservation {
  return {
    queryLengthNorm: 0.2,
    symbolCount: 2,
    terrainOneHot: [1, 0, 0, 0, 0, 1, 0],
    depthOneHot: [0, 1, 0],
    timeBudgetRemaining: 0.7,
    coverageRatio: 0.4,
    frontierSizeNorm: 0.3,
    evidenceCountNorm: 0.2,
    sourceDiversityNorm: 0.15,
    trailStrength: 0.5,
    interestStrength: 0.3,
    deadTrailStrength: 0.0,
    stepProgress: 0.25,
    usefulnessScore: 0.4,
    blockedRatioNorm: 0.1,
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<LinkCandidate> = {}): LinkCandidate {
  return {
    url: 'https://example.com/docs/api-reference',
    domain: 'example.com',
    discoveredDepth: 1,
    hasTitle: true,
    hasSnippet: false,
    sourcePriority: 0.7,
    terrainHint: 'docs',
    sourceProviderId: 'link_pathfinder',
    title: 'API Reference',
    discoveredFrom: 'evidence_link',
    ...overrides,
  };
}

describe('buildExplorerObservation', () => {
  it('normalizes all fields to 0-1 range', () => {
    const obs = buildExplorerObservation({
      queryLength: 150,
      symbolCount: 3,
      terrains: ['news', 'docs'],
      depth: 'standard',
      timeBudgetRemaining: 0.6,
      coverageRatio: 0.5,
      frontierSize: 100,
      evidenceCount: 30,
      sourceDomainCount: 10,
      trailStrength: 0.4,
      interestStrength: 0.2,
      deadTrailStrength: 0.1,
      stepProgress: 0.5,
      usefulnessScore: 0.6,
      blockedCount: 5,
      totalUrlsSeen: 50,
    });

    expect(obs.queryLengthNorm).toBeCloseTo(150 / 500);
    expect(obs.symbolCount).toBe(3);
    expect(obs.terrainOneHot).toEqual([1, 0, 1, 0, 0, 0, 0]);
    expect(obs.depthOneHot).toEqual([0, 1, 0]);
    expect(obs.timeBudgetRemaining).toBe(0.6);
    expect(obs.frontierSizeNorm).toBeCloseTo(100 / 200);
    expect(obs.evidenceCountNorm).toBeCloseTo(30 / 100);
    expect(obs.blockedRatioNorm).toBeCloseTo(5 / 50);
  });

  it('clamps values to 0-1', () => {
    const obs = buildExplorerObservation({
      queryLength: 2000,
      symbolCount: 50,
      terrains: ['news'],
      depth: 'deep',
      timeBudgetRemaining: 1.5,
      coverageRatio: 1.5,
      frontierSize: 500,
      evidenceCount: 200,
      sourceDomainCount: 100,
      trailStrength: 2.0,
      interestStrength: -0.5,
      deadTrailStrength: 0,
      stepProgress: 1.5,
      usefulnessScore: -0.2,
      blockedCount: 0,
      totalUrlsSeen: 0,
    });

    expect(obs.queryLengthNorm).toBe(1);
    expect(obs.timeBudgetRemaining).toBe(1);
    expect(obs.coverageRatio).toBe(1);
    expect(obs.frontierSizeNorm).toBe(1);
    expect(obs.evidenceCountNorm).toBe(1);
    expect(obs.trailStrength).toBe(1);
    expect(obs.interestStrength).toBe(0);
    expect(obs.usefulnessScore).toBe(0);
    expect(obs.blockedRatioNorm).toBe(0);
  });
});

describe('buildExplorerFeatures', () => {
  it('produces correct dimension per candidate', () => {
    const obs = makeObservation();
    const candidates = [makeCandidate(), makeCandidate({ url: 'https://other.com/page' })];
    const knownDomains = new Set(['example.com']);

    const features = buildExplorerFeatures(obs, candidates, knownDomains);

    expect(features).toHaveLength(2);
    expect(features[0]).toHaveLength(EXPLORER_INPUT_DIM);
    expect(features[1]).toHaveLength(EXPLORER_INPUT_DIM);
  });

  it('returns empty array for no candidates', () => {
    const obs = makeObservation();
    const features = buildExplorerFeatures(obs, [], new Set());
    expect(features).toHaveLength(0);
  });

  it('context features are shared across candidates', () => {
    const obs = makeObservation();
    const c1 = makeCandidate({ url: 'https://a.com/page1' });
    const c2 = makeCandidate({ url: 'https://b.com/page2' });
    const features = buildExplorerFeatures(obs, [c1, c2], new Set());

    // First 32 features (query + swarm context) should be identical
    for (let i = 0; i < 32; i++) {
      expect(features[0][i]).toBe(features[1][i]);
    }
  });

  it('link features differ between candidates', () => {
    const obs = makeObservation();
    const c1 = makeCandidate({ url: 'https://example.com/docs/api', hasTitle: true, hasSnippet: true });
    const c2 = makeCandidate({ url: 'http://unknown.org/random', hasTitle: false, hasSnippet: false, domain: 'unknown.org' });
    const knownDomains = new Set(['example.com']);
    const features = buildExplorerFeatures(obs, [c1, c2], knownDomains);

    // Feature 32: domain already seen — c1=example.com (known), c2=unknown.org (not known)
    expect(features[0][32]).toBe(1); // known domain
    expect(features[1][32]).toBe(0); // unknown domain

    // Feature 34: has title
    expect(features[0][34]).toBe(1);
    expect(features[1][34]).toBe(0);

    // Feature 35: has snippet
    expect(features[0][35]).toBe(1);
    expect(features[1][35]).toBe(0);
  });

  it('all features are finite numbers', () => {
    const obs = makeObservation();
    const candidates = [
      makeCandidate({ url: 'https://example.com/docs' }),
      makeCandidate({ url: 'not-a-valid-url', domain: '' }),
    ];
    const features = buildExplorerFeatures(obs, candidates, new Set());

    for (const row of features) {
      for (const val of row) {
        expect(Number.isFinite(val)).toBe(true);
      }
    }
  });
});
