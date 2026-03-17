/**
 * AGENT TRACE COLLECTOR
 *
 * Collects per-agent decision traces for training data.
 * Each trace records: observation, candidates, features, selections, outcomes.
 *
 * Enabled via environment variable: SWARM_AGENT_TRACE=1
 * Traces written as JSONL files to SWARM_AGENT_TRACE_DIR (default: runtime-artifacts/agent-traces)
 *
 * Training pipeline reads these traces to learn:
 * - Which candidates the heuristic preferred (imitation learning)
 * - Which candidates actually produced useful results (outcome-based learning)
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { AgentObservation, AgentTraceRecord, AgentType, CandidateOutcome } from './agent-types';

// ─────────────────────────────────────────────
// Trace Collector Interface
// ─────────────────────────────────────────────

export interface IAgentTraceCollector {
  /** Record a decision: what was observed, what was available, what was chosen */
  recordDecision(
    agentType: AgentType,
    observation: AgentObservation,
    candidates: any[],
    featureVectors: number[][],
    selectedIndices: number[],
  ): string; // Returns traceId

  /** Record outcomes for a previously recorded decision */
  recordOutcomes(traceId: string, outcomes: CandidateOutcome[]): void;

  /** Flush pending traces to disk */
  flush(): Promise<void>;

  /** Get count of traces collected this session */
  getTraceCount(): number;
}

// ─────────────────────────────────────────────
// Noop Collector (when tracing is disabled)
// ─────────────────────────────────────────────

export class NoopAgentTraceCollector implements IAgentTraceCollector {
  recordDecision(
    _agentType: AgentType,
    _observation: AgentObservation,
    _candidates: any[],
    _featureVectors: number[][],
    _selectedIndices: number[],
  ): string { return ''; }
  recordOutcomes(_traceId: string, _outcomes: CandidateOutcome[]): void { }
  async flush(): Promise<void> { }
  getTraceCount(): number { return 0; }
}

// ─────────────────────────────────────────────
// File-based Collector (writes JSONL)
// ─────────────────────────────────────────────

export class FileAgentTraceCollector implements IAgentTraceCollector {
  private traceDir: string;
  private pending: Map<string, AgentTraceRecord> = new Map();
  private completed: AgentTraceRecord[] = [];
  private flushThreshold: number;
  private traceCount = 0;

  constructor(traceDir: string, flushThreshold = 50) {
    this.traceDir = traceDir;
    this.flushThreshold = flushThreshold;
    fs.mkdirSync(traceDir, { recursive: true });
  }

  recordDecision(
    agentType: AgentType,
    observation: AgentObservation,
    candidates: any[],
    featureVectors: number[][],
    selectedIndices: number[],
  ): string {
    const traceId = `agent-${agentType}-${randomUUID().slice(0, 8)}`;
    const record: AgentTraceRecord = {
      traceId,
      agentType,
      timestamp: Date.now(),
      observation,
      candidates,
      featureVectors,
      selectedIndices,
      outcomes: [],
    };
    this.pending.set(traceId, record);
    this.traceCount++;
    return traceId;
  }

  recordOutcomes(traceId: string, outcomes: CandidateOutcome[]): void {
    const record = this.pending.get(traceId);
    if (!record) return;
    record.outcomes = outcomes;
    this.completed.push(record);
    this.pending.delete(traceId);

    if (this.completed.length >= this.flushThreshold) {
      this.flush().catch(err => console.error('[AgentTraceCollector] Flush error:', err));
    }
  }

  async flush(): Promise<void> {
    if (this.pending.size > 0) {
      for (const record of this.pending.values()) {
        this.completed.push(record);
      }
      this.pending.clear();
    }
    if (this.completed.length === 0) return;

    const batch = this.completed.splice(0);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filePath = path.join(this.traceDir, `agent-traces-${dateStr}.jsonl`);

    const lines = batch.map(record => JSON.stringify(record)).join('\n') + '\n';

    try {
      fs.appendFileSync(filePath, lines, 'utf-8');
    } catch (err) {
      console.error(`[AgentTraceCollector] Write error to ${filePath}:`, err);
      // Put records back for retry
      this.completed.unshift(...batch);
    }
  }

  getTraceCount(): number {
    return this.traceCount;
  }
}

// ─────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────

/**
 * Create the appropriate trace collector based on environment variables.
 *
 * SWARM_AGENT_TRACE=1           → Enable trace collection
 * SWARM_AGENT_TRACE_DIR=<path>  → Custom trace directory
 */
export function createAgentTraceCollector(): IAgentTraceCollector {
  const enabled = process.env.SWARM_AGENT_TRACE === '1' || process.env.SWARM_AGENT_TRACE === 'true';
  if (!enabled) return new NoopAgentTraceCollector();

  const traceDir = process.env.SWARM_AGENT_TRACE_DIR
    || path.resolve(process.cwd(), 'runtime-artifacts', 'agent-traces');

  console.info(`[AgentTraceCollector] Enabled — writing to ${traceDir}`);
  return new FileAgentTraceCollector(traceDir);
}
