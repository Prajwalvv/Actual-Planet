import { BrowserPool, BrowserPoolConfig } from './browser-pool';
import { AdaptiveQueryRequest, AdaptiveQueryResult, EvidenceItem, QueryExecutionPlan, RuntimeEventPayload, RuntimePolicySnapshot, TopicAggregate } from './adaptive-types';
import { AgentModelRuntime } from './agents/agent-model-runtime';
import { createAgentTraceCollector, IAgentTraceCollector } from './agents/agent-trace-collector';
import { HarvesterColony, HarvesterColonyConfig } from './ants/harvester-ant';
import { NurseAnt, NurseAntConfig } from './ants/nurse-ant';
import { PheromoneSpace, PheromoneSpaceConfig } from './pheromone-space';
import { PolicyController } from './policy/controller';
import { AdaptiveSwarmOrchestrator } from './runtime/adaptive-swarm-orchestrator';
import { ColonyHealthReport, IntelligenceReport, IPheromoneSpace, Location } from './types';

export interface SwarmEngineConfig {
  id: string;
  space: Partial<PheromoneSpaceConfig>;
  browser: Partial<BrowserPoolConfig>;
  harvesters: Partial<HarvesterColonyConfig>;
  nurse: Partial<NurseAntConfig>;
  rootLocation: string;
}

export const DEFAULT_ENGINE_CONFIG: SwarmEngineConfig = {
  id: 'adaptive-swarm-engine',
  space: { decayHalfLifeMs: 4 * 60 * 1000, cascadeRatio: 0.25 },
  browser: { maxBrowsers: 2, maxPagesPerBrowser: 4, headless: true },
  harvesters: { minConcentrationToHarvest: 0.18 },
  nurse: { stalenessThresholdMs: 4 * 60 * 1000, saturationThreshold: 6 },
  rootLocation: 'DOMAIN:DISCOVERED',
};

export interface TickResult {
  round: number;
  elapsedMs: number;
  discoveries: number;
  reportsGenerated: number;
}

export type EngineEventType = 'tick' | 'discovery' | 'emergence' | 'error' | 'info';

export interface EngineEvent {
  type: EngineEventType;
  message: string;
  data?: any;
  timestamp: number;
}

function mergeTopic(existing: TopicAggregate | undefined, next: TopicAggregate): TopicAggregate {
  if (!existing) return {
    ...next,
    evidenceIds: [...new Set(next.evidenceIds)],
    sourceDomains: [...new Set(next.sourceDomains)],
    terrains: [...new Set(next.terrains)] as any,
    phrases: [...new Set(next.phrases)],
  };

  return {
    topic: existing.topic.length >= next.topic.length ? existing.topic : next.topic,
    normalizedTopic: existing.normalizedTopic,
    mentions: existing.mentions + next.mentions,
    evidenceIds: [...new Set([...existing.evidenceIds, ...next.evidenceIds])],
    sourceDomains: [...new Set([...existing.sourceDomains, ...next.sourceDomains])],
    terrains: [...new Set([...existing.terrains, ...next.terrains])] as any,
    averageConfidence: Number(((existing.averageConfidence + next.averageConfidence) / 2).toFixed(3)),
    averageFreshness: Number(((existing.averageFreshness + next.averageFreshness) / 2).toFixed(3)),
    sentimentScore: Number(((existing.sentimentScore + next.sentimentScore) / 2).toFixed(3)),
    corroborationScore: Math.max(existing.corroborationScore, next.corroborationScore),
    phrases: [...new Set([...existing.phrases, ...next.phrases])],
    firstSeenAt: Math.min(existing.firstSeenAt, next.firstSeenAt),
    lastSeenAt: Math.max(existing.lastSeenAt, next.lastSeenAt),
  };
}

export class SwarmEngine {
  private config: SwarmEngineConfig;
  private space: PheromoneSpace;
  private pool: BrowserPool;
  private harvesters: HarvesterColony;
  private nurse: NurseAnt;
  private policy: PolicyController;
  private orchestrator: AdaptiveSwarmOrchestrator;

