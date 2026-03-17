/**
 * EXPLORER FEATURE BUILDER
 *
 * Extracts a fixed-size feature vector for each link candidate,
 * combining query context, swarm state, and per-link properties.
 *
 * Feature layout (48 dimensions per candidate):
 *
 * Query context [0..15]:   16 dims — query properties + terrain + depth
 * Swarm context [16..31]:  16 dims — coverage, frontier, pheromone, progress
 * Link features [32..47]:  16 dims — URL, domain, content, source properties
 *
 * All features are normalized to [0,1] before model normalization.
 * This makes training stable and models portable across different deployments.
 */

import { AgentObservation, LinkCandidate } from '../agent-types';

/** Total feature dimensions per candidate */
export const EXPLORER_INPUT_DIM = 48;

/** Known terrain types for one-hot encoding */
const TERRAIN_TYPES = ['news', 'forum', 'docs', 'academic', 'company', 'general-web', 'social-signal'] as const;

/** Known TLDs that indicate higher authority */
const AUTHORITY_TLDS = new Set(['.edu', '.gov', '.org', '.ac.uk', '.gov.uk']);

/** Content-type indicators from URL patterns */
const DOCS_PATTERNS = ['/docs/', '/documentation/', '/api/', '/reference/', '/guide/', '/tutorial/'];
const ACADEMIC_PATTERNS = ['/paper/', '/abstract/', '/arxiv/', '/doi/', '/journal/', '/proceedings/'];
const NEWS_PATTERNS = ['/news/', '/article/', '/blog/', '/post/', '/press/'];

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Build feature vectors for a batch of link candidates.
 * Returns a 2D array [candidates.length × EXPLORER_INPUT_DIM].
 */
export function buildExplorerFeatures(
  observation: AgentObservation,
  candidates: LinkCandidate[],
  knownDomains: Set<string>,
): number[][] {
  const contextFeatures = buildContextFeatures(observation);
  return candidates.map(candidate =>
    buildCandidateFeatureVector(contextFeatures, candidate, observation, knownDomains),
  );
}

/**
 * Build the shared context feature vector (query + swarm state).
 * This is the same for all candidates in one scoring batch.
 */
function buildContextFeatures(obs: AgentObservation): number[] {
  // Query context [0..15]
  const queryFeatures = [
    obs.queryLengthNorm,                         // 0: query length (0-1)
    Math.min(1, obs.symbolCount / 10),           // 1: symbol count norm
    ...obs.terrainOneHot,                        // 2-8: terrain one-hot (7 dims)
    ...obs.depthOneHot,                          // 9-11: depth one-hot (3 dims)
    obs.timeBudgetRemaining,                     // 12: time budget remaining
    obs.coverageRatio,                           // 13: current coverage
    obs.frontierSizeNorm,                        // 14: frontier size
    obs.evidenceCountNorm,                       // 15: evidence count
  ];

  // Swarm context [16..31]
  const swarmFeatures = [
    obs.sourceDiversityNorm,                     // 16: source diversity
    obs.trailStrength,                           // 17: pheromone trail
    obs.interestStrength,                        // 18: pheromone interest
    obs.deadTrailStrength,                       // 19: dead trail
    obs.stepProgress,                            // 20: step progress
    obs.usefulnessScore,                         // 21: overlay usefulness
    obs.blockedRatioNorm,                        // 22: blocked ratio
    Math.max(0, 1 - obs.coverageRatio),          // 23: coverage gap (how much is still missing)
    obs.frontierSizeNorm > 0.5 ? 1 : 0,         // 24: frontier is large (binary)
    obs.evidenceCountNorm > 0.3 ? 1 : 0,         // 25: has sufficient evidence (binary)
    obs.timeBudgetRemaining > 0.5 ? 1 : 0,       // 26: plenty of time left (binary)
    obs.timeBudgetRemaining < 0.1 ? 1 : 0,       // 27: almost out of time (binary)
    obs.usefulnessScore > 0.5 ? 1 : 0,           // 28: already useful (binary)
    obs.deadTrailStrength > 0.3 ? 1 : 0,         // 29: dead trail warning (binary)
    0,                                           // 30: reserved
    0,                                           // 31: reserved
  ];

  return [...queryFeatures, ...swarmFeatures];
}

/**
 * Build the full feature vector for one candidate (context + link features).
 */
function buildCandidateFeatureVector(
  contextFeatures: number[],
  candidate: LinkCandidate,
  observation: AgentObservation,
  knownDomains: Set<string>,
): number[] {
  // Link features [32..47]
  const urlObj = safeParseUrl(candidate.url);
  const pathDepth = urlObj ? urlObj.pathname.split('/').filter(Boolean).length : 0;
  const domain = candidate.domain || (urlObj?.hostname ?? '');

  const linkFeatures = [
    knownDomains.has(domain) ? 1 : 0,                         // 32: domain already seen
    Math.min(1, candidate.discoveredDepth / 5),                // 33: discovered depth norm
    candidate.hasTitle ? 1 : 0,                                // 34: has title
    candidate.hasSnippet ? 1 : 0,                              // 35: has snippet
    terrainMatchScore(candidate.terrainHint, observation),     // 36: terrain match
    Math.min(1, candidate.sourcePriority),                     // 37: source priority
    domainAuthorityScore(domain),                              // 38: domain authority estimate
    Math.min(1, pathDepth / 8),                                // 39: URL path depth norm
    isSameOriginAsQuery(domain, knownDomains) ? 1 : 0,        // 40: is same origin
    contentTypeScore(candidate.url),                           // 41: content type signal
    providerReliabilityScore(candidate.sourceProviderId),      // 42: provider reliability
    urlFreshnessSignal(candidate.url),                         // 43: URL freshness hint
    hasQueryTermInUrl(candidate.url, candidate.title) ? 1 : 0, // 44: query relevance hint
    Math.min(1, (candidate.url.length) / 200),                // 45: URL length norm
    isHttps(candidate.url) ? 1 : 0,                           // 46: HTTPS
    0,                                                         // 47: reserved
  ];

  return [...contextFeatures, ...linkFeatures];
}

