import Redis from 'ioredis';

export interface QoSConfig {
  maxGlobalQueued: number;
  maxShardQueue: number;
  maxTenantQueued: number;
  maxTenantInFlight: number;
}

export interface AdmissionInput {
  tenantId: string;
  shardQueueDepth: number;
  globalQueueDepth: number;
}

export interface AdmissionDecision {
  ok: boolean;
  reason?: string;
  retryAfterSec?: number;
}

const DEFAULT_CONFIG: QoSConfig = {
  maxGlobalQueued: Number(process.env.SWARM_MAX_GLOBAL_QUEUE || 10_000),
  maxShardQueue: Number(process.env.SWARM_MAX_SHARD_QUEUE || 256),
  maxTenantQueued: Number(process.env.SWARM_MAX_TENANT_QUEUE || 256),
  maxTenantInFlight: Number(process.env.SWARM_MAX_TENANT_INFLIGHT || 32),
};

function clampNonNegative(n: number, fallback: number): number {
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

/**
 * QoS admission and tenant fairness counters.
 * This is process-local and designed to pair with horizontal API scaling.
 */
export class QoSManager {
  private config: QoSConfig;
  private tenantQueued = new Map<string, number>();
  private tenantInFlight = new Map<string, number>();
  private redis: Redis | null = null;
  private redisPrefix: string = process.env.SWARM_QOS_REDIS_PREFIX || 'swr:qos';

  constructor(config: Partial<QoSConfig> = {}) {
    this.config = {
      maxGlobalQueued: clampNonNegative(config.maxGlobalQueued ?? DEFAULT_CONFIG.maxGlobalQueued, DEFAULT_CONFIG.maxGlobalQueued),
      maxShardQueue: clampNonNegative(config.maxShardQueue ?? DEFAULT_CONFIG.maxShardQueue, DEFAULT_CONFIG.maxShardQueue),
      maxTenantQueued: clampNonNegative(config.maxTenantQueued ?? DEFAULT_CONFIG.maxTenantQueued, DEFAULT_CONFIG.maxTenantQueued),
      maxTenantInFlight: clampNonNegative(config.maxTenantInFlight ?? DEFAULT_CONFIG.maxTenantInFlight, DEFAULT_CONFIG.maxTenantInFlight),
    };

    const redisUrl = process.env.QOS_REDIS_URL || process.env.REDIS_URL || '';
    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableReadyCheck: true,
        });
        this.redis.on('error', () => {});
        this.redis.connect().catch(() => {});
      } catch {
        this.redis = null;
      }
    }
  }

  canAdmit(input: AdmissionInput): AdmissionDecision {
    const queued = this.tenantQueued.get(input.tenantId) || 0;
    const inFlight = this.tenantInFlight.get(input.tenantId) || 0;

    if (input.globalQueueDepth >= this.config.maxGlobalQueued) {
      return { ok: false, reason: 'global_queue_saturated', retryAfterSec: 2 };
    }

    if (input.shardQueueDepth >= this.config.maxShardQueue) {
      return { ok: false, reason: 'shard_queue_saturated', retryAfterSec: 1 };
    }

    if (queued >= this.config.maxTenantQueued) {
      return { ok: false, reason: 'tenant_queue_limit', retryAfterSec: 1 };
    }

    // Fair-share guard: if tenant is already consuming high inflight slots,
    // cap additional queueing to prevent starvation of other tenants.
    if (inFlight >= this.config.maxTenantInFlight && queued >= Math.max(4, Math.floor(this.config.maxTenantQueued / 8))) {
      return { ok: false, reason: 'tenant_fair_share_limit', retryAfterSec: 1 };
    }

    return { ok: true };
  }

  markQueued(tenantId: string): void {
    this.tenantQueued.set(tenantId, (this.tenantQueued.get(tenantId) || 0) + 1);
  }

  markDequeued(tenantId: string): void {
    const queued = Math.max(0, (this.tenantQueued.get(tenantId) || 0) - 1);
    if (queued === 0) this.tenantQueued.delete(tenantId);
    else this.tenantQueued.set(tenantId, queued);

    this.tenantInFlight.set(tenantId, (this.tenantInFlight.get(tenantId) || 0) + 1);
  }

  markCompleted(tenantId: string): void {
    const inFlight = Math.max(0, (this.tenantInFlight.get(tenantId) || 0) - 1);
    if (inFlight === 0) this.tenantInFlight.delete(tenantId);
    else this.tenantInFlight.set(tenantId, inFlight);
  }

  markRejectedQueue(tenantId: string): void {
    const queued = Math.max(0, (this.tenantQueued.get(tenantId) || 0) - 1);
    if (queued === 0) this.tenantQueued.delete(tenantId);
    else this.tenantQueued.set(tenantId, queued);
  }

  async acquireFairShareToken(tenantId: string): Promise<AdmissionDecision> {
    if (!this.redis) return { ok: true };

    try {
      const key = `${this.redisPrefix}:tenant:${tenantId}:inflight`;
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, 30);
      }
      if (count > this.config.maxTenantInFlight) {
        await this.redis.decr(key);
        return { ok: false, reason: 'tenant_distributed_fair_share_limit', retryAfterSec: 1 };
      }
      return { ok: true };
    } catch {
      return { ok: true };
    }
  }

  async releaseFairShareToken(tenantId: string): Promise<void> {
    if (!this.redis) return;
    try {
      const key = `${this.redisPrefix}:tenant:${tenantId}:inflight`;
      const next = await this.redis.decr(key);
      if (next <= 0) {
        await this.redis.del(key);
      }
    } catch {
      // best effort
    }
  }

  getSnapshot(): {
    config: QoSConfig;
    tenantQueued: number;
    tenantInFlight: number;
  } {
    return {
      config: { ...this.config },
      tenantQueued: [...this.tenantQueued.values()].reduce((a, b) => a + b, 0),
      tenantInFlight: [...this.tenantInFlight.values()].reduce((a, b) => a + b, 0),
    };
  }
}
