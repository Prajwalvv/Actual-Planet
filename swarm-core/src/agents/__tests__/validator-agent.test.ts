import { describe, it, expect, beforeEach } from 'vitest';
import { ValidatorAgent } from '../validator/validator-agent';
import { AgentModelRuntime } from '../agent-model-runtime';
import { AgentObservation, ClaimCandidate } from '../agent-types';

describe('ValidatorAgent', () => {
  let runtime: AgentModelRuntime;
  let agent: ValidatorAgent;

  const mockObservation: AgentObservation = {
    queryLengthNorm: 0.5,
    symbolCount: 3,
    terrainOneHot: [0, 0, 0, 1, 0, 0, 0],
    depthOneHot: [1, 0, 0],
    timeBudgetRemaining: 0.6,
    coverageRatio: 0.5,
    frontierSizeNorm: 0.4,
    evidenceCountNorm: 0.4,
    sourceDiversityNorm: 0.6,
    trailStrength: 0.5,
    interestStrength: 0.4,
    deadTrailStrength: 0.1,
    stepProgress: 0.5,
    blockedRatioNorm: 0.1,
    usefulnessScore: 0.7,
  };

  const mockCandidates: ClaimCandidate[] = [
    {
      claim: 'High priority verifiable claim with specific data',
      sourceEvidenceId: 'ev1',
      sourceDomain: 'academic.edu',
      sourceTerrain: 'academic',
      sourceConfidence: 0.9,
      sourceCredibility: 0.95,
      mentionCount: 5,
      hasSpecifics: true,
      isVerifiable: true,
      complexity: 20,
    },
    {
      claim: 'Medium priority claim',
      sourceEvidenceId: 'ev2',
      sourceDomain: 'news.com',
      sourceTerrain: 'news',
      sourceConfidence: 0.7,
      sourceCredibility: 0.7,
      mentionCount: 2,
      hasSpecifics: true,
      isVerifiable: true,
      complexity: 30,
    },
    {
      claim: 'Low priority opinion piece',
      sourceEvidenceId: 'ev3',
      sourceDomain: 'forum.net',
      sourceTerrain: 'forum',
      sourceConfidence: 0.4,
      sourceCredibility: 0.3,
      mentionCount: 1,
      hasSpecifics: false,
      isVerifiable: false,
      complexity: 60,
    },
  ];

  beforeEach(() => {
    runtime = new AgentModelRuntime();
  });

  it('should initialize in heuristic mode when model not available', () => {
    agent = new ValidatorAgent(runtime, 'test-validator-1');
    expect(agent.isReady()).toBe(true);
    expect(agent.getMode()).toBe('heuristic');
  });

  it('should score candidates with heuristic mode', async () => {
    agent = new ValidatorAgent(runtime, 'test-validator-1', 'heuristic');
    
    const scored = await agent.scoreCandidates(mockObservation, mockCandidates);
    
    expect(scored).toHaveLength(3);
    expect(scored[0].score).toBeGreaterThan(0);
    expect(scored[0].score).toBeLessThanOrEqual(1);
  });

  it('should rank candidates by score descending', async () => {
    agent = new ValidatorAgent(runtime, 'test-validator-1', 'heuristic');
    
    const scored = await agent.scoreCandidates(mockObservation, mockCandidates);
    
    for (let i = 0; i < scored.length - 1; i++) {
      expect(scored[i].score).toBeGreaterThanOrEqual(scored[i + 1].score);
    }
  });

  it('should assign correct ranks', async () => {
    agent = new ValidatorAgent(runtime, 'test-validator-1', 'heuristic');
    
    const scored = await agent.scoreCandidates(mockObservation, mockCandidates);
    
    expect(scored[0].rank).toBe(0);
    expect(scored[1].rank).toBe(1);
    expect(scored[2].rank).toBe(2);
  });

  it('should prioritize high-credibility verifiable claims', async () => {
    agent = new ValidatorAgent(runtime, 'test-validator-1', 'heuristic');
    
    const scored = await agent.scoreCandidates(mockObservation, mockCandidates);
    
    // Academic claim should rank first
    expect(scored[0].candidate.sourceDomain).toBe('academic.edu');
    expect(scored[0].score).toBeGreaterThan(scored[1].score);
  });

  it('should handle empty candidate list', async () => {
    agent = new ValidatorAgent(runtime, 'test-validator-1', 'heuristic');
    
    const scored = await agent.scoreCandidates(mockObservation, []);
    
    expect(scored).toHaveLength(0);
  });

  it('should handle single candidate', async () => {
    agent = new ValidatorAgent(runtime, 'test-validator-1', 'heuristic');
    
    const scored = await agent.scoreCandidates(mockObservation, [mockCandidates[0]]);
    
    expect(scored).toHaveLength(1);
    expect(scored[0].rank).toBe(0);
  });

  it('should boost verifiable claims', async () => {
    agent = new ValidatorAgent(runtime, 'test-validator-1', 'heuristic');
    
    const verifiable = { ...mockCandidates[1], isVerifiable: true };
    const notVerifiable = { ...mockCandidates[1], isVerifiable: false };
    
    const scored1 = await agent.scoreCandidates(mockObservation, [verifiable]);
    const scored2 = await agent.scoreCandidates(mockObservation, [notVerifiable]);
    
    expect(scored1[0].score).toBeGreaterThan(scored2[0].score);
  });

  it('should boost claims with specifics', async () => {
    agent = new ValidatorAgent(runtime, 'test-validator-1', 'heuristic');
    
    const withSpecifics = { ...mockCandidates[1], hasSpecifics: true };
    const withoutSpecifics = { ...mockCandidates[1], hasSpecifics: false };
    
    const scored1 = await agent.scoreCandidates(mockObservation, [withSpecifics]);
    const scored2 = await agent.scoreCandidates(mockObservation, [withoutSpecifics]);
    
    expect(scored1[0].score).toBeGreaterThan(scored2[0].score);
  });

  it('should boost high credibility sources', async () => {
    agent = new ValidatorAgent(runtime, 'test-validator-1', 'heuristic');
    
    const highCred = { ...mockCandidates[1], sourceCredibility: 0.9 };
    const lowCred = { ...mockCandidates[1], sourceCredibility: 0.3 };
    
    const scored1 = await agent.scoreCandidates(mockObservation, [highCred]);
    const scored2 = await agent.scoreCandidates(mockObservation, [lowCred]);
    
    expect(scored1[0].score).toBeGreaterThan(scored2[0].score);
  });

  it('should boost corroborated claims', async () => {
    agent = new ValidatorAgent(runtime, 'test-validator-1', 'heuristic');
    
    const corroborated = { ...mockCandidates[1], mentionCount: 5 };
    const single = { ...mockCandidates[1], mentionCount: 1 };
    
    const scored1 = await agent.scoreCandidates(mockObservation, [corroborated]);
    const scored2 = await agent.scoreCandidates(mockObservation, [single]);
    
    expect(scored1[0].score).toBeGreaterThan(scored2[0].score);
  });

  it('should penalize overly complex claims', async () => {
    agent = new ValidatorAgent(runtime, 'test-validator-1', 'heuristic');
    
    const simple = { ...mockCandidates[1], complexity: 15 };
    const complex = { ...mockCandidates[1], complexity: 80 };
    
    const scored1 = await agent.scoreCandidates(mockObservation, [simple]);
    const scored2 = await agent.scoreCandidates(mockObservation, [complex]);
    
    expect(scored1[0].score).toBeGreaterThan(scored2[0].score);
  });

  it('should respect terrain authority', async () => {
    agent = new ValidatorAgent(runtime, 'test-validator-1', 'heuristic');
    
    const academic = { ...mockCandidates[1], sourceTerrain: 'academic' };
    const forum = { ...mockCandidates[1], sourceTerrain: 'forum' };
    
    const scored1 = await agent.scoreCandidates(mockObservation, [academic]);
    const scored2 = await agent.scoreCandidates(mockObservation, [forum]);
    
    expect(scored1[0].score).toBeGreaterThan(scored2[0].score);
  });

  it('should handle terrain matching', async () => {
    agent = new ValidatorAgent(runtime, 'test-validator-1', 'heuristic');
    
    const academicObs = { ...mockObservation, terrainOneHot: [0, 0, 0, 1, 0, 0, 0] };
    const academicClaim = { ...mockCandidates[1], sourceTerrain: 'academic' };
    const newsClaim = { ...mockCandidates[1], sourceTerrain: 'news' };
    
    const scored1 = await agent.scoreCandidates(academicObs, [academicClaim]);
    const scored2 = await agent.scoreCandidates(academicObs, [newsClaim]);
    
    expect(scored1[0].score).toBeGreaterThan(scored2[0].score);
  });

  it('should prioritize high-credibility claims when coverage is low', async () => {
    agent = new ValidatorAgent(runtime, 'test-validator-1', 'heuristic');
    
    const lowCoverageObs = { ...mockObservation, coverageRatio: 0.3 };
    const highCred = { ...mockCandidates[1], sourceCredibility: 0.9 };
    const lowCred = { ...mockCandidates[1], sourceCredibility: 0.4 };
    
    const scored = await agent.scoreCandidates(lowCoverageObs, [highCred, lowCred]);
    
    expect(scored[0].candidate).toBe(highCred);
  });

  it('should prioritize easy-to-verify claims under time pressure', async () => {
    agent = new ValidatorAgent(runtime, 'test-validator-1', 'heuristic');
    
    const lowTimeObs = { ...mockObservation, timeBudgetRemaining: 0.1 };
    const easy = {
      ...mockCandidates[1],
      isVerifiable: true,
      hasSpecifics: true,
      complexity: 15,
    };
    const hard = {
      ...mockCandidates[1],
      isVerifiable: false,
      hasSpecifics: false,
      complexity: 70,
    };
    
    const scored = await agent.scoreCandidates(lowTimeObs, [easy, hard]);
    
    expect(scored[0].candidate).toBe(easy);
  });

  it('should return agent ID', () => {
    agent = new ValidatorAgent(runtime, 'test-validator-456');
    expect(agent.getId()).toBe('test-validator-456');
  });

  it('should dispose without error', async () => {
    agent = new ValidatorAgent(runtime, 'test-validator-1');
    await expect(agent.dispose()).resolves.toBeUndefined();
  });
});
