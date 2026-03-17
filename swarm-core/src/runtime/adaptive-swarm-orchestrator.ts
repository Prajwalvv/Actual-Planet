import { randomUUID } from 'crypto';
import { AdaptiveQueryRequest, AdaptiveQueryResult, CoverageBreakdown, RuntimeEventPayload, TopicAggregate } from '../adaptive-types';
import { BrowserPool } from '../browser-pool';
import { QueryFrontier } from '../discovery/frontier';
import { CrawlPolicyEngine } from '../discovery/policy-engine';
import { ProviderRegistry } from '../discovery/provider-registry';
import { buildQueryExecutionPlan } from '../planner/query-terrain-planner';
import { QueryOverlayMemory } from '../memory/query-overlay';
import { buildPromotionDecisions } from '../memory/promotion-manager';
import { rankEvidence } from '../ranking/evidence-ranker';
import { BreedRegistry } from '../ants/breeds/breed-registry';
import { BreedExecutionContext, fetchPageHtml } from '../ants/breeds/types';
import { PolicyController } from '../policy/controller';
import { DecisionOutcome } from '../policy/policy-types';
import { PolicyActionRoleId } from '../policy/role-ids';
import { resolveTopics } from './topic-resolver';
import { PheromoneSpace } from '../pheromone-space';
import { PheromoneType, IntelligenceReport, ColonyHealthReport } from '../types';
import { HarvesterColony } from '../ants/harvester-ant';
import { NurseAnt } from '../ants/nurse-ant';
import { AgentModelRuntime } from '../agents/agent-model-runtime';
import { IAgentTraceCollector } from '../agents/agent-trace-collector';

export interface AdaptiveSwarmOrchestratorDeps {
  pool: BrowserPool;
  space: PheromoneSpace;
  harvesters: HarvesterColony;
  nurse: NurseAnt;
  policy: PolicyController;
  getGlobalTopics: () => TopicAggregate[];
  upsertGlobalTopics: (topics: TopicAggregate[]) => void;
  upsertGlobalEvidence: (items: any[]) => void;
  emitEngineEvent: (payload: RuntimeEventPayload) => void;
  refreshReports: () => Promise<{ reports: IntelligenceReport[]; health: ColonyHealthReport | null }>;
  agentRuntime: AgentModelRuntime;
  agentTraceCollector: IAgentTraceCollector;
}

export class AdaptiveSwarmOrchestrator {
  private providers = new ProviderRegistry();
  private breeds = new BreedRegistry();
  private deps: AdaptiveSwarmOrchestratorDeps;

  constructor(deps: AdaptiveSwarmOrchestratorDeps) {
    this.deps = deps;
  }

