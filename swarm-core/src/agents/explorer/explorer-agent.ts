/**
 * EXPLORER AGENT — Neural link scorer for explorer/pathfinder ants
 *
 * Each explorer agent instance wraps the shared ONNX model and provides
 * a high-level API for scoring link candidates. Multiple agent instances
 * share the same underlying ONNX session via AgentModelRuntime.
 *
 * Modes:
 * - model:     Score using ONNX model (requires trained model)
 * - heuristic: Score using hand-crafted rules (always available)
 * - shadow:    Run both, log model scores, use heuristic (for validation)
 *
 * The heuristic scorer serves as both:
 * 1. Fallback when model is unavailable
 * 2. Baseline to compare model performance against
 * 3. Training data source (imitation learning)
 */

import { AgentModelRuntime } from '../agent-model-runtime';
import { AgentObservation, IAgentModel, LinkCandidate, ScoredCandidate } from '../agent-types';
import { buildExplorerFeatures, EXPLORER_INPUT_DIM } from './feature-builder';

export type ExplorerAgentMode = 'model' | 'heuristic' | 'shadow';

// ─────────────────────────────────────────────
// Explorer Agent
// ─────────────────────────────────────────────

export class ExplorerAgent implements IAgentModel<LinkCandidate> {
  private runtime: AgentModelRuntime;
  private mode: ExplorerAgentMode;
  private agentId: string;

  constructor(runtime: AgentModelRuntime, agentId: string, mode?: ExplorerAgentMode) {
    this.runtime = runtime;
    this.agentId = agentId;
    this.mode = mode || (runtime.isReady('explorer') ? 'model' : 'heuristic');
  }

  isReady(): boolean {
    if (this.mode === 'heuristic') return true;
    return this.runtime.isReady('explorer');
  }

  getMode(): ExplorerAgentMode {
    return this.mode;
  }

  getId(): string {
    return this.agentId;
  }

  /**
   * Score a batch of link candidates.
   * Returns candidates sorted by score descending (best first).
   */
  async scoreCandidates(
    observation: AgentObservation,
    candidates: LinkCandidate[],
  ): Promise<ScoredCandidate<LinkCandidate>[]> {
    if (candidates.length === 0) return [];

    // Collect known domains from candidates for feature building
    const knownDomains = new Set(candidates.map(c => c.domain).filter(Boolean));

    const heuristicScores = heuristicScore(observation, candidates, knownDomains);

    if (this.mode === 'heuristic') {
      return rankCandidates(candidates, heuristicScores);
    }

    // Build feature vectors
    const features = buildExplorerFeatures(observation, candidates, knownDomains);

    // Run model inference
    const modelScores = await this.runtime.scoreBatch('explorer', features);

    if (!modelScores) {
      // Model inference failed — fall back to heuristic
      console.warn(`[ExplorerAgent:${this.agentId}] Model inference failed, using heuristic`);
      return rankCandidates(candidates, heuristicScores);
    }

    if (this.mode === 'shadow') {
      // In shadow mode: log model scores for comparison but use heuristic
      logShadowComparison(this.agentId, candidates, heuristicScores, modelScores);
      return rankCandidates(candidates, heuristicScores);
    }

    // Model mode: use model scores
    return rankCandidates(candidates, modelScores);
  }

  async dispose(): Promise<void> {
    // Nothing to dispose — session is shared via runtime
  }
}

// ─────────────────────────────────────────────
// Heuristic Scorer (baseline / fallback)
// ─────────────────────────────────────────────

/** Known TLDs with higher authority */
const AUTHORITY_TLDS = new Set(['.edu', '.gov', '.org', '.ac.uk']);

/** Content patterns that correlate with high-value pages */
const HIGH_VALUE_PATTERNS = ['/docs/', '/api/', '/reference/', '/paper/', '/abstract/'];

/**
 * Score candidates using hand-crafted heuristics.
 * This is the baseline scorer and training signal source.
 */
