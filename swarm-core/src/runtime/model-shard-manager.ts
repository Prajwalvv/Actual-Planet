import { EngineEvent, SwarmEngine, SwarmEngineConfig } from '../swarm-engine';
import { getModel } from '../swarm-models';

export interface ModelShardManagerConfig {
  idleTtlMs: number;
  maxShardsPerModel: number;
  scaleOutQueueDepth: number;
  onEngineEvent?: (event: EngineEvent, shard: { id: string; modelId: string }) => void;
  onLifecycleEvent?: (event: {
    type: 'shard_started' | 'shard_stopped';
    shardId: string;
    modelId: string;
    reason?: string;
  }) => void;
}

export interface ShardAssignment {
  shardId: string;
  modelId: string;
  queueDepth: number;
  inFlight: number;
  autoStarted: boolean;
  restartedForModel: boolean;
  coldStartMs: number;
}

export interface ShardRunTicket {
  shardId: string;
  modelId: string;
  queuePosition: number;
  queueWaitMs: number;
  autoStarted: boolean;
  restartedForModel: boolean;
  coldStartMs: number;
  engine: SwarmEngine;
}

interface ShardRecord {
  id: string;
  modelId: string;
  engine: SwarmEngine;
  createdAt: number;
  lastUsedAt: number;
  queuedCount: number;
  inFlight: number;
  tail: Promise<void>;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

const DEFAULT_CONFIG: ModelShardManagerConfig = {
  idleTtlMs: Number(process.env.SWARM_IDLE_TTL_MS || 120_000),
  maxShardsPerModel: Number(process.env.SWARM_MAX_SHARDS_PER_MODEL || 4),
  scaleOutQueueDepth: Number(process.env.SWARM_SCALE_OUT_QUEUE_DEPTH || 1),
};

function stableHash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0);
}

function clampInt(value: number, fallback: number, min: number = 1): number {
  if (!Number.isFinite(value)) return fallback;
  const n = Math.floor(value);
  if (n < min) return fallback;
  return n;
}

/**
 * Per-model shard pools. Each shard has local FIFO, while different shards run in parallel.
 */
export class ModelShardManager {
  private config: ModelShardManagerConfig;
  private pools = new Map<string, ShardRecord[]>();
  private shardsById = new Map<string, ShardRecord>();
  private shardSeq = 0;
  private lastUsedModel = 'full';
  private createChain: Promise<void> = Promise.resolve();

  constructor(config: Partial<ModelShardManagerConfig> = {}) {
    this.config = {
      idleTtlMs: clampInt(config.idleTtlMs ?? DEFAULT_CONFIG.idleTtlMs, DEFAULT_CONFIG.idleTtlMs),
      maxShardsPerModel: clampInt(config.maxShardsPerModel ?? DEFAULT_CONFIG.maxShardsPerModel, DEFAULT_CONFIG.maxShardsPerModel),
      scaleOutQueueDepth: clampInt(config.scaleOutQueueDepth ?? DEFAULT_CONFIG.scaleOutQueueDepth, DEFAULT_CONFIG.scaleOutQueueDepth, 0),
      onEngineEvent: config.onEngineEvent,
      onLifecycleEvent: config.onLifecycleEvent,
    };
  }

