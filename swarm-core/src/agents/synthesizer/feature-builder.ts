/**
 * SYNTHESIZER FEATURE BUILDER
 *
 * Extracts features for evidence combination decisions.
 * Scores which evidence items should be combined/synthesized together.
 *
 * Feature layout (40 dimensions per candidate):
 *
 * Query context [0..15]:   16 dims — same as explorer
 * Swarm context [16..23]:   8 dims — evidence state, coverage
 * Evidence features [24..39]: 16 dims — confidence, freshness, source quality, content richness
 *
 * The synthesizer decides which evidence items to prioritize for combination
 * based on quality, relevance, and diversity.
 */

import { AgentObservation, EvidenceCandidate } from '../agent-types';

/** Total feature dimensions per candidate */
export const SYNTHESIZER_INPUT_DIM = 40;

/** Known terrain types for one-hot encoding */
const TERRAIN_TYPES = ['news', 'forum', 'docs', 'academic', 'company', 'general-web', 'social-signal'] as const;

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Build feature vectors for a batch of evidence candidates.
 * Returns a 2D array [candidates.length × SYNTHESIZER_INPUT_DIM].
 */
export function buildSynthesizerFeatures(
  observation: AgentObservation,
  candidates: EvidenceCandidate[],
  seenDomains: Set<string>,
): number[][] {
  const contextFeatures = buildContextFeatures(observation);
  return candidates.map(candidate =>
    buildCandidateFeatureVector(contextFeatures, candidate, observation, seenDomains),
  );
}

/**
 * Build the shared context feature vector (query + swarm state).
 */
function buildContextFeatures(obs: AgentObservation): number[] {
  // Query context [0..15] — same as explorer
  const queryFeatures = [
    obs.queryLengthNorm,                         // 0
    Math.min(1, obs.symbolCount / 10),           // 1
    ...obs.terrainOneHot,                        // 2-8
    ...obs.depthOneHot,                          // 9-11
    obs.timeBudgetRemaining,                     // 12
    obs.coverageRatio,                           // 13
    obs.frontierSizeNorm,                        // 14
    obs.evidenceCountNorm,                       // 15
  ];

  // Swarm context [16..23] — synthesis-specific
  const swarmFeatures = [
    obs.sourceDiversityNorm,                     // 16: source diversity
    obs.usefulnessScore,                         // 17: current usefulness
    Math.max(0, 1 - obs.coverageRatio),          // 18: coverage gap
    obs.evidenceCountNorm > 0.5 ? 1 : 0,         // 19: has sufficient evidence
    obs.coverageRatio > 0.7 ? 1 : 0,             // 20: high coverage (prioritize quality)
    obs.coverageRatio < 0.3 ? 1 : 0,             // 21: low coverage (prioritize quantity)
    obs.timeBudgetRemaining > 0.5 ? 1 : 0,       // 22: plenty of time
    obs.timeBudgetRemaining < 0.1 ? 1 : 0,       // 23: almost out of time
  ];

  return [...queryFeatures, ...swarmFeatures];
}

/**
 * Build the full feature vector for one evidence candidate.
 */
function buildCandidateFeatureVector(
  contextFeatures: number[],
  candidate: EvidenceCandidate,
  observation: AgentObservation,
  seenDomains: Set<string>,
): number[] {
  // Evidence features [24..39]
  const evidenceFeatures = [
    candidate.confidence,                                    // 24: extraction confidence
    candidate.freshnessScore,                                // 25: freshness
    candidate.sourceScore,                                   // 26: source credibility
    candidate.relevanceScore,                                // 27: relevance to query
    Math.min(1, candidate.entityCount / 10),                 // 28: entity richness
    Math.min(1, candidate.phraseCount / 20),                 // 29: phrase richness
    Math.min(1, candidate.claimCount / 5),                   // 30: claim richness
    candidate.isCorroborated ? 1 : 0,                        // 31: corroborated
    Math.min(1, candidate.linkCount / 10),                   // 32: link richness
    (candidate.sentimentScore + 1) / 2,                      // 33: sentiment (normalized to 0-1)
    seenDomains.has(candidate.domain) ? 1 : 0,               // 34: domain already seen
    terrainMatchScore(candidate.terrain, observation),       // 35: terrain match
    domainDiversityBonus(candidate.domain, seenDomains),     // 36: diversity bonus
    qualityScore(candidate),                                 // 37: overall quality
    contentRichnessScore(candidate),                         // 38: content richness
    0,                                                       // 39: reserved
  ];

  return [...contextFeatures, ...evidenceFeatures];
}

// ─────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────

function terrainMatchScore(terrain: string, obs: AgentObservation): number {
  const idx = TERRAIN_TYPES.indexOf(terrain as typeof TERRAIN_TYPES[number]);
  if (idx < 0) return 0.3;
  return obs.terrainOneHot[idx] > 0 ? 1.0 : 0.2;
}

function domainDiversityBonus(domain: string, seenDomains: Set<string>): number {
  // Bonus for new domains (encourages diversity)
  return seenDomains.has(domain) ? 0.0 : 0.8;
}

function qualityScore(candidate: EvidenceCandidate): number {
  // Weighted combination of quality signals
  return Math.min(1, (
    candidate.confidence * 0.3 +
    candidate.sourceScore * 0.3 +
    candidate.relevanceScore * 0.2 +
    candidate.freshnessScore * 0.2
  ));
}

function contentRichnessScore(candidate: EvidenceCandidate): number {
  // How much useful content does this evidence have?
  const entityScore = Math.min(1, candidate.entityCount / 10);
  const phraseScore = Math.min(1, candidate.phraseCount / 20);
  const claimScore = Math.min(1, candidate.claimCount / 5);
  return (entityScore + phraseScore + claimScore) / 3;
}

// ─────────────────────────────────────────────
// Observation Builder (reuses explorer's buildExplorerObservation)
// ─────────────────────────────────────────────

export { buildExplorerObservation as buildSynthesizerObservation } from '../explorer/feature-builder';
