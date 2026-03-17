import { ExplorerAgent } from '../../agents/explorer/explorer-agent';
import { buildExplorerFeatures, buildExplorerObservation } from '../../agents/explorer/feature-builder';
import { LinkCandidate } from '../../agents/agent-types';
import { AntBreedDefinition, BreedExecutionContext, BreedRunResult } from './types';

export class LinkPathfinderAnt implements AntBreedDefinition {
  id = 'link_pathfinder';
  terrains = ['news', 'forum', 'docs', 'academic', 'company', 'general-web', 'social-signal'] as const;
  costClass = 'medium' as const;

  async run(context: BreedExecutionContext, units: number): Promise<BreedRunResult> {
    const evidence = context.overlay.getEvidence().slice(-Math.max(4, units * 2));
    const domains = [...new Set(evidence.map((item) => item.domain))].slice(0, units);
    const rawLinks = evidence.flatMap((item) =>
      item.discoveredLinks.slice(0, 5).map((url: string) => ({
        url,
        domain: safeExtractDomain(url),
        evidenceItem: item,
      })),
    ).slice(0, units * 6);
    let added = 0;
    let processed = 0;

    // Build link candidates with rich metadata for agent model scoring
    const candidates: LinkCandidate[] = rawLinks.map(link => ({
      url: link.url,
      domain: link.domain,
      discoveredDepth: 0,
      hasTitle: Boolean(link.evidenceItem.title),
      hasSnippet: Boolean(link.evidenceItem.snippet),
      sourcePriority: link.evidenceItem.confidence ?? 0.5,
      terrainHint: link.evidenceItem.terrain,
      sourceProviderId: 'link_pathfinder',
      title: link.evidenceItem.title,
      snippet: link.evidenceItem.snippet,
      discoveredFrom: 'evidence_link',
    }));

    // Build observation from current swarm state
    const coverage = context.overlay.computeCoverage(
      (context.request.symbols?.length ? context.request.symbols : [context.request.query || '']).filter(Boolean),
    );
    const sourceCoverage = context.overlay.getSourceCoverage();
    const observation = buildExplorerObservation({
      queryLength: (context.request.query || '').length,
      symbolCount: context.request.symbols?.length || 0,
      terrains: context.plan.terrains.map(t => t.terrain),
      depth: context.request.depth || 'standard',
      timeBudgetRemaining: Math.max(0, (context.deadlineMs - Date.now()) / (context.request.timeoutSec * 1000)),
      coverageRatio: coverage.coverageRatio,
      frontierSize: context.frontier.size(),
      evidenceCount: context.overlay.getEvidence().length,
      sourceDomainCount: domains.length,
      trailStrength: 0, // Will be enriched with pheromone data when available
      interestStrength: 0,
      deadTrailStrength: 0,
      stepProgress: 0,
      usefulnessScore: coverage.usefulnessScore,
      blockedCount: sourceCoverage.blockedCount,
      totalUrlsSeen: sourceCoverage.allowedCount + sourceCoverage.blockedCount,
    });

    // Score candidates using explorer agent model (or heuristic fallback)
    let scoredCandidates = candidates;
    let selectedIndices: number[] = [];
    let featureVectors: number[][] = [];

    if (candidates.length > 0 && context.agentRuntime) {
      const agent = new ExplorerAgent(
        context.agentRuntime,
        `pathfinder:${Date.now().toString(36)}`,
        context.agentRuntime.isReady('explorer') ? undefined : 'heuristic',
      );

      const knownDomains = new Set(domains);
      featureVectors = buildExplorerFeatures(observation, candidates, knownDomains);
      const scored = await agent.scoreCandidates(observation, candidates);

      // Take top candidates based on units
      const topN = Math.min(scored.length, units * 4);
      const topScored = scored.slice(0, topN);
      scoredCandidates = topScored.map(s => s.candidate);
      selectedIndices = topScored.map(s => candidates.indexOf(s.candidate));

      context.emit({
        type: 'sources_discovered',
        data: {
          agentScoring: true,
          agentType: 'explorer',
          mode: agent.getMode(),
          totalCandidates: candidates.length,
          selectedCount: topN,
          topScore: scored[0]?.score ?? 0,
          bottomScore: scored[scored.length - 1]?.score ?? 0,
        },
      });
    }

    // Record decision trace for training data
    const traceId = context.agentTraceCollector?.recordDecision(
      'explorer', observation, candidates, featureVectors, selectedIndices,
    ) ?? '';

    // Enqueue scored candidates with model-predicted priority
    const candidateOutcomes: { candidateIndex: number; ok: boolean }[] = [];
    for (let i = 0; i < scoredCandidates.length; i++) {
      const c = scoredCandidates[i];
      processed += 1;
      const ok = await context.enqueueUrl({
        url: c.url,
        sourceProviderId: 'link_pathfinder',
        priority: c.sourcePriority,
        terrainHint: c.terrainHint as any,
        discoveredFrom: c.discoveredFrom,
        title: c.title,
        snippet: c.snippet,
      });
      if (ok) added += 1;
      candidateOutcomes.push({ candidateIndex: selectedIndices[i] ?? i, ok });
      if (Date.now() >= context.deadlineMs) break;
    }

    // Record outcomes for the trace
    if (traceId && context.agentTraceCollector) {
      context.agentTraceCollector.recordOutcomes(traceId, candidateOutcomes.map(o => ({
        candidateIndex: o.candidateIndex,
        yieldedEvidence: o.ok,
        evidenceCount: o.ok ? 1 : 0,
        coverageDelta: 0, // Will be filled by orchestrator post-step
        elapsedMs: 0,
        fetchSuccess: o.ok,
      })));
    }

    // Domain bootstrap phase (unchanged — uses provider discovery)
    if (Date.now() < context.deadlineMs && domains.length > 0) {
      const providerPlan = [
        { providerId: 'rss_autodiscovery', budgetPct: 0.6 },
        { providerId: 'sitemap_probe', budgetPct: 0.4 },
      ];
      const bootstrapped = await context.providers.discover({
        query: context.request.query || '',
        symbols: context.request.symbols || [],
        terrains: context.plan.terrains.map((t) => t.terrain),
        domains,
      }, providerPlan, context.deadlineMs);
      processed += bootstrapped.length;
      for (const candidate of bootstrapped) {
        const ok = await context.enqueueUrl({
          url: candidate.url,
          sourceProviderId: candidate.sourceProviderId,
          terrainHint: candidate.terrainHint,
          priority: candidate.confidence,
          discoveredFrom: 'domain_bootstrap',
          title: candidate.title,
        });
        if (ok) added += 1;
      }
    }

    return { processed, added };
  }
}

function safeExtractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