  private withCreateLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.createChain.catch(() => undefined).then(fn);
    this.createChain = run.then(() => undefined, () => undefined);
    return run;
  }

  private getPool(modelId: string): ShardRecord[] {
    return this.pools.get(modelId) || [];
  }

  private setPool(modelId: string, pool: ShardRecord[]): void {
    this.pools.set(modelId, pool);
  }

  private clearIdleTimer(shard: ShardRecord): void {
    if (!shard.idleTimer) return;
    clearTimeout(shard.idleTimer);
    shard.idleTimer = null;
  }

  private scheduleIdleStop(shard: ShardRecord): void {
    this.clearIdleTimer(shard);
    if (shard.queuedCount > 0 || shard.inFlight > 0) return;

    shard.idleTimer = setTimeout(async () => {
      const current = this.shardsById.get(shard.id);
      if (!current) return;
      if (current.queuedCount > 0 || current.inFlight > 0) {
        this.scheduleIdleStop(current);
        return;
      }
      await this.stopShard(current, `idle_timeout_${this.config.idleTtlMs}ms`);
    }, this.config.idleTtlMs);
  }

  private async stopShard(shard: ShardRecord, reason: string): Promise<void> {
    this.clearIdleTimer(shard);
    this.shardsById.delete(shard.id);

    const pool = this.getPool(shard.modelId).filter((s) => s.id !== shard.id);
    if (pool.length === 0) this.pools.delete(shard.modelId);
    else this.setPool(shard.modelId, pool);

    try {
      if (shard.engine.isRunning()) {
        await shard.engine.stop();
      }
    } catch {
      // ignore stop failures during shutdown cleanup
    }

    this.config.onLifecycleEvent?.({
      type: 'shard_stopped',
      shardId: shard.id,
      modelId: shard.modelId,
      reason,
    });
  }

  private async createShard(modelId: string): Promise<ShardRecord> {
    const modelDef = getModel(modelId);
    const shardNum = ++this.shardSeq;
    const shardId = `${modelDef.id}-shard-${shardNum}`;

    const engineConfig: Partial<SwarmEngineConfig> = {
      ...modelDef.config,
      id: `${modelDef.config.id || `engine:${modelDef.id}`}:${shardNum}`,
    };

    const eng = new SwarmEngine(engineConfig);
    eng.onEngineEvent((event: EngineEvent) => {
      this.config.onEngineEvent?.(event, { id: shardId, modelId: modelDef.id });
    });

    const startedAt = Date.now();
    await eng.start();

    const shard: ShardRecord = {
      id: shardId,
      modelId: modelDef.id,
      engine: eng,
      createdAt: startedAt,
      lastUsedAt: Date.now(),
      queuedCount: 0,
      inFlight: 0,
      tail: Promise.resolve(),
      idleTimer: null,
    };

    this.shardsById.set(shard.id, shard);
    this.setPool(modelDef.id, [...this.getPool(modelDef.id), shard]);
    this.lastUsedModel = modelDef.id;

    this.config.onLifecycleEvent?.({
      type: 'shard_started',
      shardId: shard.id,
      modelId: modelDef.id,
    });

    return shard;
  }

  private pickLeastLoaded(pool: ShardRecord[]): ShardRecord {
    return pool
      .slice()
      .sort((a, b) => {
        const aLoad = a.queuedCount + a.inFlight;
        const bLoad = b.queuedCount + b.inFlight;
        if (aLoad !== bLoad) return aLoad - bLoad;
        return a.lastUsedAt - b.lastUsedAt;
      })[0];
  }

  async assignShard(modelId: string, tenantId: string): Promise<ShardAssignment> {
    const resolvedModel = getModel(modelId).id;

    return this.withCreateLock(async () => {
      let pool = this.getPool(resolvedModel);
      let autoStarted = false;
      let coldStartMs = 0;

      if (pool.length === 0) {
        const createdAt = Date.now();
        const shard = await this.createShard(resolvedModel);
        coldStartMs = Date.now() - createdAt;
        autoStarted = true;
        pool = [shard];
      }

      const hashIndex = stableHash(`${tenantId}:${resolvedModel}`) % pool.length;
      const hashed = pool[hashIndex];
      const leastLoaded = this.pickLeastLoaded(pool);

      let selected = (hashed.queuedCount + hashed.inFlight) <= (leastLoaded.queuedCount + leastLoaded.inFlight + 1)
        ? hashed
        : leastLoaded;

      const shouldScaleOut =
        selected.queuedCount >= this.config.scaleOutQueueDepth &&
        pool.length < this.config.maxShardsPerModel;

      if (shouldScaleOut) {
        const createdAt = Date.now();
        selected = await this.createShard(resolvedModel);
        coldStartMs = Date.now() - createdAt;
        autoStarted = true;
      }

      this.lastUsedModel = resolvedModel;

      return {
        shardId: selected.id,
        modelId: selected.modelId,
        queueDepth: selected.queuedCount,
        inFlight: selected.inFlight,
        autoStarted,
        restartedForModel: false,
        coldStartMs,
      };
    });
  }

  async runOnAssignedShard<T>(
    assignment: ShardAssignment,
    job: (ticket: ShardRunTicket) => Promise<T>,
  ): Promise<T> {
    const shard = this.shardsById.get(assignment.shardId);
    if (!shard || !shard.engine.isRunning()) {
      throw new Error(`Assigned shard unavailable: ${assignment.shardId}`);
    }

    this.clearIdleTimer(shard);

    const enqueuedAt = Date.now();
    const queuePosition = shard.queuedCount;
    shard.queuedCount += 1;

    const runJob = async (): Promise<T> => {
      shard.inFlight += 1;
      const queueWaitMs = Date.now() - enqueuedAt;
      try {
        return await job({
          shardId: shard.id,
          modelId: shard.modelId,
          queuePosition,
          queueWaitMs,
          autoStarted: assignment.autoStarted,
          restartedForModel: assignment.restartedForModel,
          coldStartMs: assignment.coldStartMs,
          engine: shard.engine,
        });
      } finally {
        shard.inFlight = Math.max(0, shard.inFlight - 1);
        shard.queuedCount = Math.max(0, shard.queuedCount - 1);
        shard.lastUsedAt = Date.now();
        this.scheduleIdleStop(shard);
      }
    };

    const resultPromise = shard.tail.catch(() => undefined).then(runJob);
    shard.tail = resultPromise.then(() => undefined, () => undefined);

    return resultPromise;
  }

  getTotalQueueDepth(): number {
    let total = 0;
    for (const shard of this.shardsById.values()) {
      total += shard.queuedCount;
    }
    return total;
  }

  getRunningModelCount(): number {
    return [...this.pools.values()].filter((pool) => pool.length > 0).length;
  }

  getPreferredRunningModel(allowedModels: string[]): string | null {
    if (allowedModels.includes(this.lastUsedModel) && this.getPool(this.lastUsedModel).length > 0) {
      return this.lastUsedModel;
    }

    for (const modelId of allowedModels) {
      if (this.getPool(modelId).length > 0) return modelId;
    }

    return null;
  }

  getShardEngine(modelId?: string): { modelId: string; engine: SwarmEngine } | null {
    if (modelId) {
      const pool = this.getPool(modelId);
      if (pool.length > 0) {
        const shard = this.pickLeastLoaded(pool);
        return { modelId: shard.modelId, engine: shard.engine };
      }
      return null;
    }

    const preferred = this.getPreferredRunningModel([...this.pools.keys()]);
    if (preferred) {
      const pool = this.getPool(preferred);
      if (pool.length > 0) {
        const shard = this.pickLeastLoaded(pool);
        return { modelId: shard.modelId, engine: shard.engine };
      }
    }

    return null;
  }

  getRuntimeSnapshot(): {
    running: boolean;
    activeModel: string;
    totalQueueDepth: number;
    idleTtlSec: number;
    pools: Array<{ modelId: string; shards: number; queueDepth: number; inFlight: number; round: number }>;
  } {
    const pools = [...this.pools.entries()]
      .filter(([, shards]) => shards.length > 0)
      .map(([modelId, shards]) => ({
      modelId,
      shards: shards.length,
      queueDepth: shards.reduce((sum, s) => sum + s.queuedCount, 0),
      inFlight: shards.reduce((sum, s) => sum + s.inFlight, 0),
      round: Math.max(...shards.map((s) => s.engine.getRound() || 0), 0),
    }));

    return {
      running: this.shardsById.size > 0,
      activeModel: this.lastUsedModel,
      totalQueueDepth: this.getTotalQueueDepth(),
      idleTtlSec: Math.round(this.config.idleTtlMs / 1000),
      pools,
    };
  }

  async stopAll(reason: string = 'shutdown'): Promise<void> {
    const all = [...this.shardsById.values()];
    await Promise.all(all.map((shard) => this.stopShard(shard, reason)));
  }
}
