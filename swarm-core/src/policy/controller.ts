import { AdaptiveQueryRequest, QueryExecutionPlan } from '../adaptive-types';
import { QueryFrontier } from '../discovery/frontier';
import { QueryOverlayMemory } from '../memory/query-overlay';
import { IPheromoneSpace } from '../types';
import { PolicyDecisionTrace } from './decision-trace';
import { buildPolicyObservation, encodePolicyObservation } from './feature-extractor';
import { GruPolicyRuntime } from './gru-inference';
import { createHeuristicPolicyState, fallbackActionFromReason, heuristicPolicyAction } from './heuristic-fallback';
import { ensurePolicyLocations, recordPolicyOutcomePheromones, summarizePheromoneContext } from './pheromone-context';
import { computeAvailableRoles, validateModelAction } from './policy-guard';
import { DecisionOutcome, PolicyDecision, PolicyMode, PolicySessionSummary } from './policy-types';
import { createPolicyTraceSinkFromEnv, NoopPolicyTraceSink, PolicyTraceSink } from './trace-sink';

interface PolicyControllerConfig {
  rootLocation: string;
  maxDecisionSteps: number;
  confidenceFloor: number;
}

const DEFAULT_CONFIG: PolicyControllerConfig = {
  rootLocation: 'DOMAIN:DISCOVERED',
  maxDecisionSteps: Number(process.env.SWARM_MAX_POLICY_STEPS || 24),
  confidenceFloor: Number(process.env.SWARM_POLICY_CONFIDENCE_MIN || 0.35),
};

export interface PolicySessionInput {
  request: AdaptiveQueryRequest;
  plan: QueryExecutionPlan;
  startedAt: number;
  exploreDeadlineMs: number;
  requestedInputs: string[];
}

export interface PolicyStepInput {
  frontier: QueryFrontier;
  overlay: QueryOverlayMemory;
  lastDecision: { roleId: PolicyDecision['executedAction']['roleId']; units: number } | null;
  lastOutcome: DecisionOutcome | null;
}

export class PolicyController {
  private readonly config: PolicyControllerConfig;
  private readonly traceSink: PolicyTraceSink;
  private readonly gruRuntime: GruPolicyRuntime;

  constructor(
    config: Partial<PolicyControllerConfig> = {},
    traceSink: PolicyTraceSink = createPolicyTraceSinkFromEnv(),
    gruRuntime: GruPolicyRuntime = new GruPolicyRuntime(),
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.traceSink = traceSink;
    this.gruRuntime = gruRuntime;
  }

  createSession(space: IPheromoneSpace, input: PolicySessionInput): PolicySession {
    return new PolicySession(space, input, this.config, this.traceSink, this.gruRuntime);
  }
}

class PolicySession {
  private readonly heuristicState = createHeuristicPolicyState();
  private readonly trace: PolicyDecisionTrace;
  private readonly requestedMode: PolicyMode;
  private readonly providerIds: string[];
  private decisionSteps = 0;
  private fallbackUsed = false;
  private controllerUsed: PolicySessionSummary['controllerUsed'] = 'heuristic';
  private inferenceMs = 0;
  private modelVersion: string | null = null;

  constructor(
    private readonly space: IPheromoneSpace,
    private readonly input: PolicySessionInput,
    private readonly config: PolicyControllerConfig,
    private readonly traceSink: PolicyTraceSink,
    private readonly gruRuntime: GruPolicyRuntime,
  ) {
    this.requestedMode = input.request.policyMode || 'heuristic';
    this.providerIds = input.plan.providerPlan.map((entry) => entry.providerId);
    this.trace = new PolicyDecisionTrace(
      this.requestedMode,
      input.request.query || '',
      input.request.symbols || [],
      input.request.modelId,
    );
  }

  async initialize(): Promise<void> {
    this.gruRuntime.reset();
    await ensurePolicyLocations(this.space, {
      rootLocation: this.config.rootLocation,
      modelId: this.input.request.modelId,
      plan: this.input.plan,
    });
  }

  getTraceId(): string {
    return this.trace.id;
  }

  getMaxDecisionSteps(): number {
    return this.config.maxDecisionSteps;
  }