  private running = false;
  private round = 0;
  private eventLog: EngineEvent[] = [];
  private onEvent: ((event: EngineEvent) => void) | null = null;
  private globalTopics = new Map<string, TopicAggregate>();
  private globalEvidence = new Map<string, EvidenceItem>();
  private agentRuntime: AgentModelRuntime;
  private agentTraceCollector: IAgentTraceCollector;
  private lastHealthReport: ColonyHealthReport | null = null;
  private lastExecutionPlan: QueryExecutionPlan | null = null;
  private lastQueryMeta: AdaptiveQueryResult['queryMeta'] | null = null;
  private lastSourceCoverage: AdaptiveQueryResult['sourceCoverage'] | null = null;

  constructor(config: Partial<SwarmEngineConfig> = {}) {
    this.config = {
      ...DEFAULT_ENGINE_CONFIG,
      ...config,
      space: { ...DEFAULT_ENGINE_CONFIG.space, ...(config.space || {}) },
      browser: { ...DEFAULT_ENGINE_CONFIG.browser, ...(config.browser || {}) },
      harvesters: { ...DEFAULT_ENGINE_CONFIG.harvesters, ...(config.harvesters || {}) },
      nurse: { ...DEFAULT_ENGINE_CONFIG.nurse, ...(config.nurse || {}) },
    };

    this.space = new PheromoneSpace(this.config.space);
    this.pool = new BrowserPool(this.config.browser);
    this.harvesters = new HarvesterColony(this.config.harvesters, this.space);
    this.nurse = new NurseAnt(this.config.nurse);
    this.policy = new PolicyController({ rootLocation: this.config.rootLocation });
    this.agentRuntime = new AgentModelRuntime();
    this.agentTraceCollector = createAgentTraceCollector();
    
    this.orchestrator = new AdaptiveSwarmOrchestrator({
      pool: this.pool,
      space: this.space,
      harvesters: this.harvesters,
      nurse: this.nurse,
      policy: this.policy,
      getGlobalTopics: () => this.getGlobalTopics(),
      upsertGlobalTopics: (topics) => this.upsertGlobalTopics(topics),
      upsertGlobalEvidence: (items) => this.upsertGlobalEvidence(items),
      emitEngineEvent: (payload) => this.emitFromRuntime(payload),
      refreshReports: () => this.refreshReports(),
      agentRuntime: this.agentRuntime,
      agentTraceCollector: this.agentTraceCollector,
    });
  }

  async start(): Promise<void> {
    if (this.running) return;
    await this.space.registerLocation({ id: this.config.rootLocation, type: 'domain', parents: [] } as Location);
    this.running = true;
    this.emit('info', 'Adaptive swarm engine started');
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    await this.agentTraceCollector.flush();
    await this.pool.shutdown();
    this.emit('info', 'Adaptive swarm engine stopped');
  }

  async executeQuery(
    request: AdaptiveQueryRequest,
    runtimeMeta: {
      queuePosition: number;
      queueWaitMs: number;
      autoStarted: boolean;
      restartedForModel: boolean;
      coldStartMs: number;
      modelRequested?: string | null;
      timeoutRequestedSec?: number | null;
      timeoutLimitsSec?: { min: number; default: number; max: number };
      shardId?: string;
    },
    stream?: (payload: RuntimeEventPayload) => void,
  ): Promise<AdaptiveQueryResult> {
    if (!this.running) {
      await this.start();
    }
    this.round += 1;
    const startedAt = Date.now();
    const result = await this.orchestrator.execute(request, runtimeMeta, stream);
    this.lastExecutionPlan = result.executionPlan;
    this.lastQueryMeta = result.queryMeta;
    this.lastSourceCoverage = result.sourceCoverage;
    this.emit('tick', `Adaptive query completed in ${Date.now() - startedAt}ms`, {
      round: this.round,
      elapsedMs: Date.now() - startedAt,
      discoveries: result.evidence.length,
      reportsGenerated: this.harvesters.getAllReports().length,
    });
    return result;
  }

  private emitFromRuntime(payload: RuntimeEventPayload): void {
    const type: EngineEventType = payload.type === 'evidence_added' || payload.type === 'sources_discovered'
      ? 'discovery'
      : payload.type === 'policy_fallback'
        ? 'error'
        : payload.type === 'policy_step' || payload.type === 'policy_trace_ready'
          ? 'info'
      : payload.type === 'final'
        ? 'info'
        : 'emergence';
    this.emit(type, payload.type, payload.data);
  }

