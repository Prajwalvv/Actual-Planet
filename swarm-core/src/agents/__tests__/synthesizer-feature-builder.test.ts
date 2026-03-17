import { describe, it, expect } from 'vitest';
import { buildSynthesizerFeatures, SYNTHESIZER_INPUT_DIM } from '../synthesizer/feature-builder';
import { AgentObservation, EvidenceCandidate } from '../agent-types';

describe('SynthesizerFeatureBuilder', () => {
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

  const mockCandidate: EvidenceCandidate = {
    id: 'ev1',
    domain: 'example.com',
    terrain: 'news',
    confidence: 0.8,
    freshnessScore: 0.9,
    sourceScore: 0.7,
    relevanceScore: 0.85,
    entityCount: 5,
    phraseCount: 10,
    claimCount: 3,
    isCorroborated: true,
    linkCount: 8,
    sentimentScore: 0.2,
  };

  it('should build feature vectors with correct dimensions', () => {
    const candidates = [mockCandidate];
    const seenDomains = new Set<string>();
    
    const features = buildSynthesizerFeatures(mockObservation, candidates, seenDomains);
    
    expect(features).toHaveLength(1);
    expect(features[0]).toHaveLength(SYNTHESIZER_INPUT_DIM);
  });

  it('should include query context features [0..15]', () => {
    const candidates = [mockCandidate];
    const seenDomains = new Set<string>();
    
    const features = buildSynthesizerFeatures(mockObservation, candidates, seenDomains);
    const vec = features[0];
    
    expect(vec[0]).toBe(0.5); // queryLengthNorm
    expect(vec[1]).toBeCloseTo(0.3, 1); // symbolCount normalized
    expect(vec[2]).toBe(1); // terrain one-hot (news)
    expect(vec[12]).toBe(0.8); // timeBudgetRemaining
    expect(vec[13]).toBe(0.3); // coverageRatio
  });

  it('should include swarm context features [16..23]', () => {
    const candidates = [mockCandidate];
    const seenDomains = new Set<string>();
    
    const features = buildSynthesizerFeatures(mockObservation, candidates, seenDomains);
    const vec = features[0];
    
    expect(vec[16]).toBe(0.6); // sourceDiversityNorm
    expect(vec[17]).toBe(0.7); // usefulnessScore
    expect(vec[18]).toBeCloseTo(0.7, 1); // coverage gap
    expect(vec[21]).toBe(1); // low coverage flag
  });

  it('should include evidence features [24..39]', () => {
    const candidates = [mockCandidate];
    const seenDomains = new Set<string>();
    
    const features = buildSynthesizerFeatures(mockObservation, candidates, seenDomains);
    const vec = features[0];
    
    expect(vec[24]).toBe(0.8); // confidence
    expect(vec[25]).toBe(0.9); // freshnessScore
    expect(vec[26]).toBe(0.7); // sourceScore
    expect(vec[27]).toBe(0.85); // relevanceScore
    expect(vec[31]).toBe(1); // isCorroborated
  });

  it('should handle domain diversity bonus', () => {
    const candidates = [mockCandidate];
    const seenDomains = new Set<string>();
    
    const features1 = buildSynthesizerFeatures(mockObservation, candidates, seenDomains);
    expect(features1[0][36]).toBeGreaterThan(0); // diversity bonus for new domain
    
    seenDomains.add('example.com');
    const features2 = buildSynthesizerFeatures(mockObservation, candidates, seenDomains);
    expect(features2[0][36]).toBe(0); // no bonus for seen domain
  });

  it('should handle terrain matching', () => {
    const newsCandidate = { ...mockCandidate, terrain: 'news' };
    const forumCandidate = { ...mockCandidate, terrain: 'forum' };
    const seenDomains = new Set<string>();
    
    const newsObs = { ...mockObservation, terrainOneHot: [1, 0, 0, 0, 0, 0, 0] };
    const newsFeatures = buildSynthesizerFeatures(newsObs, [newsCandidate], seenDomains);
    expect(newsFeatures[0][35]).toBe(1.0); // terrain match
    
    const forumFeatures = buildSynthesizerFeatures(newsObs, [forumCandidate], seenDomains);
    expect(forumFeatures[0][35]).toBe(0.2); // terrain mismatch
  });

  it('should batch multiple candidates', () => {
    const candidates = [
      mockCandidate,
      { ...mockCandidate, id: 'ev2', domain: 'other.com' },
      { ...mockCandidate, id: 'ev3', domain: 'third.com' },
    ];
    const seenDomains = new Set<string>();
    
    const features = buildSynthesizerFeatures(mockObservation, candidates, seenDomains);
    
    expect(features).toHaveLength(3);
    features.forEach(vec => {
      expect(vec).toHaveLength(SYNTHESIZER_INPUT_DIM);
    });
  });

  it('should normalize entity/phrase/claim counts', () => {
    const richCandidate = {
      ...mockCandidate,
      entityCount: 20,
      phraseCount: 50,
      claimCount: 10,
    };
    const seenDomains = new Set<string>();
    
    const features = buildSynthesizerFeatures(mockObservation, [richCandidate], seenDomains);
    const vec = features[0];
    
    expect(vec[28]).toBeLessThanOrEqual(1); // entityCount normalized
    expect(vec[29]).toBeLessThanOrEqual(1); // phraseCount normalized
    expect(vec[30]).toBeLessThanOrEqual(1); // claimCount normalized
  });

  it('should normalize sentiment score to [0, 1]', () => {
    const negativeCandidate = { ...mockCandidate, sentimentScore: -0.8 };
    const positiveCandidate = { ...mockCandidate, sentimentScore: 0.6 };
    const seenDomains = new Set<string>();
    
    const negFeatures = buildSynthesizerFeatures(mockObservation, [negativeCandidate], seenDomains);
    const posFeatures = buildSynthesizerFeatures(mockObservation, [positiveCandidate], seenDomains);
    
    expect(negFeatures[0][33]).toBeCloseTo(0.1, 1); // (-0.8 + 1) / 2
    expect(posFeatures[0][33]).toBeCloseTo(0.8, 1); // (0.6 + 1) / 2
  });
});