  async chooseNext(input: PolicyStepInput): Promise<PolicyDecision> {
    const availableRoles = computeAvailableRoles(this.input.plan, input.frontier.size(), input.overlay.getEvidence().length);
    const coverage = input.overlay.computeCoverage(this.input.requestedInputs);
    const elapsedMs = Date.now() - this.input.startedAt;
    const remainingMs = Math.max(0, this.input.exploreDeadlineMs - Date.now());
    const pheromone = await summarizePheromoneContext(this.space, {
      rootLocation: this.config.rootLocation,
      modelId: this.input.request.modelId,
      providerIds: this.providerIds,
    });

    const heuristicAction = heuristicPolicyAction(this.input.plan, availableRoles, this.heuristicState);
    const observation = buildPolicyObservation({
      mode: this.requestedMode,
      stepIndex: this.decisionSteps,
      request: this.input.request,
      plan: this.input.plan,
      frontier: input.frontier,
      overlay: input.overlay,
      coverage,
      pheromone,
      availableRoles,
      lastAction: input.lastDecision ? {
        roleId: input.lastDecision.roleId,
        units: input.lastDecision.units,
        confidence: 1,
        source: 'heuristic',
        reason: 'previous_action',
      } : null,
      lastEvidenceGain: input.lastOutcome?.evidenceDelta || 0,
      lastCoverageGain: input.lastOutcome?.coverageDelta || 0,
      elapsedMs,
      remainingMs,
    });

    let modelAction = null;
    let executedAction = heuristicAction;
    let fallbackReason: string | undefined;

    const shouldConsultGru = this.requestedMode === 'gru_shadow' || this.requestedMode === 'gru_live' || this.requestedMode === 'auto';
    if (shouldConsultGru) {
      const inferenceStartedAt = Date.now();
      modelAction = await this.gruRuntime.decide(observation);
      this.inferenceMs += Date.now() - inferenceStartedAt;
      this.modelVersion = modelAction?.modelVersion || this.modelVersion;
    }

    if (this.requestedMode === 'gru_live' || this.requestedMode === 'auto') {
      const guard = validateModelAction(modelAction, availableRoles, this.config.confidenceFloor);
      if (guard.ok && guard.action) {
        executedAction = guard.action;
        this.controllerUsed = 'gru';
      } else if (shouldConsultGru) {
        fallbackReason = guard.reason || 'gru_rejected';
        if (process.env.SWARM_DEBUG_POLICY) {
          console.log(`[PolicyDebug] GRU rejected: reason=${fallbackReason} modelAction=${JSON.stringify(modelAction)} availableRoles=${JSON.stringify(availableRoles)} confFloor=${this.config.confidenceFloor}`);
        }
        executedAction = fallbackActionFromReason(fallbackReason, heuristicAction);
        this.fallbackUsed = true;
      }
    }

    const decision: PolicyDecision = {
      stepIndex: this.decisionSteps,
      observation,
      availableRoles,
      heuristicAction,
      modelAction,
      executedAction,
      fallbackUsed: Boolean(fallbackReason),
      fallbackReason,
    };

    return decision;
  }

  async completeStep(decision: PolicyDecision, outcome?: DecisionOutcome): Promise<void> {
    this.trace.push({
      stepIndex: decision.stepIndex,
      availableRoles: [...decision.availableRoles],
      featureVector: Array.from(encodePolicyObservation(decision.observation)),
      observation: {
        frontierSize: decision.observation.frontierSize,
        evidenceCount: decision.observation.evidenceCount,
        coverageRatio: decision.observation.coverage.coverageRatio,
        usefulnessScore: decision.observation.coverage.usefulnessScore,
        elapsedMs: decision.observation.elapsedMs,
        remainingMs: decision.observation.remainingMs,
      },
      heuristicAction: decision.heuristicAction,
      modelAction: decision.modelAction,
      executedAction: decision.executedAction,
      fallbackUsed: decision.fallbackUsed,
      fallbackReason: decision.fallbackReason,
      outcome,
    });

    if (outcome) {
      await recordPolicyOutcomePheromones(this.space, decision.executedAction, outcome, {
        modelId: this.input.request.modelId,
        traceId: this.trace.id,
        stepIndex: decision.stepIndex,
      });
    }

    this.decisionSteps += 1;
  }

  async finalize(input: {
    evidenceCount: number;
    coverageRatio: number;
    usefulnessScore: number;
    promotedTopics: number;
    elapsedMs: number;
  }): Promise<PolicySessionSummary> {
    const summary: PolicySessionSummary = {
      mode: this.requestedMode,
      controllerUsed: this.controllerUsed,
      fallbackUsed: this.fallbackUsed,
      decisionSteps: this.trace.getFrameCount(),
      inferenceMs: this.inferenceMs,
      traceId: this.trace.id,
      modelVersion: this.modelVersion || null,
    };

    await this.traceSink.record(this.trace.buildRecord(summary, input));
    return summary;
  }
}

export function createNoopPolicyController(rootLocation: string): PolicyController {
  return new PolicyController({ rootLocation }, new NoopPolicyTraceSink(), new GruPolicyRuntime(''));
}
