/**
 * REDIS PHEROMONE SPACE — Production-grade shared environment
 * 
 * Same interface as the in-memory PheromoneSpace, but backed by Redis.
 * 
 * Key advantage: Redis has NATIVE TTL on keys.
 * Pheromone decay = Redis TTL. When a signal expires, Redis deletes it.
 * No manual decay pass needed. The database IS the evaporation.
 * 
 * Data model:
 *   Signal:    HSET  pheromone:{locationId}:{type}:{antId}  strength, depositedAt, colony
 *              EXPIRE pheromone:{locationId}:{type}:{antId}  ttlSeconds
 *   Location:  HSET  location:{locationId}  type, parents (JSON)
 *   Hotspot:   ZADD  hotspots  concentration locationId  (sorted set for fast hotspot queries)
 * 
 * Benefits over in-memory:
 * - Signals auto-evaporate via TTL (true biological decay)
 * - Multiple swarm processes can share the same space (distributed colony)
 * - Persistence — swarm survives process restart
 * - Pub/Sub — real-time events for the visualization layer
 */

import Redis from 'ioredis';
import {
  IPheromoneSpace,
  PheromoneDeposit,
  PheromoneReading,
  PheromoneType,
  LocationSnapshot,
  Location,
} from './types';

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────

export interface RedisPheromoneSpaceConfig {
  /** Redis connection URL. Default: redis://localhost:6379 */
  redisUrl: string;
  /** Base TTL for signals in seconds. This is the "half-life" equivalent. Default: 300 (5 min) */
  signalTtlSeconds: number;
  /** How much parent locations receive from child deposits (0-1). Default: 0.3 */
  cascadeRatio: number;
  /** Key prefix to namespace this swarm's data. Default: 'swarm' */
  keyPrefix: string;
  /** Enable pub/sub events for visualization. Default: true */
  enablePubSub: boolean;
}

const DEFAULT_CONFIG: RedisPheromoneSpaceConfig = {
  redisUrl: 'redis://localhost:6379',
  signalTtlSeconds: 300,
  cascadeRatio: 0.3,
  keyPrefix: 'swarm',
  enablePubSub: true,
};

// ─────────────────────────────────────────────
// The Redis Space
// ─────────────────────────────────────────────

export class RedisPheromoneSpace implements IPheromoneSpace {
  private redis: Redis;
  private pubRedis: Redis | null = null;
  private config: RedisPheromoneSpaceConfig;
  private totalDeposits: number = 0;

