import { describe, it, expect } from 'vitest';
import { buildValidatorFeatures, VALIDATOR_INPUT_DIM } from '../validator/feature-builder';
import { AgentObservation, ClaimCandidate } from '../agent-types';

describe('ValidatorFeatureBuilder', () => {
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

  const mockCandidate: ClaimCandidate = {
    claim: 'Test claim with specific facts',
    sourceEvidenceId: 'ev1',
    sourceDomain: 'academic.edu',
    sourceTerrain: 'academic',
    sourceConfidence: 0.85,
    sourceCredibility: 0.9,
    mentionCount: 3,
    hasSpecifics: true,
    isVerifiable: true,
    complexity: 25,
  };

  it('should build feature vectors with correct dimensions', () => {
    const candidates = [mockCandidate];
    const verifiedDomains = new Set<string>();
    
    const features = buildValidatorFeatures(mockObservation, candidates, verifiedDomains);
    
    expect(features).toHaveLength(1);
    expect(features[0]).toHaveLength(VALIDATOR_INPUT_DIM);
  });

  it('should include query context features [0..15]', () => {
    const candidates = [mockCandidate];
    const verifiedDomains = new Set<string>();
    
    const features = buildValidatorFeatures(mockObservation, candidates, verifiedDomains);
    const vec = features[0];
    
    expect(vec[0]).toBe(0.5); // queryLengthNorm
    expect(vec[1]).toBeCloseTo(0.3, 1); // symbolCount normalized
    expect(vec[5]).toBe(1); // terrain one-hot (academic)
    expect(vec[12]).toBe(0.6); // timeBudgetRemaining
    expect(vec[13]).toBe(0.5); // coverageRatio
  });

  it('should include swarm context features [16..19]', () => {
    const candidates = [mockCandidate];
    const verifiedDomains = new Set<string>();
    
    const features = buildValidatorFeatures(mockObservation, candidates, verifiedDomains);
    const vec = features[0];
    
    expect(vec[16]).toBe(0.7); // usefulnessScore
    expect(vec[17]).toBe(1); // has decent coverage
    expect(vec[18]).toBe(1); // enough time for validation
    expect(vec[19]).toBe(1); // has evidence to validate
  });

  it('should include claim features [20..35]', () => {
    const candidates = [mockCandidate];
    const verifiedDomains = new Set<string>();
    
    const features = buildValidatorFeatures(mockObservation, candidates, verifiedDomains);
    const vec = features[0];
    
    expect(vec[20]).toBe(0.85); // sourceConfidence
    expect(vec[21]).toBe(0.9); // sourceCredibility
    expect(vec[22]).toBeCloseTo(0.6, 1); // mentionCount normalized
    expect(vec[23]).toBe(1); // hasSpecifics
    expect(vec[24]).toBe(1); // isVerifiable
    expect(vec[25]).toBeCloseTo(0.5, 1); // complexity normalized
  });

  it('should handle domain verification tracking', () => {
    const candidates = [mockCandidate];
    const verifiedDomains = new Set<string>();
    
    const features1 = buildValidatorFeatures(mockObservation, candidates, verifiedDomains);
    expect(features1[0][26]).toBe(0); // domain not verified yet
    
    verifiedDomains.add('academic.edu');
    const features2 = buildValidatorFeatures(mockObservation, candidates, verifiedDomains);
    expect(features2[0][26]).toBe(1); // domain already verified
  });

  it('should handle terrain matching', () => {
    const academicCandidate = { ...mockCandidate, sourceTerrain: 'academic' };
    const newsCandidate = { ...mockCandidate, sourceTerrain: 'news' };
    const verifiedDomains = new Set<string>();
    
    const academicObs = { ...mockObservation, terrainOneHot: [0, 0, 0, 1, 0, 0, 0] };
    const academicFeatures = buildValidatorFeatures(academicObs, [academicCandidate], verifiedDomains);
    expect(academicFeatures[0][27]).toBe(1.0); // terrain match
    
    const newsFeatures = buildValidatorFeatures(academicObs, [newsCandidate], verifiedDomains);
    expect(newsFeatures[0][27]).toBe(0.2); // terrain mismatch
  });

  it('should assign terrain authority scores', () => {
    const verifiedDomains = new Set<string>();
    
    const academicCandidate = { ...mockCandidate, sourceTerrain: 'academic' };
    const forumCandidate = { ...mockCandidate, sourceTerrain: 'forum' };
    
    const academicFeatures = buildValidatorFeatures(mockObservation, [academicCandidate], verifiedDomains);
    const forumFeatures = buildValidatorFeatures(mockObservation, [forumCandidate], verifiedDomains);
    
    expect(academicFeatures[0][28]).toBeGreaterThan(forumFeatures[0][28]); // academic > forum
  });

  it('should compute importance score', () => {
    const highImportance = {
      ...mockCandidate,
      sourceCredibility: 0.9,
      hasSpecifics: true,
      isVerifiable: true,
      mentionCount: 5,
    };
    const lowImportance = {
      ...mockCandidate,
      sourceCredibility: 0.3,
      hasSpecifics: false,
      isVerifiable: false,
      mentionCount: 1,
    };
    const verifiedDomains = new Set<string>();
    
    const highFeatures = buildValidatorFeatures(mockObservation, [highImportance], verifiedDomains);
    const lowFeatures = buildValidatorFeatures(mockObservation, [lowImportance], verifiedDomains);
    
    expect(highFeatures[0][29]).toBeGreaterThan(lowFeatures[0][29]);
  });

  it('should compute verifiability score', () => {
    const easyToVerify = {
      ...mockCandidate,
      isVerifiable: true,
      hasSpecifics: true,
      complexity: 15,
    };
    const hardToVerify = {
      ...mockCandidate,
      isVerifiable: false,
      hasSpecifics: false,
      complexity: 60,
    };
    const verifiedDomains = new Set<string>();
    
    const easyFeatures = buildValidatorFeatures(mockObservation, [easyToVerify], verifiedDomains);
    const hardFeatures = buildValidatorFeatures(mockObservation, [hardToVerify], verifiedDomains);
    
    expect(easyFeatures[0][30]).toBeGreaterThan(hardFeatures[0][30]);
  });

  it('should handle diversity bonus', () => {
    const candidates = [mockCandidate];
    const verifiedDomains = new Set<string>();
    
    const features1 = buildValidatorFeatures(mockObservation, candidates, verifiedDomains);
    expect(features1[0][32]).toBeGreaterThan(0); // diversity bonus for new domain
    
    verifiedDomains.add('academic.edu');
    const features2 = buildValidatorFeatures(mockObservation, candidates, verifiedDomains);
    expect(features2[0][32]).toBe(0); // no bonus for verified domain
  });

  it('should batch multiple candidates', () => {
    const candidates = [
      mockCandidate,
      { ...mockCandidate, claim: 'Second claim', sourceDomain: 'news.com' },
      { ...mockCandidate, claim: 'Third claim', sourceDomain: 'docs.org' },
    ];
    const verifiedDomains = new Set<string>();
    
    const features = buildValidatorFeatures(mockObservation, candidates, verifiedDomains);
    
    expect(features).toHaveLength(3);
    features.forEach(vec => {
      expect(vec).toHaveLength(VALIDATOR_INPUT_DIM);
    });
  });

  it('should handle corroboration flag', () => {
    const corroborated = { ...mockCandidate, mentionCount: 3 };
    const uncorroborated = { ...mockCandidate, mentionCount: 1 };
    const verifiedDomains = new Set<string>();
    
    const corrFeatures = buildValidatorFeatures(mockObservation, [corroborated], verifiedDomains);
    const uncorrFeatures = buildValidatorFeatures(mockObservation, [uncorroborated], verifiedDomains);
    
    expect(corrFeatures[0][33]).toBe(1); // corroborated
    expect(uncorrFeatures[0][33]).toBe(0); // not corroborated
  });

  it('should handle high credibility flag', () => {
    const highCred = { ...mockCandidate, sourceCredibility: 0.8 };
    const lowCred = { ...mockCandidate, sourceCredibility: 0.5 };
    const verifiedDomains = new Set<string>();
    
    const highFeatures = buildValidatorFeatures(mockObservation, [highCred], verifiedDomains);
    const lowFeatures = buildValidatorFeatures(mockObservation, [lowCred], verifiedDomains);
    
    expect(highFeatures[0][34]).toBe(1); // high credibility
    expect(lowFeatures[0][34]).toBe(0); // not high credibility
  });
});