// ─────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────

function safeParseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function terrainMatchScore(terrainHint: string | undefined, obs: AgentObservation): number {
  if (!terrainHint) return 0.5; // Unknown terrain = neutral
  const idx = TERRAIN_TYPES.indexOf(terrainHint as typeof TERRAIN_TYPES[number]);
  if (idx < 0) return 0.3;
  return obs.terrainOneHot[idx] > 0 ? 1.0 : 0.2;
}

function domainAuthorityScore(domain: string): number {
  if (!domain) return 0;
  for (const tld of AUTHORITY_TLDS) {
    if (domain.endsWith(tld)) return 0.9;
  }
  // Well-known domains get a boost
  if (domain.includes('wikipedia')) return 0.85;
  if (domain.includes('github.com')) return 0.75;
  if (domain.includes('stackoverflow')) return 0.7;
  if (domain.includes('reuters') || domain.includes('bbc')) return 0.8;
  return 0.4; // Default
}

function isSameOriginAsQuery(domain: string, knownDomains: Set<string>): boolean {
  return knownDomains.has(domain);
}

function contentTypeScore(url: string): number {
  const lower = url.toLowerCase();
  for (const p of DOCS_PATTERNS) {
    if (lower.includes(p)) return 0.8;
  }
  for (const p of ACADEMIC_PATTERNS) {
    if (lower.includes(p)) return 0.85;
  }
  for (const p of NEWS_PATTERNS) {
    if (lower.includes(p)) return 0.7;
  }
  if (lower.endsWith('.pdf')) return 0.75;
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 0.5;
  return 0.4;
}

function providerReliabilityScore(providerId: string): number {
  // Higher scores for more reliable providers
  const scores: Record<string, number> = {
    search_bootstrap: 0.8,
    link_pathfinder: 0.6,
    rss_autodiscovery: 0.7,
    sitemap_probe: 0.65,
    evidence_link: 0.5,
    domain_bootstrap: 0.55,
  };
  return scores[providerId] ?? 0.4;
}

function urlFreshnessSignal(url: string): number {
  // Check for date-like patterns in URL (e.g., /2024/, /2025/)
  const yearMatch = url.match(/\/20(2[3-9]|[3-9]\d)\//);
  if (yearMatch) return 0.8;
  // Check for timestamps
  if (/\d{8,}/.test(url)) return 0.6;
  return 0.3; // No freshness signal
}

function hasQueryTermInUrl(url: string, title?: string): boolean {
  // Simple heuristic — URL or title contains non-trivial content words
  const text = `${url} ${title || ''}`.toLowerCase();
  return text.length > 20; // Placeholder — will be refined with actual query terms
}

function isHttps(url: string): boolean {
  return url.startsWith('https://');
}

// ─────────────────────────────────────────────
// Observation Builder
// ─────────────────────────────────────────────

export interface ExplorerObservationInput {
  queryLength: number;
  symbolCount: number;
  terrains: string[];
  depth: 'quick' | 'standard' | 'deep';
  timeBudgetRemaining: number;
  coverageRatio: number;
  frontierSize: number;
  evidenceCount: number;
  sourceDomainCount: number;
  trailStrength: number;
  interestStrength: number;
  deadTrailStrength: number;
  stepProgress: number;
  usefulnessScore: number;
  blockedCount: number;
  totalUrlsSeen: number;
}

/**
 * Build a normalized AgentObservation from raw inputs.
 */
export function buildExplorerObservation(input: ExplorerObservationInput): AgentObservation {
  const terrainOneHot = TERRAIN_TYPES.map(t => input.terrains.includes(t) ? 1 : 0);
  const depthOneHot = [
    input.depth === 'quick' ? 1 : 0,
    input.depth === 'standard' ? 1 : 0,
    input.depth === 'deep' ? 1 : 0,
  ];

  return {
    queryLengthNorm: Math.min(1, input.queryLength / 500),
    symbolCount: input.symbolCount,
    terrainOneHot,
    depthOneHot,
    timeBudgetRemaining: Math.max(0, Math.min(1, input.timeBudgetRemaining)),
    coverageRatio: Math.max(0, Math.min(1, input.coverageRatio)),
    frontierSizeNorm: Math.min(1, input.frontierSize / 200),
    evidenceCountNorm: Math.min(1, input.evidenceCount / 100),
    sourceDiversityNorm: Math.min(1, input.sourceDomainCount / 30),
    trailStrength: Math.max(0, Math.min(1, input.trailStrength)),
    interestStrength: Math.max(0, Math.min(1, input.interestStrength)),
    deadTrailStrength: Math.max(0, Math.min(1, input.deadTrailStrength)),
    stepProgress: Math.max(0, Math.min(1, input.stepProgress)),
    usefulnessScore: Math.max(0, Math.min(1, input.usefulnessScore)),
    blockedRatioNorm: input.totalUrlsSeen > 0
      ? Math.min(1, input.blockedCount / input.totalUrlsSeen)
      : 0,
  };
}