  constructor(config: Partial<RedisPheromoneSpaceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.redis = new Redis(this.config.redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    if (this.config.enablePubSub) {
      this.pubRedis = new Redis(this.config.redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
    }
  }

  async connect(): Promise<void> {
    await this.redis.connect();
    if (this.pubRedis) await this.pubRedis.connect();
  }

  // ─── KEY HELPERS ──────────────────────────────

  private signalKey(locationId: string, type: string, antId: string): string {
    return `${this.config.keyPrefix}:sig:${locationId}:${type}:${antId}`;
  }

  private locationSignalPattern(locationId: string): string {
    return `${this.config.keyPrefix}:sig:${locationId}:*`;
  }

  private locationKey(locationId: string): string {
    return `${this.config.keyPrefix}:loc:${locationId}`;
  }

  private locationsSetKey(): string {
    return `${this.config.keyPrefix}:locations`;
  }

  private hotspotsKey(): string {
    return `${this.config.keyPrefix}:hotspots`;
  }

  // ─── DEPOSIT ──────────────────────────────────

  async deposit(signal: PheromoneDeposit): Promise<void> {
    const strength = Math.max(0, Math.min(1, signal.strength));

    // Store the signal with TTL — when TTL expires, signal evaporates (biological decay!)
    const key = this.signalKey(signal.locationId, signal.type, signal.sourceAntId);
    const ttl = Math.ceil(this.config.signalTtlSeconds * strength); // stronger signals last longer
    const minTtl = Math.max(ttl, 10); // minimum 10 seconds

    const pipeline = this.redis.pipeline();

    // Store signal data
    pipeline.hset(key, {
      type: signal.type,
      strength: strength.toString(),
      sourceAntId: signal.sourceAntId,
      sourceColony: signal.sourceColony,
      depositedAt: signal.timestamp.toString(),
    });
    pipeline.expire(key, minTtl);

    // Track this location exists
    pipeline.sadd(this.locationsSetKey(), signal.locationId);

    // CASCADE: propagate a fraction to parent locations
    const parents = await this.getParents(signal.locationId);
    for (const parentId of parents) {
      const cascadeKey = this.signalKey(parentId, signal.type, signal.sourceAntId + ':cascade');
      const cascadeStrength = strength * this.config.cascadeRatio;
      const cascadeTtl = Math.max(Math.ceil(this.config.signalTtlSeconds * cascadeStrength), 10);

      pipeline.hset(cascadeKey, {
        type: signal.type,
        strength: cascadeStrength.toString(),
        sourceAntId: signal.sourceAntId,
        sourceColony: signal.sourceColony + ':cascade',
        depositedAt: signal.timestamp.toString(),
      });
      pipeline.expire(cascadeKey, cascadeTtl);
      pipeline.sadd(this.locationsSetKey(), parentId);
    }

    await pipeline.exec();
    this.totalDeposits++;

    // Pub/Sub event for visualization
    if (this.pubRedis) {
      this.pubRedis.publish(`${this.config.keyPrefix}:events`, JSON.stringify({
        event: 'deposit',
        locationId: signal.locationId,
        type: signal.type,
        strength,
        sourceAntId: signal.sourceAntId,
        timestamp: signal.timestamp,
      })).catch(() => {}); // fire and forget
    }
  }

  // ─── READ ─────────────────────────────────────

  async read(locationId: string): Promise<LocationSnapshot> {
    const now = Date.now();
    const pattern = this.locationSignalPattern(locationId);

    // SCAN for all signals at this location
    const keys = await this.scanKeys(pattern);

    if (keys.length === 0) {
      return {
        locationId,
        signals: [],
        totalConcentration: 0,
        signalDiversity: 0,
        timestamp: now,
      };
    }

    // Read all signal data
    const pipeline = this.redis.pipeline();
    for (const key of keys) {
      pipeline.hgetall(key);
    }
    const results = await pipeline.exec();

    // Aggregate by type
    const byType = new Map<PheromoneType, { totalStrength: number; count: number; peakAge: number }>();

    for (const result of results || []) {
      if (!result || result[0] || !result[1]) continue;
      const data = result[1] as Record<string, string>;
      if (!data.type || !data.strength) continue;

      const type = data.type as PheromoneType;
      const strength = parseFloat(data.strength);
      const depositedAt = parseInt(data.depositedAt || '0');
      const age = now - depositedAt;

      // Apply time-based decay (Redis TTL handles removal, but we decay strength for reads)
      const ttlFraction = age / (this.config.signalTtlSeconds * 1000);
      const decayedStrength = strength * Math.pow(0.5, ttlFraction);

      if (decayedStrength < 0.01) continue;

      const existing = byType.get(type);
      if (existing) {
        existing.totalStrength += decayedStrength;
        existing.count++;
        existing.peakAge = Math.min(existing.peakAge, age);
      } else {
        byType.set(type, { totalStrength: decayedStrength, count: 1, peakAge: age });
      }
    }

    const signals: PheromoneReading[] = [];
    let totalConcentration = 0;

    for (const [type, data] of byType) {
      signals.push({
        type,
        strength: Math.min(1.0, data.totalStrength),
        contributorCount: data.count,
        peakAge: data.peakAge,
      });
      totalConcentration += data.totalStrength;
    }

    return {
      locationId,
      signals,
      totalConcentration,
      signalDiversity: signals.length,
      timestamp: now,
    };
  }

  async readType(locationId: string, type: PheromoneType): Promise<PheromoneReading | null> {
    const snapshot = await this.read(locationId);
    return snapshot.signals.find(s => s.type === type) ?? null;
  }

  // ─── CONCENTRATION ────────────────────────────

  async concentration(locationId: string): Promise<number> {
    const snapshot = await this.read(locationId);
    return snapshot.totalConcentration;
  }

  // ─── HOTSPOTS ─────────────────────────────────

  async hotspots(threshold: number): Promise<LocationSnapshot[]> {
    const allLocations = await this.redis.smembers(this.locationsSetKey());
    const results: LocationSnapshot[] = [];

    // Read all locations in parallel
    const snapshots = await Promise.all(allLocations.map(loc => this.read(loc)));

    for (const snap of snapshots) {
      if (snap.totalConcentration >= threshold) {
        results.push(snap);
      }
    }

    results.sort((a, b) => b.totalConcentration - a.totalConcentration);
    return results;
  }

  // ─── LOCATION MANAGEMENT ──────────────────────

  async registerLocation(location: Location): Promise<void> {
    const key = this.locationKey(location.id);
    await this.redis.hset(key, {
      id: location.id,
      type: location.type,
      parents: JSON.stringify(location.parents),
    });
    await this.redis.sadd(this.locationsSetKey(), location.id);
  }

  async getParents(locationId: string): Promise<string[]> {
    const key = this.locationKey(locationId);
    const parentsJson = await this.redis.hget(key, 'parents');
    if (!parentsJson) return [];
    try {
      return JSON.parse(parentsJson);
    } catch {
      return [];
    }
  }

  // ─── DECAY ────────────────────────────────────

  /**
   * In Redis mode, decay is handled by TTL — signals auto-expire.
   * This method is a no-op but exists for interface compatibility.
   * Returns 0 (Redis handles removal automatically).
   */
  async decay(): Promise<number> {
    // Redis TTL handles decay natively. Nothing to do.
    return 0;
  }

  // ─── SNAPSHOT ─────────────────────────────────

  async snapshot(): Promise<Map<string, LocationSnapshot>> {
    const allLocations = await this.redis.smembers(this.locationsSetKey());
    const result = new Map<string, LocationSnapshot>();

    const snapshots = await Promise.all(allLocations.map(loc => this.read(loc)));
    for (const snap of snapshots) {
      result.set(snap.locationId, snap);
    }

    return result;
  }

  // ─── LOCATION IDS ──────────────────────────────

  async getLocationIds(): Promise<string[]> {
    return await this.redis.smembers(this.locationsSetKey());
  }

  // ─── SCAN HELPER ──────────────────────────────

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, batch] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    return keys;
  }

