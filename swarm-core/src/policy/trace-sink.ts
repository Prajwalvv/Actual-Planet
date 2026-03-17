import fs from 'fs';
import path from 'path';
import { PolicyTraceRecord } from './policy-types';

export interface PolicyTraceSink {
  record(trace: PolicyTraceRecord): Promise<void>;
}

export class NoopPolicyTraceSink implements PolicyTraceSink {
  async record(_trace: PolicyTraceRecord): Promise<void> {
    return;
  }
}

export class FilePolicyTraceSink implements PolicyTraceSink {
  private initialized = false;

  constructor(private readonly dir: string) {}

  async record(trace: PolicyTraceRecord): Promise<void> {
    if (!this.initialized) {
      await fs.promises.mkdir(this.dir, { recursive: true });
      this.initialized = true;
    }

    const day = new Date().toISOString().slice(0, 10);
    const filePath = path.join(this.dir, `${day}.jsonl`);
    await fs.promises.appendFile(filePath, `${JSON.stringify(trace)}\n`, 'utf8');
  }
}

export function createPolicyTraceSinkFromEnv(): PolicyTraceSink {
  const enabled = (process.env.SWARM_POLICY_TRACE || '0').toLowerCase();
  if (!['1', 'true', 'yes', 'on'].includes(enabled)) {
    return new NoopPolicyTraceSink();
  }

  const dir = process.env.SWARM_TRACE_DIR || path.join(process.cwd(), 'runtime-artifacts', 'policy-traces');
  return new FilePolicyTraceSink(dir);
}
