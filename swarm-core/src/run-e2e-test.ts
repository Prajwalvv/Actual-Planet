import { SwarmEngine } from './swarm-engine';
import { RuntimeEventPayload } from './adaptive-types';

/**
 * END-TO-END SWARM TEST — All trained models active
 * 
 * Tests the full swarm with:
 * - GRU Queen (policy controller) making strategic decisions
 * - Explorer ants (neural model) choosing which links to follow
 * - Validator ants (96.3% accuracy) scoring claim trustworthiness
 * - Synthesizer ants selecting best evidence
 * 
 * Uses policyMode=gru_live to let the Queen brain drive decisions.
 */

const TEST_QUERIES = [
  { query: "What are the real health benefits of cold plunge therapy?", depth: 'standard' as const, label: 'Health/Science' },
  { query: "Is Rust replacing C++ in systems programming?", depth: 'standard' as const, label: 'Tech' },
  { query: "What caused the recent banking crisis?", depth: 'standard' as const, label: 'Finance' },
  { query: "How effective are weight loss drugs like Ozempic?", depth: 'standard' as const, label: 'Medicine' },
  { query: "What is the latest breakthrough in quantum computing?", depth: 'deep' as const, label: 'Science/Deep' },
];

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function bar(ratio: number, width = 20): string {
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║          🐝  SWARM INTELLIGENCE — E2E MODEL TEST  🐝       ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Models:                                                    ║');
  console.log('║    👑 GRU Queen  — Policy Controller (imitation-v1)         ║');
  console.log('║    🔍 Explorer   — Link Selection (ONNX)                    ║');
  console.log('║    ✅ Validator  — Claim Scoring (96.3% acc, 128 hidden)    ║');
  console.log('║    📊 Synthesizer — Evidence Ranking (ONNX)                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  const engine = new SwarmEngine({ id: 'e2e-test-engine' });
  await engine.start();

  const allResults: Array<{
    label: string;
    query: string;
    depth: string;
    evidenceCount: number;
    topicCount: number;
    sourceDomains: string[];
    elapsedMs: number;
    policyMode: string;
    controllerUsed: string;
    decisionSteps: number;
    policyInferenceMs: number;
    modelVersion: string | null;
    coverage: { coverageRatio: number; usefulnessScore: number };
    corroboration: { promoted: number; withheld: number };
    timeToFirstEvidence: number | null;
  }> = [];

  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const { query, depth, label } = TEST_QUERIES[i];
    const timeoutSec = depth === 'deep' ? 60 : 30;

    console.log(`\n┌─────────────────────────────────────────────────────────────┐`);
    console.log(`│ [${i + 1}/${TEST_QUERIES.length}] ${label}`);
    console.log(`│ Query: "${query}"`);
    console.log(`│ Depth: ${depth} | Timeout: ${timeoutSec}s | Policy: gru_live`);
    console.log(`└─────────────────────────────────────────────────────────────┘`);

    let streamEvents = 0;
    let lastEventType = '';

    try {
      const result = await engine.executeQuery(
        {
          query,
          depth,
          modelId: 'default',
          timeoutSec,
          policyMode: 'gru_live',
        },
        {
          queuePosition: i,
          queueWaitMs: 0,
          autoStarted: false,
          restartedForModel: false,
          coldStartMs: 0,
          timeoutRequestedSec: timeoutSec,
        },
        (event: RuntimeEventPayload) => {
          streamEvents++;
          if (event.type !== lastEventType) {
            lastEventType = event.type;
            if (event.type === 'sources_discovered') {
              console.log(`  🔍 Sources discovered...`);
            } else if (event.type === 'evidence_added') {
              console.log(`  📄 Evidence collected...`);
            } else if (event.type === 'policy_step') {
              const d = event.data as any;
              const action = d?.executedAction?.roleId || d?.action || '?';
              const source = d?.executedAction?.source || d?.source || '?';
              console.log(`  👑 Queen decision: ${action} (via ${source})`);
            }
          }
        }
      );

      const policy = result.queryMeta.policy;
      const sourceDomains = [...new Set(result.evidence.map(e => (e as any).domain || (e as any).sourceDomain || 'unknown'))];

      const entry = {
        label,
        query,
        depth,
        evidenceCount: result.evidence.length,
        topicCount: result.topicResolutions.length,
        sourceDomains,
        elapsedMs: result.queryMeta.elapsedMs,
        policyMode: policy.mode,
        controllerUsed: policy.controllerUsed,
        decisionSteps: policy.decisionSteps,
        policyInferenceMs: policy.inferenceMs,
        modelVersion: policy.modelVersion || null,
        coverage: result.queryMeta.coverage,
        corroboration: result.queryMeta.corroboration,
        timeToFirstEvidence: result.queryMeta.performance.timeToFirstEvidenceMs,
      };

      allResults.push(entry);

      // Print per-query results
      console.log(`\n  ┌── Results ──────────────────────────────────────────────┐`);
      console.log(`  │ Evidence: ${entry.evidenceCount} items from ${sourceDomains.length} domains`);
      console.log(`  │ Topics:   ${entry.topicCount} resolutions`);
      console.log(`  │ Time:     ${formatMs(entry.elapsedMs)} (first evidence: ${entry.timeToFirstEvidence ? formatMs(entry.timeToFirstEvidence) : 'N/A'})`);
      console.log(`  │`);
      console.log(`  │ 👑 Queen Controller: ${entry.controllerUsed.toUpperCase()}${entry.modelVersion ? ` (${entry.modelVersion})` : ''}`);
      console.log(`  │    Decision steps:   ${entry.decisionSteps}`);
      console.log(`  │    Inference time:   ${formatMs(entry.policyInferenceMs)}`);
      console.log(`  │`);
      console.log(`  │ Coverage:      ${bar(entry.coverage.coverageRatio)} ${(entry.coverage.coverageRatio * 100).toFixed(0)}%`);
      console.log(`  │ Usefulness:    ${bar(entry.coverage.usefulnessScore)} ${(entry.coverage.usefulnessScore * 100).toFixed(0)}%`);
      console.log(`  │ Corroboration: ${entry.corroboration.promoted} promoted / ${entry.corroboration.withheld} withheld`);

      if (sourceDomains.length > 0) {
        console.log(`  │`);
        console.log(`  │ Sources: ${sourceDomains.slice(0, 5).join(', ')}${sourceDomains.length > 5 ? ` +${sourceDomains.length - 5} more` : ''}`);
      }

      if (result.topicResolutions.length > 0) {
        console.log(`  │`);
        console.log(`  │ Top topics:`);
        result.topicResolutions.slice(0, 3).forEach((t, idx) => {
          const conf = (t as any).confidence ?? (t as any).score ?? 0;
          console.log(`  │   ${idx + 1}. ${(t as any).topic || (t as any).title || '?'} (${(conf * 100).toFixed(0)}%)`);
        });
      }

      console.log(`  └──────────────────────────────────────────────────────────┘`);

    } catch (error: any) {
      console.error(`  ✗ Error: ${error.message}`);
      allResults.push({
        label, query, depth,
        evidenceCount: 0, topicCount: 0, sourceDomains: [],
        elapsedMs: 0, policyMode: 'gru_live', controllerUsed: 'error',
        decisionSteps: 0, policyInferenceMs: 0, modelVersion: null,
        coverage: { coverageRatio: 0, usefulnessScore: 0 },
        corroboration: { promoted: 0, withheld: 0 },
        timeToFirstEvidence: null,
      });
    }

    // Brief pause between queries
    if (i < TEST_QUERIES.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  await engine.stop();

  // ── Final Summary ──
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              📊  FINAL PERFORMANCE SUMMARY  📊              ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');

  const totalEvidence = allResults.reduce((s, r) => s + r.evidenceCount, 0);
  const totalTopics = allResults.reduce((s, r) => s + r.topicCount, 0);
  const avgTime = allResults.filter(r => r.elapsedMs > 0).reduce((s, r) => s + r.elapsedMs, 0) / Math.max(1, allResults.filter(r => r.elapsedMs > 0).length);
  const gruUsed = allResults.filter(r => r.controllerUsed === 'gru').length;
  const heuristicUsed = allResults.filter(r => r.controllerUsed === 'heuristic').length;
  const totalDecisionSteps = allResults.reduce((s, r) => s + r.decisionSteps, 0);
  const totalInferenceMs = allResults.reduce((s, r) => s + r.policyInferenceMs, 0);
  const avgCoverage = allResults.filter(r => r.elapsedMs > 0).reduce((s, r) => s + r.coverage.coverageRatio, 0) / Math.max(1, allResults.filter(r => r.elapsedMs > 0).length);
  const avgUsefulness = allResults.filter(r => r.elapsedMs > 0).reduce((s, r) => s + r.coverage.usefulnessScore, 0) / Math.max(1, allResults.filter(r => r.elapsedMs > 0).length);
  const allDomains = [...new Set(allResults.flatMap(r => r.sourceDomains))];

  console.log(`║                                                              ║`);
  console.log(`║  Queries:          ${TEST_QUERIES.length}                                            ║`);
  console.log(`║  Total Evidence:   ${String(totalEvidence).padEnd(40)}║`);
  console.log(`║  Total Topics:     ${String(totalTopics).padEnd(40)}║`);
  console.log(`║  Unique Domains:   ${String(allDomains.length).padEnd(40)}║`);
  console.log(`║  Avg Time/Query:   ${formatMs(avgTime).padEnd(40)}║`);
  console.log(`║                                                              ║`);
  console.log(`║  👑 GRU Queen:                                               ║`);
  console.log(`║    Controller:     GRU=${gruUsed} / Heuristic=${heuristicUsed}${' '.repeat(Math.max(0, 28 - String(gruUsed).length - String(heuristicUsed).length))}║`);
  console.log(`║    Decision Steps: ${String(totalDecisionSteps).padEnd(40)}║`);
  console.log(`║    Inference Time: ${formatMs(totalInferenceMs).padEnd(40)}║`);
  console.log(`║                                                              ║`);
  console.log(`║  🐜 Agent Models:                                            ║`);
  console.log(`║    Validator:      enabled (96.3% acc, 128 hidden)           ║`);
  console.log(`║    Explorer:       enabled (ONNX)                            ║`);
  console.log(`║    Synthesizer:    enabled (ONNX)                            ║`);
  console.log(`║                                                              ║`);
  console.log(`║  Avg Coverage:     ${bar(avgCoverage)} ${(avgCoverage * 100).toFixed(0)}%          ║`);
  console.log(`║  Avg Usefulness:   ${bar(avgUsefulness)} ${(avgUsefulness * 100).toFixed(0)}%          ║`);
  console.log(`║                                                              ║`);
  console.log(`╠══════════════════════════════════════════════════════════════╣`);
  console.log(`║  Per-Query Breakdown:                                        ║`);

  for (const r of allResults) {
    const queen = r.controllerUsed === 'gru' ? '👑GRU' : '📋HEU';
    console.log(`║  ${r.label.padEnd(14)} │ ${String(r.evidenceCount).padStart(2)} evidence │ ${formatMs(r.elapsedMs).padStart(6)} │ ${queen} (${r.decisionSteps} steps) ║`);
  }

  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  console.log('');
}

main().catch(console.error);