  async execute(request: AdaptiveQueryRequest, runtimeMeta: {
    queuePosition: number;
    queueWaitMs: number;
    autoStarted: boolean;
    restartedForModel: boolean;
    coldStartMs: number;
    modelRequested?: string | null;
    timeoutRequestedSec?: number | null;
    timeoutLimitsSec?: { min: number; default: number; max: number };
    shardId?: string;
  }, stream?: (payload: RuntimeEventPayload) => void): Promise<AdaptiveQueryResult> {
    const startedAt = Date.now();
    const deadlineMs = startedAt + request.timeoutSec * 1000;
    const overlay = new QueryOverlayMemory(randomUUID());
    const frontier = new QueryFrontier();
    const policy = new CrawlPolicyEngine();
    const plan = buildQueryExecutionPlan(request);
    const events: RuntimeEventPayload[] = [];
    const requestedInputs = ((request.symbols && request.symbols.length > 0)
      ? request.symbols
      : [request.query || '']).filter(Boolean);
    let firstUsefulAt: number | null = null;
    let firstEvidenceAt: number | null = null;

    const emit = (payload: RuntimeEventPayload) => {
      events.push(payload);
      stream?.(payload);
      this.deps.emitEngineEvent(payload);
    };

    const addEvidence = (items: any[]) => {
      for (const item of items) overlay.addEvidence(item);
      if (items.length > 0) {
        if (!firstEvidenceAt) firstEvidenceAt = Date.now();
        emit({ type: 'evidence_added', data: { count: items.length, sample: items.slice(0, 4) } });
      }
    };

    const enqueueUrl: BreedExecutionContext['enqueueUrl'] = async ({ url, sourceProviderId, terrainHint, depth = 0, priority = 0.5, discoveredFrom, title, snippet }) => {
      const decision = await policy.allow(url, sourceProviderId);
      overlay.addPolicyEvent(decision.event);
      if (!decision.ok) return false;
      return frontier.push({
        url: decision.url,
        domain: decision.domain,
        terrainHint,
        sourceProviderId,
        depth,
        priority,
        discoveredFrom,
        title,
        snippet,
      });
    };

    const context: BreedExecutionContext = {
      request,
      plan,
      frontier,
      overlay,
      providers: this.providers,
      policy,
      pool: this.deps.pool,
      deadlineMs,
      emit,
      fetchHtml: (url, preferred) => fetchPageHtml(this.deps.pool, url, preferred),
      addEvidence,
      enqueueUrl,
      agentRuntime: this.deps.agentRuntime,
      agentTraceCollector: this.deps.agentTraceCollector,
    };

    const exploreEnd = Math.min(startedAt + plan.phaseBudgetsMs.bootstrap + plan.phaseBudgetsMs.explore, deadlineMs);
    const policySession = this.deps.policy.createSession(this.deps.space, {
      request,
      plan,
      startedAt,
      exploreDeadlineMs: exploreEnd,
      requestedInputs,
    });
    await policySession.initialize();

    emit({ type: 'query_started', data: { query: request.query, symbols: request.symbols || [], model: request.modelId, timeoutSec: request.timeoutSec } });
    emit({ type: 'plan_ready', data: plan });

    const executeBreed = async (breedId: string, units: number) => {
      const breed = this.breeds.getById(breedId);
      if (!breed || Date.now() >= deadlineMs) return { processed: 0, added: 0 };
      const result = await breed.run(context, units);
      if (!firstUsefulAt && overlay.getEvidence().length > 0) {
        firstUsefulAt = Date.now();
      }
      const coverage = overlay.computeCoverage(requestedInputs);
      emit({ type: 'coverage_updated', data: coverage });
      return result;
    };

    await executeBreed('search_bootstrap', 1);

    let lastDecision: { roleId: PolicyActionRoleId; units: number } | null = null;
    let lastOutcome: DecisionOutcome | null = null;
    let decisionCount = 0;

    while (Date.now() < exploreEnd && Date.now() < deadlineMs && decisionCount < policySession.getMaxDecisionSteps()) {
      const decision = await policySession.chooseNext({
        frontier,
        overlay,
        lastDecision,
        lastOutcome,
      });

      emit({
        type: 'policy_step',
        data: {
          stepIndex: decision.stepIndex,
          mode: request.policyMode || 'heuristic',
          availableRoles: decision.availableRoles,
          heuristicAction: decision.heuristicAction,
          modelAction: decision.modelAction,
          executedAction: decision.executedAction,
          fallbackUsed: decision.fallbackUsed,
        },
      });

      if (decision.fallbackUsed) {
        emit({
          type: 'policy_fallback',
          data: {
            stepIndex: decision.stepIndex,
            reason: decision.fallbackReason,
            modelAction: decision.modelAction,
            heuristicAction: decision.heuristicAction,
          },
        });
      }

      if (decision.executedAction.roleId === 'stop_explore') {
        await policySession.completeStep(decision);
        decisionCount += 1;
        break;
      }

      const beforeEvidence = overlay.getEvidence().length;
      const beforeCoverage = overlay.computeCoverage(requestedInputs);
      const beforeSourceCoverage = overlay.getSourceCoverage();
      const beforeFrontierSize = frontier.size();
      const actionStartedAt = Date.now();

      const breedResult = await executeBreed(decision.executedAction.roleId, decision.executedAction.units);

      const afterCoverage = overlay.computeCoverage(requestedInputs);
      const afterSourceCoverage = overlay.getSourceCoverage();
      const afterFrontierSize = frontier.size();
      const outcome = {
        processed: breedResult.processed,
        added: breedResult.added,
        elapsedMs: Date.now() - actionStartedAt,
        evidenceDelta: overlay.getEvidence().length - beforeEvidence,
        coverageDelta: Number((afterCoverage.coverageRatio - beforeCoverage.coverageRatio).toFixed(3)),
        usefulnessDelta: Number((afterCoverage.usefulnessScore - beforeCoverage.usefulnessScore).toFixed(3)),
        frontierDelta: afterFrontierSize - beforeFrontierSize,
        blockedDelta: afterSourceCoverage.blockedCount - beforeSourceCoverage.blockedCount,
        allowedDelta: afterSourceCoverage.allowedCount - beforeSourceCoverage.allowedCount,
        promotedDelta: afterSourceCoverage.promotedTopics - beforeSourceCoverage.promotedTopics,
        terrainDeltaIds: changedKeys(beforeSourceCoverage.terrainHits, afterSourceCoverage.terrainHits) as any,
        providerDeltaIds: changedKeys(beforeSourceCoverage.providerHits, afterSourceCoverage.providerHits),
        useful: breedResult.added > 0 || afterCoverage.usefulnessScore > beforeCoverage.usefulnessScore,
      };

      await policySession.completeStep(decision, outcome);
      decisionCount += 1;
      lastDecision = {
        roleId: decision.executedAction.roleId,
        units: decision.executedAction.units,
      };
      lastOutcome = outcome;

      if (Date.now() >= exploreEnd || Date.now() >= deadlineMs) break;
    }

    await executeBreed('source_verifier', 1);

    const promoted = buildPromotionDecisions(overlay);
    const promotedTopics: TopicAggregate[] = [];
    const aggregates = overlay.getTopicAggregates();
    for (const decision of promoted) {
      if (!decision.promote) continue;
      const topic = aggregates.find((entry) => entry.topic === decision.target || entry.normalizedTopic === decision.target.toLowerCase());
      if (!topic) continue;
      promotedTopics.push(topic);
      await this.deps.space.registerLocation({ id: topic.topic, type: 'entity', parents: ['DOMAIN:DISCOVERED'] });
      for (const signal of decision.signals) {
        await this.deps.space.deposit({
          type: signal.type,
          locationId: topic.topic,
          strength: signal.strength,
          sourceAntId: `orchestrator:${overlay.id}`,
          sourceColony: 'adaptive_swarm',
          timestamp: Date.now(),
        });
      }
    }

    overlay.markPromoted(promotedTopics.length);
    this.deps.upsertGlobalTopics(promotedTopics);
    const promotedEvidenceIds = new Set(promotedTopics.flatMap((topic) => topic.evidenceIds));
    this.deps.upsertGlobalEvidence(overlay.getEvidence().filter((item) => promotedEvidenceIds.has(item.id)));

    const refreshed = await this.deps.refreshReports();
    const mergedTopics = [...this.deps.getGlobalTopics(), ...aggregates]
      .sort((a, b) => b.corroborationScore - a.corroborationScore || b.mentions - a.mentions);
    const topicResolutions = resolveTopics(requestedInputs, mergedTopics, overlay.getEvidence());
    const coverage = computeCoverage(topicResolutions);
    
    // Build observation context for the Synthesizer agent
    const observation = {
      queryLengthNorm: Math.min(1, request.query.length / 200),
      symbolCount: request.symbols?.length || 0,
      terrainOneHot: [0, 0, 0, 0, 0, 0, 0], // Simplified for now
      depthOneHot: request.depth === 'deep' ? [0, 0, 1] : request.depth === 'standard' ? [0, 1, 0] : [1, 0, 0],
      timeBudgetRemaining: Math.max(0, 1 - ((Date.now() - startedAt) / deadlineMs)),
      coverageRatio: coverage.coverageRatio,
      frontierSizeNorm: Math.min(1, frontier.size() / 200),
      evidenceCountNorm: Math.min(1, overlay.getEvidence().length / 100),
      sourceDiversityNorm: Math.min(1, overlay.getSourceCoverage().totalDomains / 20),
      trailStrength: 0.5,
      interestStrength: 0.5,
      deadTrailStrength: 0.1,
      stepProgress: 1.0, // Final step
      blockedRatioNorm: 0.1,
      usefulnessScore: coverage.usefulnessScore,
    };

    const rankedEvidence = await rankEvidence(
      overlay.getEvidence(), 
      request.depth === 'deep' ? 25 : request.depth === 'quick' ? 8 : 15,
      {
        agentRuntime: this.deps.agentRuntime,
        agentTraceCollector: this.deps.agentTraceCollector,
        observation
      }
    );

    const policySummary = await policySession.finalize({
      evidenceCount: overlay.getEvidence().length,
      coverageRatio: coverage.coverageRatio,
      usefulnessScore: coverage.usefulnessScore,
      promotedTopics: overlay.getSourceCoverage().promotedTopics,
      elapsedMs: Date.now() - startedAt,
    });

    if (!firstUsefulAt && topicResolutions.some((entry) => entry.status !== 'not_found')) {
      firstUsefulAt = Date.now();
    }

    const result: AdaptiveQueryResult = {
      topicResolutions,
      symbolResolutions: request.symbols && request.symbols.length > 0 ? topicResolutions : undefined,
      evidence: rankedEvidence,
      executionPlan: plan,
      sourceCoverage: overlay.getSourceCoverage(),
      queryMeta: {
        modelUsed: request.modelId,
        timeoutAcceptedSec: request.timeoutSec,
        partial: topicResolutions.some((entry) => entry.status === 'related_only' || entry.status === 'not_found'),
        respondedAt: new Date().toISOString(),
        phaseTimings: plan.phaseBudgetsMs,
        coverage,
        corroboration: {
          promoted: promoted.filter((entry) => entry.promote).length,
          withheld: promoted.filter((entry) => !entry.promote).length,
        },
        streaming: {
          enabled: Boolean(stream),
          eventCount: events.length,
        },
        performance: {
          timeToFirstEvidenceMs: firstEvidenceAt ? firstEvidenceAt - startedAt : null,
          timeToFirstUsefulMs: firstUsefulAt ? firstUsefulAt - startedAt : null,
        },
        queuePosition: runtimeMeta.queuePosition,
        queueWaitMs: runtimeMeta.queueWaitMs,
        autoStarted: runtimeMeta.autoStarted,
        restartedForModel: runtimeMeta.restartedForModel,
        coldStartMs: runtimeMeta.coldStartMs,
        elapsedMs: Date.now() - startedAt,
        modelRequested: runtimeMeta.modelRequested,
        timeoutRequestedSec: runtimeMeta.timeoutRequestedSec,
        timeoutLimitsSec: runtimeMeta.timeoutLimitsSec,
        shardId: runtimeMeta.shardId,
        policy: {
          mode: request.policyMode || 'heuristic',
          controllerUsed: policySummary.controllerUsed,
          fallbackUsed: policySummary.fallbackUsed,
          decisionSteps: policySummary.decisionSteps,
          inferenceMs: policySummary.inferenceMs,
          traceId: policySummary.traceId,
          modelVersion: policySummary.modelVersion || null,
        },
      },
    };

    emit({
      type: 'policy_trace_ready',
      data: {
        traceId: policySummary.traceId,
        controllerUsed: policySummary.controllerUsed,
        decisionSteps: policySummary.decisionSteps,
      },
    });
    emit({
      type: 'resolution_updated',
      data: {
        topicResolutions,
        promoted: promoted.filter((entry) => entry.promote),
      },
    });
    emit({ type: 'final', data: result });

    return result;
  }
}

