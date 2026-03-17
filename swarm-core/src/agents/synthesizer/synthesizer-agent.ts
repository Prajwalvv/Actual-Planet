/**
 * SYNTHESIZER AGENT — Neural evidence combiner
 *
 * Scores which evidence items should be prioritized for synthesis/combination.
 * Helps decide which pieces of evidence are most valuable to include in the final output.
 *
 * Modes:
 * - model:     Score using ONNX model
 * - heuristic: Score using hand-crafted rules (always available)
 * - shadow:    Run both, log model scores, use heuristic
 */

import { AgentModelRuntime } from '../agent-model-runtime';
import { AgentObservation, IAgentModel, EvidenceCandidate, ScoredCandidate } from '../agent-types';
import { buildSynthesizerFeatures, SYNTHESIZER_INPUT_DIM } from './feature-builder';

export type SynthesizerAgentMode = 'model' | 'heuristic' | 'shadow';

// ─────────────────────────────────────────────
// Synthesizer Agent
// ─────────────────────────────────────────────

export class SynthesizerAgent implements IAgentModel<EvidenceCandidate> {
  private runtime: AgentModelRuntime;
  private mode: SynthesizerAgentMode;
  private agentId: string;

  constructor(runtime: AgentModelRuntime, agentId: string, mode?: SynthesizerAgentMode) {
    this.runtime = runtime;
    this.agentId = agentId;
    this.mode = mode || (runtime.isReady('synthesizer') ? 'model' : 'heuristic');
  }

  isReady(): boolean {
    if (this.mode === 'heuristic') return true;
    return this.runtime.isReady('synthesizer');
  }

  getMode(): SynthesizerAgentMode {
    return this.mode;
  }

  getId(): string {
    return this.agentId;
  }

  /**
   * Score a batch of evidence candidates.
   * Returns candidates sorted by score descending (best first).
   */
  async scoreCandidates(
    observation: AgentObservation,
    candidates: EvidenceCandidate[],
  ): Promise<ScoredCandidate<EvidenceCandidate>[]> {
    if (candidates.length === 0) return [];

    const seenDomains = new Set(candidates.map(c => c.domain).filter(Boolean));
    const heuristicScores = heuristicScore(observation, candidates, seenDomains);

    if (this.mode === 'heuristic') {
      return rankCandidates(candidates, heuristicScores);
    }

    const features = buildSynthesizerFeatures(observation, candidates, seenDomains);
    const modelScores = await this.runtime.scoreBatch('synthesizer', features);

    if (!modelScores) {
      console.warn(`[SynthesizerAgent:${this.agentId}] Model inference failed, using heuristic`);
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
 * Score evidence candidates using hand-crafted heuristics.
 * Prioritizes: high quality, fresh, relevant, diverse sources.
 */
function heuristicScore(
  obs: AgentObservation,
  candidates: EvidenceCandidate[],
  seenDomains: Set<string>,
): Float32Array {
  const scores = new Float32Array(candidates.length);

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    let score = 0;

    // Base quality score
    score += c.confidence * 0.2;
    score += c.sourceScore * 0.2;
    score += c.relevanceScore * 0.15;
    score += c.freshnessScore * 0.1;

    // Content richness
    const entityScore = Math.min(1, c.entityCount / 10);
    const phraseScore = Math.min(1, c.phraseCount / 20);
    const claimScore = Math.min(1, c.claimCount / 5);
    score += (entityScore + phraseScore + claimScore) / 3 * 0.15;

    // Corroboration bonus
    if (c.isCorroborated) score += 0.1;

    // Domain diversity bonus
    if (!seenDomains.has(c.domain)) {
      score += 0.08;
    }

    // Terrain match
    const terrainIdx = ['news', 'forum', 'docs', 'academic', 'company', 'general-web', 'social-signal']
      .indexOf(c.terrain);
    if (terrainIdx >= 0 && obs.terrainOneHot[terrainIdx] > 0) {
      score += 0.05;
    }

    // Coverage-based prioritization
    if (obs.coverageRatio < 0.3) {
      // Low coverage: prioritize quantity (slightly boost all)
      score += 0.03;
    } else if (obs.coverageRatio > 0.7) {
      // High coverage: prioritize quality
      if (c.confidence > 0.7 && c.sourceScore > 0.7) {
        score += 0.08;
      }
    }

    // Time pressure: prioritize high-confidence items
    if (obs.timeBudgetRemaining < 0.2 && c.confidence > 0.6) {
      score += 0.05;
    }

    scores[i] = Math.max(0, Math.min(1, score));
  }

  return scores;
}

// ─────────────────────────────────────────────
// Ranking
// ─────────────────────────────────────────────

function rankCandidates(
  candidates: EvidenceCandidate[],
  scores: Float32Array,
): ScoredCandidate<EvidenceCandidate>[] {
  const scored: ScoredCandidate<EvidenceCandidate>[] = candidates.map((candidate, i) => ({
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
  candidates: EvidenceCandidate[],
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
    `[SynthesizerAgent:${agentId}:shadow] candidates=${n} spearman=${spearman.toFixed(3)}`,
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
