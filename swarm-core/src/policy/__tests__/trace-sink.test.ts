import fs from 'fs';
import path from 'path';
import os from 'os';
import { FilePolicyTraceSink, NoopPolicyTraceSink } from '../trace-sink';
import { PolicyTraceRecord } from '../policy-types';

function makeTrace(overrides: Partial<PolicyTraceRecord> = {}): PolicyTraceRecord {
  return {
    traceId: 'test-trace-1',
    mode: 'heuristic',
    query: 'test query',
    symbols: ['AAPL'],
    modelId: 'full',
    startedAt: Date.now() - 1000,
    completedAt: Date.now(),
    controllerUsed: 'heuristic',
    fallbackUsed: false,
    decisionSteps: 3,
    inferenceMs: 0,
    modelVersion: null,
    frames: [
      {
        stepIndex: 0,
        availableRoles: ['link_pathfinder', 'news_reader'],
        featureVector: [0.1, 0.2, 0.3],
        observation: {
          frontierSize: 10,
          evidenceCount: 2,
          coverageRatio: 0.5,
          usefulnessScore: 0.4,
          elapsedMs: 500,
          remainingMs: 19500,
        },
        heuristicAction: { roleId: 'link_pathfinder', units: 2, confidence: 0.9, source: 'heuristic', reason: 'heuristic_round_robin' },
        modelAction: null,
        executedAction: { roleId: 'link_pathfinder', units: 2, confidence: 0.9, source: 'heuristic', reason: 'heuristic_round_robin' },
        fallbackUsed: false,
      },
    ],
    finalMetrics: {
      evidenceCount: 5,
      coverageRatio: 0.8,
      usefulnessScore: 0.7,
      promotedTopics: 1,
      elapsedMs: 2000,
    },
    ...overrides,
  };
}

describe('trace-sink', () => {
  it('NoopPolicyTraceSink.record completes without error', async () => {
    const sink = new NoopPolicyTraceSink();
    await expect(sink.record(makeTrace())).resolves.toBeUndefined();
  });

  it('FilePolicyTraceSink writes JSONL to the correct day file', async () => {
    const tmpDir = path.join(os.tmpdir(), `swarm-trace-test-${Date.now()}`);
    const sink = new FilePolicyTraceSink(tmpDir);

    const trace = makeTrace();
    await sink.record(trace);

    const day = new Date().toISOString().slice(0, 10);
    const filePath = path.join(tmpDir, `${day}.jsonl`);
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf8').trim();
    const parsed = JSON.parse(content);
    expect(parsed.traceId).toBe('test-trace-1');
    expect(parsed.frames).toHaveLength(1);
    expect(parsed.frames[0].featureVector).toEqual([0.1, 0.2, 0.3]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('FilePolicyTraceSink appends multiple traces to same file', async () => {
    const tmpDir = path.join(os.tmpdir(), `swarm-trace-test-multi-${Date.now()}`);
    const sink = new FilePolicyTraceSink(tmpDir);

    await sink.record(makeTrace({ traceId: 'trace-a' }));
    await sink.record(makeTrace({ traceId: 'trace-b' }));

    const day = new Date().toISOString().slice(0, 10);
    const filePath = path.join(tmpDir, `${day}.jsonl`);
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).traceId).toBe('trace-a');
    expect(JSON.parse(lines[1]).traceId).toBe('trace-b');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
