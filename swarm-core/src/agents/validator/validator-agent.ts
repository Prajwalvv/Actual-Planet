/**
 * VALIDATOR AGENT — Neural claim verifier
 *
 * Scores which claims should be prioritized for verification.
 * Helps decide which claims are most important to validate first.
 *
 * Modes:
 * - model:     Score using ONNX model
 * - heuristic: Score using hand-crafted rules (always available)
 * - shadow:    Run both, log model scores, use heuristic
 */

import { AgentModelRuntime } from '../agent-model-runtime';
import { AgentObservation, IAgentModel, ClaimCandidate, ScoredCandidate } from '../agent-types';
import { buildValidatorFeatures, VALIDATOR_INPUT_DIM } from './feature-builder';

export type ValidatorAgentMode = 'model' | 'heuristic' | 'shadow';

// ─────────────────────────────────────────────
// Validator Agent
// ─────────────────────────────────────────────

export class ValidatorAgent implements IAgentModel<ClaimCandidate> {
  private runtime: AgentModelRuntime;
  private mode: ValidatorAgentMode;
  private agentId: string;

  constructor(runtime: AgentModelRuntime, agentId: string, mode?: ValidatorAgentMode) {
    this.runtime = runtime;
    this.agentId = agentId;
    this.mode = mode || (runtime.isReady('validator') ? 'model' : 'heuristic');
  }

  isReady(): boolean {
    if (this.mode === 'heuristic') return true;
    return this.runtime.isReady('validator');
  }

  getMode(): ValidatorAgentMode {
    return this.mode;
  }

  getId(): string {
    return this.agentId;
  }

  /**
   * Score a batch of claim candidates.
   * Returns candidates sorted by score descending (best first).
   */
  async scoreCandidates(
    observation: AgentObservation,
    candidates: ClaimCandidate[],
  ): Promise<ScoredCandidate<ClaimCandidate>[]> {
    if (candidates.length === 0) return [];

    const verifiedDomains = new Set(candidates.map(c => c.sourceDomain).filter(Boolean));
    const heuristicScores = heuristicScore(observation, candidates, verifiedDomains);

    if (this.mode === 'heuristic') {
      return rankCandidates(candidates, heuristicScores);
    }

    const features = buildValidatorFeatures(observation, candidates, verifiedDomains);
    const modelScores = await this.runtime.scoreBatch('validator', features);

    if (!modelScores) {
      console.warn(`[ValidatorAgent:${this.agentId}] Model inference failed, using heuristic`);
      return rankCandidates(candidates, heuristicScores);
    }

    if (this.mode === 'shadow') {
      logShadowComparison(this.agentId, candidates, heuristicScores, modelScores);
      return rankCandidates(candidates, heuristicScores);
    }

    return rankCandidates(candidates, modelScores);
  }

  async dispose(): Promise<void> {
    // Session is shared via runtime
  }
}

// ─────────────────────────────────────────────
// Heuristic Scorer (baseline / fallback)
// ─────────────────────────────────────────────

/**
 * Score claim candidates using hand-crafted heuristics.
 * Prioritizes: verifiable, important, credible, diverse sources.
 */
function heuristicScore(
  obs: AgentObservation,
  candidates: ClaimCandidate[],
  verifiedDomains: Set<string>,
): Float32Array {
  const scores = new Float32Array(candidates.length);

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    let score = 0;

    // Base credibility score
    score += c.sourceConfidence * 0.15;
    score += c.sourceCredibility * 0.2;

    // Verifiability
    if (c.isVerifiable) score += 0.2;
    if (c.hasSpecifics) score += 0.15;

    // Importance (mention count)
    const mentionScore = Math.min(1, c.mentionCount / 5);
    score += mentionScore * 0.15;

    // Terrain authority
    const terrainScores: Record<string, number> = {
      academic: 0.09,
      docs: 0.08,
      news: 0.07,
      company: 0.06,
      forum: 0.04,
      'social-signal': 0.03,
      'general-web': 0.05,
    };
    score += terrainScores[c.sourceTerrain] ?? 0.05;

    // Domain diversity bonus
    if (!verifiedDomains.has(c.sourceDomain)) {
      score += 0.07;
    }

    // Complexity penalty (very complex claims are harder to verify)
    if (c.complexity > 50) {
      score -= 0.05;
    } else if (c.complexity < 20) {
      score += 0.03; // Simple claims are easier
    }

    // Corroboration bonus
    if (c.mentionCount > 1) {
      score += 0.05;
    }

    // High credibility source bonus
    if (c.sourceCredibility > 0.7) {
      score += 0.05;
    }

    // Coverage-based prioritization
    if (obs.coverageRatio < 0.5) {
      // Low coverage: prioritize high-credibility claims
      if (c.sourceCredibility > 0.6) {
        score += 0.04;
      }
    }

    // Time pressure: prioritize easy-to-verify claims
    if (obs.timeBudgetRemaining < 0.2) {
      if (c.isVerifiable && c.hasSpecifics && c.complexity < 30) {
        score += 0.06;
      }
    }

    scores[i] = Math.max(0, Math.min(1, score));
  }

  return scores;
}

// ─────────────────────────────────────────────
// Ranking
// ─────────────────────────────────────────────

function rankCandidates(
  candidates: ClaimCandidate[],
  scores: Float32Array,
): ScoredCandidate<ClaimCandidate>[] {
  const scored: ScoredCandidate<ClaimCandidate>[] = candidates.map((candidate, i) => ({
    candidate,
    score: scores[i],
    rank: 0,
  }));

  scored.sort((a, b) => b.score - a.score);

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
  candidates: ClaimCandidate[],
  heuristicScores: Float32Array,
  modelScores: Float32Array,
): void {
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

  console.info(
    `[ValidatorAgent:${agentId}:shadow] candidates=${n} spearman=${spearman.toFixed(3)}`,
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
