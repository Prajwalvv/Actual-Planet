import { randomUUID } from 'crypto';
import { DecisionTraceFrame, PolicyControllerUsed, PolicyMode, PolicySessionSummary, PolicyTraceRecord } from './policy-types';

export class PolicyDecisionTrace {
  readonly id = randomUUID();
  private readonly startedAt = Date.now();
  private readonly frames: DecisionTraceFrame[] = [];

  constructor(
    private readonly mode: PolicyMode,
    private readonly query: string,
    private readonly symbols: string[],
    private readonly modelId: string,
  ) {}

  push(frame: DecisionTraceFrame): void {
    this.frames.push(frame);
  }

  buildRecord(summary: PolicySessionSummary, finalMetrics: PolicyTraceRecord['finalMetrics']): PolicyTraceRecord {
    return {
      traceId: this.id,
      mode: this.mode,
      query: this.query,
      symbols: [...this.symbols],
      modelId: this.modelId,
      startedAt: this.startedAt,
      completedAt: Date.now(),
      controllerUsed: summary.controllerUsed,
      fallbackUsed: summary.fallbackUsed,
      decisionSteps: summary.decisionSteps,
      inferenceMs: summary.inferenceMs,
      modelVersion: summary.modelVersion || null,
      frames: [...this.frames],
      finalMetrics,
    };
  }

  getFrameCount(): number {
    return this.frames.length;
  }
}
