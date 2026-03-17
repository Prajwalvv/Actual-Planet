/**
 * PHEROMONE SPACE — The Shared Environment
 * 
 * This is where intelligence lives. Not in any ant.
 * In the space between them.
 * 
 * Three properties make this work:
 * 1. DECAY — signals evaporate over time. Self-cleaning. Only active patterns survive.
 * 2. ACCUMULATION — multiple signals at one location stack. Density = pattern.
 * 3. SPATIAL RELATIONSHIPS — locations have parents. Cascades emerge naturally.
 * 
 * In-memory implementation. Redis-isomorphic — same interface, swap later.
 */

import {
  IPheromoneSpace,
  PheromoneDeposit,
  PheromoneReading,
  PheromoneType,
  LocationSnapshot,
  Location,
} from './types';

// ─────────────────────────────────────────────
// Internal storage types
// ─────────────────────────────────────────────

interface StoredSignal {
  type: PheromoneType;
  strength: number;
  sourceAntId: string;
  sourceColony: string;
  depositedAt: number;
}

interface LocationEntry {
  location: Location;
  signals: StoredSignal[];
}

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────

export interface PheromoneSpaceConfig {
  /** Half-life of pheromone signals in ms. After this time, strength halves. Default: 5 minutes. */
  decayHalfLifeMs: number;
  /** Minimum signal strength before it's removed entirely. Default: 0.01 */
  evaporationThreshold: number;
  /** How much parent locations receive from child deposits (0-1). Default: 0.3 */
  cascadeRatio: number;
  /** Maximum signals stored per location before oldest are pruned. Default: 1000 */
  maxSignalsPerLocation: number;
}

const DEFAULT_CONFIG: PheromoneSpaceConfig = {
  decayHalfLifeMs: 5 * 60 * 1000,       // 5 minutes
  evaporationThreshold: 0.01,
  cascadeRatio: 0.3,
  maxSignalsPerLocation: 1000,
};

// ─────────────────────────────────────────────
// The Space
// ─────────────────────────────────────────────

export class PheromoneSpace implements IPheromoneSpace {
  private locations: Map<string, LocationEntry> = new Map();
  private config: PheromoneSpaceConfig;
  private totalDeposits: number = 0;
  private totalDecayed: number = 0;

