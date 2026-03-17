import { describe, it, expect, vi } from 'vitest';
import { ExplorerAgent } from '../explorer/explorer-agent';
import { AgentModelRuntime } from '../agent-model-runtime';
import { AgentObservation, LinkCandidate } from '../agent-types';

function makeObservation(): AgentObservation {
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
  };
}

function makeCandidates(n: number): LinkCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    url: `https://site${i}.com/page`,
    domain: `site${i}.com`,
    discoveredDepth: i % 3,
    hasTitle: i % 2 === 0,
    hasSnippet: i % 3 === 0,
    sourcePriority: 0.3 + (i * 0.1),
    terrainHint: 'docs',
    sourceProviderId: 'link_pathfinder',
    title: i % 2 === 0 ? `Page ${i}` : undefined,
    discoveredFrom: 'evidence_link',
  }));
}

describe('ExplorerAgent', () => {
  it('uses heuristic mode when runtime has no model loaded', () => {
    const runtime = new AgentModelRuntime('/nonexistent');
    const agent = new ExplorerAgent(runtime, 'test-1');
    expect(agent.getMode()).toBe('heuristic');
    expect(agent.isReady()).toBe(true);
  });

  it('scores candidates in heuristic mode', async () => {
    const runtime = new AgentModelRuntime('/nonexistent');
    const agent = new ExplorerAgent(runtime, 'test-2', 'heuristic');
    const obs = makeObservation();
    const candidates = makeCandidates(5);

    const scored = await agent.scoreCandidates(obs, candidates);

    expect(scored).toHaveLength(5);
    // All should have scores
    for (const s of scored) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
      expect(s.rank).toBeGreaterThanOrEqual(0);
      expect(s.candidate).toBeDefined();
    }
    // Should be sorted descending by score
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i - 1].score).toBeGreaterThanOrEqual(scored[i].score);
    }
  });

  it('returns empty for empty candidates', async () => {
    const runtime = new AgentModelRuntime('/nonexistent');
    const agent = new ExplorerAgent(runtime, 'test-3', 'heuristic');
    const scored = await agent.scoreCandidates(makeObservation(), []);
    expect(scored).toHaveLength(0);
  });

  it('assigns sequential ranks starting from 0', async () => {
    const runtime = new AgentModelRuntime('/nonexistent');
    const agent = new ExplorerAgent(runtime, 'test-4', 'heuristic');
    const scored = await agent.scoreCandidates(makeObservation(), makeCandidates(10));

    const ranks = scored.map(s => s.rank);
    expect(ranks).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('heuristic prefers candidates with titles over those without', async () => {
    const runtime = new AgentModelRuntime('/nonexistent');
    const agent = new ExplorerAgent(runtime, 'test-5', 'heuristic');
    const obs = makeObservation();

    const withTitle: LinkCandidate = {
      url: 'https://a.com/page',
      domain: 'a.com',
      discoveredDepth: 0,
      hasTitle: true,
      hasSnippet: true,
      sourcePriority: 0.5,
      sourceProviderId: 'link_pathfinder',
    };
    const withoutTitle: LinkCandidate = {
      url: 'https://b.com/page',
      domain: 'b.com',
      discoveredDepth: 0,
      hasTitle: false,
      hasSnippet: false,
      sourcePriority: 0.5,
      sourceProviderId: 'link_pathfinder',
    };

    const scored = await agent.scoreCandidates(obs, [withoutTitle, withTitle]);
    // The candidate with title should score higher
    expect(scored[0].candidate.hasTitle).toBe(true);
  });

  it('heuristic penalizes deep discovery depth', async () => {
    const runtime = new AgentModelRuntime('/nonexistent');
    const agent = new ExplorerAgent(runtime, 'test-6', 'heuristic');
    const obs = makeObservation();

    const shallow: LinkCandidate = {
      url: 'https://a.com/page',
      domain: 'a.com',
      discoveredDepth: 0,
      hasTitle: true,
      hasSnippet: false,
      sourcePriority: 0.5,
      sourceProviderId: 'link_pathfinder',
    };
    const deep: LinkCandidate = {
      url: 'https://b.com/page',
      domain: 'b.com',
      discoveredDepth: 5,
      hasTitle: true,
      hasSnippet: false,
      sourcePriority: 0.5,
      sourceProviderId: 'link_pathfinder',
    };

    const scored = await agent.scoreCandidates(obs, [deep, shallow]);
    expect(scored[0].candidate.discoveredDepth).toBe(0);
  });

  it('dispose is safe to call multiple times', async () => {
    const runtime = new AgentModelRuntime('/nonexistent');
    const agent = new ExplorerAgent(runtime, 'test-7', 'heuristic');
    await agent.dispose();
    await agent.dispose(); // should not throw
  });
});