function heuristicScore(
  obs: AgentObservation,
  candidates: LinkCandidate[],
  knownDomains: Set<string>,
): Float32Array {
  const scores = new Float32Array(candidates.length);

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    let score = 0;

    // Base score from source priority
    score += c.sourcePriority * 0.25;

    // Title and snippet availability boost
    if (c.hasTitle) score += 0.15;
    if (c.hasSnippet) score += 0.10;

    // Domain diversity: prefer unexplored domains
    if (!knownDomains.has(c.domain)) {
      score += 0.12;
    }

    // Domain authority
    const domain = c.domain || '';
    for (const tld of AUTHORITY_TLDS) {
      if (domain.endsWith(tld)) {
        score += 0.15;
        break;
      }
    }

    // Content type signals from URL
    const lowerUrl = c.url.toLowerCase();
    for (const pattern of HIGH_VALUE_PATTERNS) {
      if (lowerUrl.includes(pattern)) {
        score += 0.10;
        break;
      }
    }

    // HTTPS preference
    if (c.url.startsWith('https://')) score += 0.05;

    // Depth penalty: deeper pages are less likely to be useful
    score -= Math.min(0.15, c.discoveredDepth * 0.03);

    // Time pressure: when running low on time, prefer high-priority candidates
    if (obs.timeBudgetRemaining < 0.2) {
      score += c.sourcePriority * 0.15; // Double-weight priority under time pressure
    }

    // Coverage gap: when coverage is low, prefer diverse terrain
    if (obs.coverageRatio < 0.3) {
      score += 0.08; // Slight exploration bonus
    }

    // Dead trail penalty: if pheromone signals indicate dead-ends
    if (obs.deadTrailStrength > 0.3) {
      score -= 0.05;
    }

    // Terrain match bonus
    if (c.terrainHint) {
      const terrainIdx = ['news', 'forum', 'docs', 'academic', 'company', 'general-web', 'social-signal']
        .indexOf(c.terrainHint);
      if (terrainIdx >= 0 && obs.terrainOneHot[terrainIdx] > 0) {
        score += 0.08;
      }
    }

    // Clamp to [0, 1]
    scores[i] = Math.max(0, Math.min(1, score));
  }

  return scores;
}

// ─────────────────────────────────────────────
// Ranking
// ─────────────────────────────────────────────

function rankCandidates(
  candidates: LinkCandidate[],
  scores: Float32Array,
): ScoredCandidate<LinkCandidate>[] {
  const scored: ScoredCandidate<LinkCandidate>[] = candidates.map((candidate, i) => ({
    candidate,
    score: scores[i],
    rank: 0,
  }));

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // Assign ranks
  for (let i = 0; i < scored.length; i++) {
    scored[i].rank = i;
  }

  return scored;
}

// ─────────────────────────────────────────────
// Shadow Mode Logging
// ─────────────────────────────────────────────

function logShadowComparison(
  agentId: string,
  candidates: LinkCandidate[],
  heuristicScores: Float32Array,
  modelScores: Float32Array,
): void {
  // Compute rank correlation (Spearman-like)
  const n = candidates.length;
  if (n < 2) return;

  const hRanks = rankIndices(heuristicScores);
  const mRanks = rankIndices(modelScores);

  let rankDiffSq = 0;
  for (let i = 0; i < n; i++) {
    const d = hRanks[i] - mRanks[i];
    rankDiffSq += d * d;
  }
  const spearman = 1 - (6 * rankDiffSq) / (n * (n * n - 1));

  // Log top-3 disagreements
  const disagreements: string[] = [];
  for (let i = 0; i < Math.min(5, n); i++) {
    const hIdx = hRanks.indexOf(i);
    const mIdx = mRanks.indexOf(i);
    if (hIdx !== mIdx) {
      disagreements.push(`rank${i}: heuristic→${candidates[hIdx]?.domain} vs model→${candidates[mIdx]?.domain}`);
    }
  }

  console.info(
    `[ExplorerAgent:${agentId}:shadow] candidates=${n} spearman=${spearman.toFixed(3)}` +
    (disagreements.length > 0 ? ` disagreements: ${disagreements.join('; ')}` : ' (agreement)'),
  );
}

function rankIndices(scores: Float32Array): number[] {
  const indexed = Array.from(scores).map((s, i) => ({ s, i }));
  indexed.sort((a, b) => b.s - a.s);
  const ranks = new Array(scores.length);
  for (let r = 0; r < indexed.length; r++) {
    ranks[indexed[r].i] = r;
  }
  return ranks;
}
