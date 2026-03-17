import { describe, it, expect, beforeEach } from 'vitest';
import { SynthesizerAgent } from '../synthesizer/synthesizer-agent';
import { AgentModelRuntime } from '../agent-model-runtime';
import { AgentObservation, EvidenceCandidate } from '../agent-types';

describe('SynthesizerAgent', () => {
  let runtime: AgentModelRuntime;
  let agent: SynthesizerAgent;

  const mockObservation: AgentObservation = {
    queryLengthNorm: 0.5,
    symbolCount: 3,
    terrainOneHot: [1, 0, 0, 0, 0, 0, 0],
    depthOneHot: [1, 0, 0],
    timeBudgetRemaining: 0.8,
    coverageRatio: 0.3,
    frontierSizeNorm: 0.4,
    evidenceCountNorm: 0.2,
    sourceDiversityNorm: 0.6,
    trailStrength: 0.5,
    interestStrength: 0.4,
    deadTrailStrength: 0.1,
    stepProgress: 0.3,
    blockedRatioNorm: 0.1,
    usefulnessScore: 0.7,
  };

  const mockCandidates: EvidenceCandidate[] = [
    {
      id: 'ev1',
      domain: 'high-quality.com',
      terrain: 'news',
      confidence: 0.9,
      freshnessScore: 0.95,
      sourceScore: 0.85,
      relevanceScore: 0.9,
      entityCount: 8,
      phraseCount: 15,
      claimCount: 4,
      isCorroborated: true,
      linkCount: 10,
      sentimentScore: 0.3,
    },
    {
      id: 'ev2',
      domain: 'medium-quality.com',
      terrain: 'news',
      confidence: 0.6,
      freshnessScore: 0.5,
      sourceScore: 0.6,
      relevanceScore: 0.65,
      entityCount: 3,
      phraseCount: 8,
      claimCount: 2,
      isCorroborated: false,
      linkCount: 4,
      sentimentScore: 0.0,
    },
    {
      id: 'ev3',
      domain: 'low-quality.com',
      terrain: 'forum',
      confidence: 0.3,
      freshnessScore: 0.2,
      sourceScore: 0.4,
      relevanceScore: 0.4,
      entityCount: 1,
      phraseCount: 3,
      claimCount: 1,
      isCorroborated: false,
      linkCount: 1,
      sentimentScore: -0.2,
    },
  ];

  beforeEach(() => {
    runtime = new AgentModelRuntime();
  });

  it('should initialize in heuristic mode when model not available', () => {
    agent = new SynthesizerAgent(runtime, 'test-agent-1');
    expect(agent.isReady()).toBe(true);
    expect(agent.getMode()).toBe('heuristic');
  });

  it('should score candidates with heuristic mode', async () => {
    agent = new SynthesizerAgent(runtime, 'test-agent-1', 'heuristic');
    
    const scored = await agent.scoreCandidates(mockObservation, mockCandidates);
    
    expect(scored).toHaveLength(3);
    expect(scored[0].score).toBeGreaterThan(0);
    expect(scored[0].score).toBeLessThanOrEqual(1);
  });

  it('should rank candidates by score descending', async () => {
    agent = new SynthesizerAgent(runtime, 'test-agent-1', 'heuristic');
    
    const scored = await agent.scoreCandidates(mockObservation, mockCandidates);
    
    for (let i = 0; i < scored.length - 1; i++) {
      expect(scored[i].score).toBeGreaterThanOrEqual(scored[i + 1].score);
    }
  });

  it('should assign correct ranks', async () => {
    agent = new SynthesizerAgent(runtime, 'test-agent-1', 'heuristic');
    
    const scored = await agent.scoreCandidates(mockObservation, mockCandidates);
    
    expect(scored[0].rank).toBe(0);
    expect(scored[1].rank).toBe(1);
    expect(scored[2].rank).toBe(2);
  });

  it('should prioritize high-quality evidence', async () => {
    agent = new SynthesizerAgent(runtime, 'test-agent-1', 'heuristic');
    
    const scored = await agent.scoreCandidates(mockObservation, mockCandidates);
    
    // High-quality candidate should rank first
    expect(scored[0].candidate.id).toBe('ev1');
    expect(scored[0].score).toBeGreaterThan(scored[1].score);
  });

  it('should handle empty candidate list', async () => {
    agent = new SynthesizerAgent(runtime, 'test-agent-1', 'heuristic');
    
    const scored = await agent.scoreCandidates(mockObservation, []);
    
    expect(scored).toHaveLength(0);
  });

  it('should handle single candidate', async () => {
    agent = new SynthesizerAgent(runtime, 'test-agent-1', 'heuristic');
    
    const scored = await agent.scoreCandidates(mockObservation, [mockCandidates[0]]);
    
    expect(scored).toHaveLength(1);
    expect(scored[0].rank).toBe(0);
  });

  it('should boost corroborated evidence', async () => {
    agent = new SynthesizerAgent(runtime, 'test-agent-1', 'heuristic');
    
    const corroborated = { ...mockCandidates[1], isCorroborated: true };
    const notCorroborated = { ...mockCandidates[1], isCorroborated: false };
    
    const scored1 = await agent.scoreCandidates(mockObservation, [corroborated]);
    const scored2 = await agent.scoreCandidates(mockObservation, [notCorroborated]);
    
    expect(scored1[0].score).toBeGreaterThan(scored2[0].score);
  });

  it('should boost fresh evidence', async () => {
    agent = new SynthesizerAgent(runtime, 'test-agent-1', 'heuristic');
    
    const fresh = { ...mockCandidates[1], freshnessScore: 0.9 };
    const stale = { ...mockCandidates[1], freshnessScore: 0.2 };
    
    const scored1 = await agent.scoreCandidates(mockObservation, [fresh]);
    const scored2 = await agent.scoreCandidates(mockObservation, [stale]);
    
    expect(scored1[0].score).toBeGreaterThan(scored2[0].score);
  });

  it('should boost relevant evidence', async () => {
    agent = new SynthesizerAgent(runtime, 'test-agent-1', 'heuristic');
    
    const relevant = { ...mockCandidates[1], relevanceScore: 0.9 };
    const irrelevant = { ...mockCandidates[1], relevanceScore: 0.3 };
    
    const scored1 = await agent.scoreCandidates(mockObservation, [relevant]);
    const scored2 = await agent.scoreCandidates(mockObservation, [irrelevant]);
    
    expect(scored1[0].score).toBeGreaterThan(scored2[0].score);
  });

  it('should boost content-rich evidence', async () => {
    agent = new SynthesizerAgent(runtime, 'test-agent-1', 'heuristic');
    
    const rich = {
      ...mockCandidates[1],
      entityCount: 15,
      phraseCount: 30,
      claimCount: 8,
    };
    const sparse = {
      ...mockCandidates[1],
      entityCount: 1,
      phraseCount: 2,
      claimCount: 0,
    };
    
    const scored1 = await agent.scoreCandidates(mockObservation, [rich]);
    const scored2 = await agent.scoreCandidates(mockObservation, [sparse]);
    
    expect(scored1[0].score).toBeGreaterThan(scored2[0].score);
  });

  it('should handle terrain matching', async () => {
    agent = new SynthesizerAgent(runtime, 'test-agent-1', 'heuristic');
    
    const newsObs = { ...mockObservation, terrainOneHot: [1, 0, 0, 0, 0, 0, 0] };
    const newsCandidate = { ...mockCandidates[1], terrain: 'news' };
    const forumCandidate = { ...mockCandidates[1], terrain: 'forum' };
    
    const scored1 = await agent.scoreCandidates(newsObs, [newsCandidate]);
    const scored2 = await agent.scoreCandidates(newsObs, [forumCandidate]);
    
    expect(scored1[0].score).toBeGreaterThan(scored2[0].score);
  });

  it('should prioritize quality when coverage is high', async () => {
    agent = new SynthesizerAgent(runtime, 'test-agent-1', 'heuristic');
    
    const highCoverageObs = { ...mockObservation, coverageRatio: 0.8 };
    const highQuality = {
      ...mockCandidates[1],
      confidence: 0.9,
      sourceScore: 0.85,
    };
    const lowQuality = {
      ...mockCandidates[1],
      confidence: 0.4,
      sourceScore: 0.3,
    };
    
    const scored = await agent.scoreCandidates(highCoverageObs, [highQuality, lowQuality]);
    
    expect(scored[0].candidate).toBe(highQuality);
  });

  it('should handle time pressure', async () => {
    agent = new SynthesizerAgent(runtime, 'test-agent-1', 'heuristic');
    
    const lowTimeObs = { ...mockObservation, timeBudgetRemaining: 0.1 };
    const highConfidence = { ...mockCandidates[1], confidence: 0.8 };
    const lowConfidence = { ...mockCandidates[1], confidence: 0.4 };
    
    const scored = await agent.scoreCandidates(lowTimeObs, [highConfidence, lowConfidence]);
    
    expect(scored[0].candidate).toBe(highConfidence);
  });

  it('should return agent ID', () => {
    agent = new SynthesizerAgent(runtime, 'test-agent-123');
    expect(agent.getId()).toBe('test-agent-123');
  });

  it('should dispose without error', async () => {
    agent = new SynthesizerAgent(runtime, 'test-agent-1');
    await expect(agent.dispose()).resolves.toBeUndefined();
  });
});
