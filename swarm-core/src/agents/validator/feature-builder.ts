/**
 * VALIDATOR FEATURE BUILDER
 *
 * Extracts features for claim verification priority decisions.
 * Scores which claims should be validated first.
 *
 * Feature layout (36 dimensions per candidate):
 *
 * Query context [0..15]:   16 dims — same as explorer
 * Swarm context [16..19]:   4 dims — validation state
 * Claim features [20..35]:  16 dims — verifiability, source quality, importance
 *
 * The validator decides which claims to verify first based on
 * importance, verifiability, and source credibility.
 */

import { AgentObservation, ClaimCandidate } from '../agent-types';

/** Total feature dimensions per candidate */
export const VALIDATOR_INPUT_DIM = 36;

/** Known terrain types for one-hot encoding */
const TERRAIN_TYPES = ['news', 'forum', 'docs', 'academic', 'company', 'general-web', 'social-signal'] as const;

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Build feature vectors for a batch of claim candidates.
 * Returns a 2D array [candidates.length × VALIDATOR_INPUT_DIM].
 */
export function buildValidatorFeatures(
  observation: AgentObservation,
  candidates: ClaimCandidate[],
  verifiedDomains: Set<string>,
): number[][] {
  const contextFeatures = buildContextFeatures(observation);
  return candidates.map(candidate =>
    buildCandidateFeatureVector(contextFeatures, candidate, observation, verifiedDomains),
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

  // Swarm context [16..19] — validation-specific
  const swarmFeatures = [
    obs.usefulnessScore,                         // 16: current usefulness
    obs.coverageRatio > 0.5 ? 1 : 0,             // 17: has decent coverage
    obs.timeBudgetRemaining > 0.3 ? 1 : 0,       // 18: enough time for validation
    obs.evidenceCountNorm > 0.3 ? 1 : 0,         // 19: has evidence to validate
  ];

  return [...queryFeatures, ...swarmFeatures];
}

/**
 * Build the full feature vector for one claim candidate.
 */
function buildCandidateFeatureVector(
  contextFeatures: number[],
  candidate: ClaimCandidate,
  observation: AgentObservation,
  verifiedDomains: Set<string>,
): number[] {
  // Claim features [20..35]
  const claimFeatures = [
    candidate.sourceConfidence,                              // 20: source confidence
    candidate.sourceCredibility,                             // 21: source credibility
    Math.min(1, candidate.mentionCount / 5),                 // 22: how many sources mention this
    candidate.hasSpecifics ? 1 : 0,                          // 23: has specific facts/numbers
    candidate.isVerifiable ? 1 : 0,                          // 24: is verifiable (not opinion)
    Math.min(1, candidate.complexity / 50),                  // 25: claim complexity (word count)
    verifiedDomains.has(candidate.sourceDomain) ? 1 : 0,     // 26: source already verified
    terrainMatchScore(candidate.sourceTerrain, observation), // 27: terrain match
    terrainAuthorityScore(candidate.sourceTerrain),          // 28: terrain authority
    importanceScore(candidate),                              // 29: overall importance
    verifiabilityScore(candidate),                           // 30: how easy to verify
    urgencyScore(candidate, observation),                    // 31: validation urgency
    diversityBonus(candidate.sourceDomain, verifiedDomains), // 32: source diversity bonus
    candidate.mentionCount > 1 ? 1 : 0,                      // 33: corroborated by multiple sources
    candidate.sourceCredibility > 0.7 ? 1 : 0,               // 34: high credibility source
    0,                                                       // 35: reserved
  ];

  return [...contextFeatures, ...claimFeatures];
}

// ─────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────

function terrainMatchScore(terrain: string, obs: AgentObservation): number {
  const idx = TERRAIN_TYPES.indexOf(terrain as typeof TERRAIN_TYPES[number]);
  if (idx < 0) return 0.3;
  return obs.terrainOneHot[idx] > 0 ? 1.0 : 0.2;
}

function terrainAuthorityScore(terrain: string): number {
  // Some terrains are inherently more authoritative
  const scores: Record<string, number> = {
    academic: 0.9,
    docs: 0.8,
    news: 0.7,
    company: 0.6,
    forum: 0.4,
    'social-signal': 0.3,
    'general-web': 0.5,
  };
  return scores[terrain] ?? 0.5;
}

function importanceScore(candidate: ClaimCandidate): number {
  // Claims with specifics and high credibility are more important
  let score = candidate.sourceCredibility * 0.4;
  if (candidate.hasSpecifics) score += 0.3;
  if (candidate.isVerifiable) score += 0.2;
  if (candidate.mentionCount > 1) score += 0.1;
  return Math.min(1, score);
}

function verifiabilityScore(candidate: ClaimCandidate): number {
  // How easy is this claim to verify?
  let score = 0.5;
  if (candidate.isVerifiable) score += 0.3;
  if (candidate.hasSpecifics) score += 0.2; // Specific facts are easier to verify
  if (candidate.complexity < 20) score += 0.1; // Simple claims are easier
  if (candidate.mentionCount > 1) score -= 0.1; // Multiple mentions = already somewhat verified
  return Math.max(0, Math.min(1, score));
}

function urgencyScore(candidate: ClaimCandidate, obs: AgentObservation): number {
  // Should we validate this claim urgently?
  let urgency = 0.5;
  
  // High credibility source with low coverage = urgent (need to confirm)
  if (candidate.sourceCredibility > 0.7 && obs.coverageRatio < 0.5) {
    urgency += 0.2;
  }
  
  // Low credibility source with high mention count = urgent (contradictory signal)
  if (candidate.sourceCredibility < 0.4 && candidate.mentionCount > 2) {
    urgency += 0.3;
  }
  
  // Time pressure
  if (obs.timeBudgetRemaining < 0.2) {
    urgency -= 0.2; // Deprioritize when low on time
  }
  
  return Math.max(0, Math.min(1, urgency));
}

function diversityBonus(domain: string, verifiedDomains: Set<string>): number {
  // Bonus for verifying new domains
  return verifiedDomains.has(domain) ? 0.0 : 0.7;
}

// ─────────────────────────────────────────────
// Observation Builder (reuses explorer's buildExplorerObservation)
// ─────────────────────────────────────────────

export { buildExplorerObservation as buildValidatorObservation } from '../explorer/feature-builder';