  constructor(config: Partial<PheromoneSpaceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── DEPOSIT ────────────────────────────────

  async deposit(signal: PheromoneDeposit): Promise<void> {
    const clampedStrength = Math.max(0, Math.min(1, signal.strength));

    // Deposit at the target location
    this.depositInternal(signal.locationId, {
      type: signal.type,
      strength: clampedStrength,
      sourceAntId: signal.sourceAntId,
      sourceColony: signal.sourceColony,
      depositedAt: signal.timestamp,
    });

    // CASCADE: propagate a fraction to parent locations
    const parents = await this.getParents(signal.locationId);
    for (const parentId of parents) {
      this.depositInternal(parentId, {
        type: signal.type,
        strength: clampedStrength * this.config.cascadeRatio,
        sourceAntId: signal.sourceAntId,
        sourceColony: signal.sourceColony + ':cascade',
        depositedAt: signal.timestamp,
      });
    }

    this.totalDeposits++;
  }

  private depositInternal(locationId: string, signal: StoredSignal): void {
    let entry = this.locations.get(locationId);
    if (!entry) {
      // Auto-register location if not registered
      entry = {
        location: { id: locationId, type: 'entity', parents: [] },
        signals: [],
      };
      this.locations.set(locationId, entry);
    }

    entry.signals.push(signal);

    // Prune if over limit — remove oldest
    if (entry.signals.length > this.config.maxSignalsPerLocation) {
      entry.signals = entry.signals.slice(-this.config.maxSignalsPerLocation);
    }
  }

  // ─── READ ───────────────────────────────────

  async read(locationId: string): Promise<LocationSnapshot> {
    const entry = this.locations.get(locationId);
    const now = Date.now();

    if (!entry || entry.signals.length === 0) {
      return {
        locationId,
        signals: [],
        totalConcentration: 0,
        signalDiversity: 0,
        timestamp: now,
      };
    }

    // Group signals by type, apply decay, aggregate
    const byType = new Map<PheromoneType, { totalStrength: number; count: number; peakAge: number }>();

    for (const sig of entry.signals) {
      const decayed = this.decayStrength(sig.strength, now - sig.depositedAt);
      if (decayed < this.config.evaporationThreshold) continue;

      const existing = byType.get(sig.type);
      const age = now - sig.depositedAt;

      if (existing) {
        existing.totalStrength += decayed;
        existing.count++;
        existing.peakAge = Math.min(existing.peakAge, age); // freshest strong signal
      } else {
        byType.set(sig.type, { totalStrength: decayed, count: 1, peakAge: age });
      }
    }

    const signals: PheromoneReading[] = [];
    let totalConcentration = 0;

    for (const [type, data] of byType) {
      // Cap accumulated strength at 1.0 per type for readings, but allow raw total for concentration
      const reading: PheromoneReading = {
        type,
        strength: Math.min(1.0, data.totalStrength),
        contributorCount: data.count,
        peakAge: data.peakAge,
      };
      signals.push(reading);
      totalConcentration += data.totalStrength; // raw, uncapped — concentration CAN exceed 1.0
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

  // ─── CONCENTRATION ──────────────────────────

  async concentration(locationId: string): Promise<number> {
    const snapshot = await this.read(locationId);
    return snapshot.totalConcentration;
  }

  // ─── HOTSPOTS ───────────────────────────────

  async hotspots(threshold: number): Promise<LocationSnapshot[]> {
    const results: LocationSnapshot[] = [];

    for (const [locationId] of this.locations) {
      const snapshot = await this.read(locationId);
      if (snapshot.totalConcentration >= threshold) {
        results.push(snapshot);
      }
    }

    // Sort by concentration descending
    results.sort((a, b) => b.totalConcentration - a.totalConcentration);
    return results;
  }

  // ─── LOCATION MANAGEMENT ────────────────────

  async registerLocation(location: Location): Promise<void> {
    const existing = this.locations.get(location.id);
    if (existing) {
      existing.location = location;
    } else {
      this.locations.set(location.id, { location, signals: [] });
    }
  }

  async getParents(locationId: string): Promise<string[]> {
    const entry = this.locations.get(locationId);
    return entry?.location.parents ?? [];
  }

  // ─── DECAY ──────────────────────────────────

  /**
   * Run decay pass across the entire space.
   * Removes signals that have evaporated below threshold.
   * Returns number of signals removed.
   */
  async decay(): Promise<number> {
    const now = Date.now();
    let removed = 0;

    for (const [, entry] of this.locations) {
      const before = entry.signals.length;
      entry.signals = entry.signals.filter(sig => {
        const decayed = this.decayStrength(sig.strength, now - sig.depositedAt);
        return decayed >= this.config.evaporationThreshold;
      });
      removed += before - entry.signals.length;
    }

    this.totalDecayed += removed;
    return removed;
  }

  /**
   * Exponential decay — mirrors biological pheromone evaporation.
   * strength * (0.5 ^ (elapsed / halfLife))
   */
  private decayStrength(originalStrength: number, elapsedMs: number): number {
    return originalStrength * Math.pow(0.5, elapsedMs / this.config.decayHalfLifeMs);
  }

  // ─── LOCATION IDS ──────────────────────────

  async getLocationIds(): Promise<string[]> {
    return [...this.locations.keys()];
  }

  // ─── SNAPSHOT ───────────────────────────────

  async snapshot(): Promise<Map<string, LocationSnapshot>> {
    const result = new Map<string, LocationSnapshot>();
    for (const [locationId] of this.locations) {
      result.set(locationId, await this.read(locationId));
    }
    return result;
  }

  // ─── STATS ──────────────────────────────────

  getStats(): { locations: number; totalDeposits: number; totalDecayed: number; activeSignals: number } {
    let activeSignals = 0;
    for (const [, entry] of this.locations) {
      activeSignals += entry.signals.length;
    }
    return {
      locations: this.locations.size,
      totalDeposits: this.totalDeposits,
      totalDecayed: this.totalDecayed,
      activeSignals,
    };
  }
}