function computeCoverage(topicResolutions: AdaptiveQueryResult['topicResolutions']): CoverageBreakdown {
  const requestedSymbols = topicResolutions.length;
  const exactCount = topicResolutions.filter((entry) => entry.status === 'exact' || entry.status === 'phrase_match').length;
  const resolvedCount = topicResolutions.filter((entry) => entry.status === 'exact' || entry.status === 'phrase_match' || entry.status === 'alias_match' || entry.status === 'fuzzy_match').length;
  const relatedOnlyCount = topicResolutions.filter((entry) => entry.status === 'related_only').length;
  const notFoundCount = topicResolutions.filter((entry) => entry.status === 'not_found').length;
  const weights = {
    exact: 1,
    phrase_match: 0.92,
    alias_match: 0.85,
    fuzzy_match: 0.72,
    related_only: 0.45,
    not_found: 0,
  } as const;
  const weighted = topicResolutions.reduce((sum, entry) => sum + weights[entry.status], 0);
  return {
    requestedSymbols,
    exactCount,
    resolvedCount,
    relatedOnlyCount,
    notFoundCount,
    coverageRatio: requestedSymbols > 0 ? Number(((resolvedCount + relatedOnlyCount) / requestedSymbols).toFixed(3)) : 0,
    usefulnessScore: requestedSymbols > 0 ? Number((weighted / requestedSymbols).toFixed(3)) : 0,
  };
}

function changedKeys(before: Record<string, number>, after: Record<string, number>): string[] {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const changed: string[] = [];
  for (const key of keys) {
    if ((after[key] || 0) > (before[key] || 0)) changed.push(key);
  }
  return changed;
}