  async refreshReports(): Promise<{ reports: IntelligenceReport[]; health: ColonyHealthReport | null }> {
    await this.harvesters.populate();
    const reports = await this.harvesters.tick();
    const nurseTick = await this.nurse.tick(this.space);
    for (const deposit of nurseTick.deposits) {
      await this.space.deposit(deposit);
    }
    this.lastHealthReport = nurseTick.healthReport;
    return { reports, health: this.lastHealthReport };
  }

  private upsertGlobalTopics(topics: TopicAggregate[]): void {
    for (const topic of topics) {
      this.globalTopics.set(topic.normalizedTopic, mergeTopic(this.globalTopics.get(topic.normalizedTopic), topic));
    }
  }

  private upsertGlobalEvidence(items: EvidenceItem[]): void {
    for (const item of items) {
      this.globalEvidence.set(item.id, item);
    }
  }

  private getGlobalTopics(): TopicAggregate[] {
    return [...this.globalTopics.values()].sort((a, b) => b.corroborationScore - a.corroborationScore || b.mentions - a.mentions);
  }

  getRuntimePolicy(): RuntimePolicySnapshot {
    return {
      crawlMode: 'robots-first',
      maxPagesPerDomainPerQuery: Number(process.env.SWARM_MAX_PAGES_PER_DOMAIN || 5),
      maxTotalPagesPerQuery: Number(process.env.SWARM_MAX_TOTAL_PAGES || 40),
      streamingSupported: true,
      providerKinds: ['search', 'feed', 'forum', 'sitemap', 'direct'],
      policyModes: ['heuristic', 'gru_shadow', 'gru_live', 'auto'],
      defaultPolicyMode: 'heuristic',
    };
  }

  getReport(locationId: string): IntelligenceReport | null {
    return this.harvesters.getReport(locationId);
  }

  getAllReports(): IntelligenceReport[] {
    return this.harvesters.getAllReports();
  }

  getTopReports(n: number): IntelligenceReport[] {
    return this.harvesters.getTopReports(n);
  }

  getReportsByPolarity(polarity: 'positive' | 'negative' | 'neutral' | 'mixed'): IntelligenceReport[] {
    return this.harvesters.getReportsByPolarity(polarity);
  }

  getHealthReport(): ColonyHealthReport | null {
    return this.lastHealthReport;
  }

  getSpace(): IPheromoneSpace {
    return this.space;
  }

  getDiscoveredEntities(): { symbol: string; mentions: number }[] {
    return this.getGlobalTopics().map((topic) => ({ symbol: topic.topic, mentions: topic.mentions }));
  }

  getEvidence(limit: number = 50): EvidenceItem[] {
    return [...this.globalEvidence.values()].slice(-limit).reverse();
  }

  getLastExecutionPlan(): QueryExecutionPlan | null {
    return this.lastExecutionPlan;
  }

  getStats() {
    const harvesterStats = this.harvesters.getStats();
    const poolStats = this.pool.getStats();
    const spaceStats = this.space.getStats();
    return {
      running: this.running,
      round: this.round,
      engineId: this.config.id,
      ants: {
        harvesters: harvesterStats.harvesters,
        nurse: 1,
        total: harvesterStats.harvesters + 1,
      },
      space: spaceStats,
      reports: harvesterStats.reports,
      pool: { browsers: poolStats.browsers, totalNavigations: poolStats.totalNavigations },
      topicsTracked: this.globalTopics.size,
      evidenceStored: this.globalEvidence.size,
      runtimePolicy: this.getRuntimePolicy(),
      executionPlan: this.lastExecutionPlan,
      lastQueryMeta: this.lastQueryMeta,
      sourceCoverage: this.lastSourceCoverage,
    };
  }

  onEngineEvent(callback: (event: EngineEvent) => void): void {
    this.onEvent = callback;
  }

  getEventLog(limit: number = 50): EngineEvent[] {
    return this.eventLog.slice(0, limit);
  }

  private emit(type: EngineEventType, message: string, data?: any): void {
    const event: EngineEvent = { type, message, data, timestamp: Date.now() };
    this.eventLog.unshift(event);
    if (this.eventLog.length > 200) this.eventLog = this.eventLog.slice(0, 200);
    if (this.onEvent) this.onEvent(event);
  }

  isRunning(): boolean { return this.running; }
  getRound(): number { return this.round; }
  getConfig(): SwarmEngineConfig { return { ...this.config }; }
}