  // ─── STATS ────────────────────────────────────

  async getStats(): Promise<{
    locations: number;
    totalDeposits: number;
    activeSignals: number;
  }> {
    const locations = await this.redis.scard(this.locationsSetKey());
    // Count all signal keys
    const signalKeys = await this.scanKeys(`${this.config.keyPrefix}:sig:*`);

    return {
      locations,
      totalDeposits: this.totalDeposits,
      activeSignals: signalKeys.length,
    };
  }

  // ─── PUB/SUB ──────────────────────────────────

  /**
   * Subscribe to pheromone space events (for visualization).
   * Returns a cleanup function.
   */
  async subscribe(callback: (event: any) => void): Promise<() => void> {
    const subRedis = new Redis(this.config.redisUrl);
    const channel = `${this.config.keyPrefix}:events`;

    subRedis.subscribe(channel);
    subRedis.on('message', (_ch: string, message: string) => {
      try {
        callback(JSON.parse(message));
      } catch {}
    });

    return () => {
      subRedis.unsubscribe(channel);
      subRedis.disconnect();
    };
  }

  // ─── LIFECYCLE ────────────────────────────────

  async disconnect(): Promise<void> {
    this.redis.disconnect();
    if (this.pubRedis) this.pubRedis.disconnect();
  }

  async flush(): Promise<void> {
    const keys = await this.scanKeys(`${this.config.keyPrefix}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
