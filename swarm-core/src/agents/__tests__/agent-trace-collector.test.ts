import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileAgentTraceCollector, NoopAgentTraceCollector } from '../agent-trace-collector';
import { AgentObservation, LinkCandidate } from '../agent-types';

function makeObservation(): AgentObservation {
  return {
    queryLengthNorm: 0.2,
    symbolCount: 1,
    terrainOneHot: [1, 0, 0, 0, 0, 0, 0],
    depthOneHot: [0, 1, 0],
    timeBudgetRemaining: 0.5,
    coverageRatio: 0.3,
    frontierSizeNorm: 0.2,
    evidenceCountNorm: 0.1,
    sourceDiversityNorm: 0.1,
    trailStrength: 0.0,
    interestStrength: 0.0,
    deadTrailStrength: 0.0,
    stepProgress: 0.0,
    usefulnessScore: 0.0,
    blockedRatioNorm: 0.0,
  };
}

function makeCandidates(n: number): LinkCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    url: `https://site${i}.com/page`,
    domain: `site${i}.com`,
    discoveredDepth: 0,
    hasTitle: true,
    hasSnippet: false,
    sourcePriority: 0.5,
    sourceProviderId: 'test',
  }));
}

describe('NoopAgentTraceCollector', () => {
  it('returns empty string for traceId', () => {
    const collector = new NoopAgentTraceCollector();
    const id = collector.recordDecision('explorer', makeObservation(), [], [], []);
    expect(id).toBe('');
  });

  it('getTraceCount always returns 0', () => {
    const collector = new NoopAgentTraceCollector();
    expect(collector.getTraceCount()).toBe(0);
  });

  it('flush completes without error', async () => {
    const collector = new NoopAgentTraceCollector();
    await collector.flush();
  });
});

describe('FileAgentTraceCollector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-trace-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records decisions and increments trace count', () => {
    const collector = new FileAgentTraceCollector(tmpDir, 100);
    const obs = makeObservation();
    const candidates = makeCandidates(3);
    const features = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];

    const id1 = collector.recordDecision('explorer', obs, candidates, features, [0, 1]);
    const id2 = collector.recordDecision('explorer', obs, candidates, features, [2]);

    expect(id1).toContain('agent-explorer-');
    expect(id2).toContain('agent-explorer-');
    expect(id1).not.toBe(id2);
    expect(collector.getTraceCount()).toBe(2);
  });

  it('writes JSONL after recording outcomes and flushing', async () => {
    const collector = new FileAgentTraceCollector(tmpDir, 100);
    const obs = makeObservation();
    const candidates = makeCandidates(2);
    const features = [[1, 2], [3, 4]];

    const traceId = collector.recordDecision('explorer', obs, candidates, features, [0]);
    collector.recordOutcomes(traceId, [{
      candidateIndex: 0,
      yieldedEvidence: true,
      evidenceCount: 2,
      coverageDelta: 0.05,
      elapsedMs: 150,
      fetchSuccess: true,
    }]);

    await collector.flush();

    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.jsonl'));
    expect(files.length).toBe(1);

    const content = fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(1);

    const record = JSON.parse(lines[0]);
    expect(record.traceId).toBe(traceId);
    expect(record.agentType).toBe('explorer');
    expect(record.candidates).toHaveLength(2);
    expect(record.featureVectors).toHaveLength(2);
    expect(record.selectedIndices).toEqual([0]);
    expect(record.outcomes).toHaveLength(1);
    expect(record.outcomes[0].yieldedEvidence).toBe(true);
  });

  it('auto-flushes when threshold is reached', async () => {
    const collector = new FileAgentTraceCollector(tmpDir, 2); // flush every 2
    const obs = makeObservation();
    const candidates = makeCandidates(1);

    // Record 2 complete traces (should trigger auto-flush)
    const id1 = collector.recordDecision('explorer', obs, candidates, [[1]], [0]);
    collector.recordOutcomes(id1, [{ candidateIndex: 0, yieldedEvidence: false, evidenceCount: 0, coverageDelta: 0, elapsedMs: 10, fetchSuccess: false }]);

    const id2 = collector.recordDecision('explorer', obs, candidates, [[2]], [0]);
    collector.recordOutcomes(id2, [{ candidateIndex: 0, yieldedEvidence: true, evidenceCount: 1, coverageDelta: 0.01, elapsedMs: 20, fetchSuccess: true }]);

    // Give async flush a moment
    await new Promise(resolve => setTimeout(resolve, 100));

    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.jsonl'));
    expect(files.length).toBe(1);

    const content = fs.readFileSync(path.join(tmpDir, files[0]), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(2);
  });
});
