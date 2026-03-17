/**
 * PROCESSOR CASTE — The Millions That Live Inside the Nest
 * 
 * Biological analog: Army Ant (300-400K neurons, BLIND, pure pheromone)
 * 
 * These ants have NO browser. NO eyes. They are 100% chemical —
 * they read the pheromone space, apply one simple rule, and deposit back.
 * That's it. ~0.01ms per tick. You can run millions of them.
 * 
 * THREE SPECIES:
 * 
 * 1. AMPLIFIER — Detects concentration, amplifies strong signals.
 *    "If nearby signals are dense, make them denser."
 *    This is the positive feedback loop that creates emergent trails.
 *    Like army ants reinforcing a bridge.
 * 
 * 2. CORRELATOR — Compares signals at TWO locations.
 *    "If entity A and entity B both have distress, deposit CONVERGENCE at their parent."
 *    This is how the swarm detects cross-entity patterns nobody programmed.
 * 
 * 3. VALIDATOR — Cross-checks signal consistency.
 *    "If price says distress but sentiment says hype, deposit CONFUSION."
 *    "If all signal types agree, deposit CLUSTER_DETECTED."
 *    This is how the swarm self-validates without any central authority.
 * 
 * Memory per ant: ~200 bytes (ID + locationId + last reading)
 * Cost per tick: ~0.01ms
 * 1 million ants = 200MB RAM, ~10 seconds of CPU per tick cycle
 */

import {
  PheromoneType,
  PheromoneDeposit,
  IPheromoneSpace,
  LocationSnapshot,
  PheromoneReading,
} from '../types';

// ─────────────────────────────────────────────
// Base Processor Ant
// ─────────────────────────────────────────────

export interface ProcessorAntConfig {
  id: string;
  locationId: string;
  /** Second location for correlators */
  locationId2?: string;
}

// ─────────────────────────────────────────────
// AMPLIFIER ANT
// ─────────────────────────────────────────────

/**
 * Amplifier: if total concentration at my location exceeds threshold,
 * deposit the strongest signal type again (amplify it).
 * 
 * This creates positive feedback: strong signals get stronger,
 * weak signals die from decay. Natural selection of patterns.
 */
export class AmplifierAnt {
  private config: ProcessorAntConfig;
  private lastConcentration: number = 0;

  /** Concentration threshold to trigger amplification */
  static THRESHOLD = 0.5;
  /** Max strength of amplified signal (prevents runaway) */
  static MAX_AMPLIFY = 0.3;
  /** Dampening factor — amplified signal is this fraction of the trigger */
  static DAMPEN = 0.15;

  constructor(config: ProcessorAntConfig) {
    this.config = config;
  }

  async tick(space: IPheromoneSpace): Promise<PheromoneDeposit | null> {
    const snapshot = await space.read(this.config.locationId);

    // Only amplify if concentration crossed threshold since last tick
    if (snapshot.totalConcentration < AmplifierAnt.THRESHOLD) {
      this.lastConcentration = snapshot.totalConcentration;
      return null;
    }

    // Find the strongest signal type (the "dominant trail")
    const strongest = this.getStrongest(snapshot.signals);
    if (!strongest) return null;

    // Amplify: deposit a fraction of the strongest signal back
    const ampStrength = Math.min(
      AmplifierAnt.MAX_AMPLIFY,
      strongest.strength * AmplifierAnt.DAMPEN,
    );

    // Only amplify if there's been a meaningful change (prevents runaway loops)
    const delta = Math.abs(snapshot.totalConcentration - this.lastConcentration);
    this.lastConcentration = snapshot.totalConcentration;

    if (delta < 0.02) return null; // No significant change — don't amplify noise

    return {
      type: strongest.type,
      locationId: this.config.locationId,
      strength: ampStrength,
      sourceAntId: this.config.id,
      sourceColony: 'amplifier',
      timestamp: Date.now(),
    };
  }

  private getStrongest(signals: PheromoneReading[]): PheromoneReading | null {
    if (signals.length === 0) return null;
    return signals.reduce((a, b) => a.strength > b.strength ? a : b);
  }

  getId(): string { return this.config.id; }
  getLocationId(): string { return this.config.locationId; }
}

// ─────────────────────────────────────────────
// CORRELATOR ANT
// ─────────────────────────────────────────────

/**
 * Correlator: compares signals at TWO locations.
 * 
 * If both locations have the same signal type active →
 *   deposit CONVERGENCE at the parent location.
 * If one has distress but the other doesn't →
 *   deposit DIVERGENCE.
 * 
 * This is how the swarm detects category-wide patterns
 * from individual entity signals. Nobody programs specific
 * rules. The correlators just compare pheromone concentrations.
 */
export class CorrelatorAnt {
  private config: ProcessorAntConfig;
  /** Parent location to deposit cross-correlations */
  private parentLocationId: string;

  static CORRELATION_THRESHOLD = 0.3;
  static DIVERGENCE_THRESHOLD = 0.4;

  constructor(config: ProcessorAntConfig, parentLocationId: string) {
    this.config = config;
    this.parentLocationId = parentLocationId;
  }

  async tick(space: IPheromoneSpace): Promise<PheromoneDeposit | null> {
    if (!this.config.locationId2) return null;

    const snap1 = await space.read(this.config.locationId);
    const snap2 = await space.read(this.config.locationId2);

    // Find signal types present in both locations
    const types1 = new Set(snap1.signals.filter(s => s.strength > 0.1).map(s => s.type));
    const types2 = new Set(snap2.signals.filter(s => s.strength > 0.1).map(s => s.type));

    const shared: PheromoneType[] = [];
    for (const t of types1) {
      if (types2.has(t)) shared.push(t);
    }

    // CONVERGENCE: both locations share signal types
    if (shared.length >= 1) {
      // Strength = average of shared signals
      let totalStrength = 0;
      for (const type of shared) {
        const s1 = snap1.signals.find(s => s.type === type)?.strength ?? 0;
        const s2 = snap2.signals.find(s => s.type === type)?.strength ?? 0;
        totalStrength += (s1 + s2) / 2;
      }
      const avgStrength = totalStrength / shared.length;

      if (avgStrength >= CorrelatorAnt.CORRELATION_THRESHOLD) {
        return {
          type: PheromoneType.CONVERGENCE,
          locationId: this.parentLocationId,
          strength: Math.min(0.5, avgStrength * 0.4),
          sourceAntId: this.config.id,
          sourceColony: 'correlator',
          timestamp: Date.now(),
        };
      }
    }

    // DIVERGENCE: one location has strong signals, the other is quiet
    const conc1 = snap1.totalConcentration;
    const conc2 = snap2.totalConcentration;
    const diff = Math.abs(conc1 - conc2);

    if (diff >= CorrelatorAnt.DIVERGENCE_THRESHOLD && (conc1 > 0.3 || conc2 > 0.3)) {
      return {
        type: PheromoneType.DIVERGENCE,
        locationId: this.parentLocationId,
        strength: Math.min(0.4, diff * 0.3),
        sourceAntId: this.config.id,
        sourceColony: 'correlator',
        timestamp: Date.now(),
      };
    }

    return null;
  }

  getId(): string { return this.config.id; }
  getLocationId(): string { return this.config.locationId; }
}

// ─────────────────────────────────────────────
// VALIDATOR ANT
// ─────────────────────────────────────────────

/**
 * Validator: checks signal consistency at one location.
 * 
 * Looks for:
 * - AGREEMENT: 3+ signal types pointing the same direction → CLUSTER_DETECTED
 * - CONTRADICTION: bearish + bullish signals co-existing → CONFUSION/ANOMALY
 * - SILENCE: location has been registered but has no signals → worth noting
 * 
 * This is the colony's immune system — detecting when the signals
 * are telling a coherent story vs. contradicting each other.
 */
export class ValidatorAnt {
  private config: ProcessorAntConfig;

  /** Bearish signal types */
  static BEARISH: Set<PheromoneType> = new Set([
    PheromoneType.DISTRESS,
    PheromoneType.FEAR,
    PheromoneType.DRY_UP,
    PheromoneType.INSIDER_EXIT,
    PheromoneType.DEAD_TRAIL,
  ]);

  /** Bullish signal types */
  static BULLISH: Set<PheromoneType> = new Set([
    PheromoneType.MOMENTUM,
    PheromoneType.HYPE,
    PheromoneType.BREAKOUT,
    PheromoneType.INSIDER_CONFIDENCE,
    PheromoneType.ACCUMULATION,
  ]);

  static CLUSTER_MIN_TYPES = 3;
  static CONTRADICTION_THRESHOLD = 0.3;

  constructor(config: ProcessorAntConfig) {
    this.config = config;
  }

  async tick(space: IPheromoneSpace): Promise<PheromoneDeposit | null> {
    const snapshot = await space.read(this.config.locationId);

    if (snapshot.signals.length === 0) return null;

    const activeSignals = snapshot.signals.filter(s => s.strength > 0.1);
    if (activeSignals.length === 0) return null;

    // Count bearish vs bullish
    let bearishStrength = 0;
    let bullishStrength = 0;
    let bearishCount = 0;
    let bullishCount = 0;

    for (const sig of activeSignals) {
      if (ValidatorAnt.BEARISH.has(sig.type)) {
        bearishStrength += sig.strength;
        bearishCount++;
      }
      if (ValidatorAnt.BULLISH.has(sig.type)) {
        bullishStrength += sig.strength;
        bullishCount++;
      }
    }

    // CONTRADICTION: both bearish and bullish are strong
    if (bearishStrength > ValidatorAnt.CONTRADICTION_THRESHOLD &&
        bullishStrength > ValidatorAnt.CONTRADICTION_THRESHOLD) {
      return {
        type: PheromoneType.CONFUSION,
        locationId: this.config.locationId,
        strength: Math.min(0.6, (bearishStrength + bullishStrength) * 0.2),
        sourceAntId: this.config.id,
        sourceColony: 'validator',
        timestamp: Date.now(),
      };
    }

    // CLUSTER: 3+ distinct signal types active and agreeing
    if (activeSignals.length >= ValidatorAnt.CLUSTER_MIN_TYPES) {
      // All bearish or all bullish = coherent story
      const allBearish = bearishCount >= 2 && bullishCount === 0;
      const allBullish = bullishCount >= 2 && bearishCount === 0;

      if (allBearish || allBullish) {
        return {
          type: PheromoneType.CLUSTER_DETECTED,
          locationId: this.config.locationId,
          strength: Math.min(0.8, snapshot.totalConcentration * 0.3),
          sourceAntId: this.config.id,
          sourceColony: 'validator',
          timestamp: Date.now(),
        };
      }
    }

    // ANOMALY: very high concentration but only one signal type (suspicious)
    if (snapshot.totalConcentration > 1.5 && snapshot.signalDiversity === 1) {
      return {
        type: PheromoneType.ANOMALY,
        locationId: this.config.locationId,
        strength: 0.3,
        sourceAntId: this.config.id,
        sourceColony: 'validator',
        timestamp: Date.now(),
      };
    }

    return null;
  }

  getId(): string { return this.config.id; }
  getLocationId(): string { return this.config.locationId; }
}

// ─────────────────────────────────────────────
// PROCESSOR COLONY — manages thousands of processor ants
// ─────────────────────────────────────────────

export interface ProcessorColonyConfig {
  /** How many amplifiers per location. Default: 5 */
  amplifiersPerLocation: number;
  /** How many validators per location. Default: 3 */
  validatorsPerLocation: number;
  /** How many correlator pairs. Default: auto (all adjacent pairs) */
  correlatorPairs?: [string, string][];
  /** Parent location for correlators. Default: 'MARKET:DISCOVERED' */
  correlatorParent: string;
}

const DEFAULT_COLONY_CONFIG: ProcessorColonyConfig = {
  amplifiersPerLocation: 5,
  validatorsPerLocation: 3,
  correlatorParent: 'MARKET:DISCOVERED',
};

export class ProcessorColony {
  private amplifiers: AmplifierAnt[] = [];
  private correlators: CorrelatorAnt[] = [];
  private validators: ValidatorAnt[] = [];
  private config: ProcessorColonyConfig;
  private space: IPheromoneSpace;
  private antCounter = 0;
  private totalTicks = 0;
  private totalDeposits = 0;

  constructor(config: Partial<ProcessorColonyConfig>, space: IPheromoneSpace) {
    this.config = { ...DEFAULT_COLONY_CONFIG, ...config };
    this.space = space;
  }

  /**
   * Populate the colony for a set of locations.
   * Call this as the swarm discovers new locations.
   */
  populate(locationIds: string[]): void {
    for (const locId of locationIds) {
      // Skip meta-locations
      if (locId.includes(':')) continue;

      // Check if we already have ants here
      const existingAmps = this.amplifiers.filter(a => a.getLocationId() === locId);
      if (existingAmps.length >= this.config.amplifiersPerLocation) continue;

      // Spawn amplifiers
      const ampsToAdd = this.config.amplifiersPerLocation - existingAmps.length;
      for (let i = 0; i < ampsToAdd; i++) {
        this.amplifiers.push(new AmplifierAnt({
          id: `amp:${locId}:${++this.antCounter}`,
          locationId: locId,
        }));
      }

      // Spawn validators
      const existingVals = this.validators.filter(v => v.getLocationId() === locId);
      const valsToAdd = this.config.validatorsPerLocation - existingVals.length;
      for (let i = 0; i < valsToAdd; i++) {
        this.validators.push(new ValidatorAnt({
          id: `val:${locId}:${++this.antCounter}`,
          locationId: locId,
        }));
      }
    }

    // Spawn correlators for all pairs
    if (this.config.correlatorPairs) {
      for (const [loc1, loc2] of this.config.correlatorPairs) {
        const existing = this.correlators.find(c =>
          c.getId().includes(loc1) && c.getId().includes(loc2));
        if (!existing) {
          this.correlators.push(new CorrelatorAnt(
            {
              id: `cor:${loc1}:${loc2}:${++this.antCounter}`,
              locationId: loc1,
              locationId2: loc2,
            },
            this.config.correlatorParent,
          ));
        }
      }
    } else {
      // Auto-generate pairs from first N locations (limit to prevent combinatorial explosion)
      const entityLocations = locationIds.filter(l => !l.includes(':')).slice(0, 20);
      for (let i = 0; i < entityLocations.length; i++) {
        for (let j = i + 1; j < entityLocations.length; j++) {
          const loc1 = entityLocations[i];
          const loc2 = entityLocations[j];
          const existingId = `cor:${loc1}:${loc2}`;
          if (!this.correlators.find(c => c.getId().startsWith(existingId))) {
            this.correlators.push(new CorrelatorAnt(
              {
                id: `${existingId}:${++this.antCounter}`,
                locationId: loc1,
                locationId2: loc2,
              },
              this.config.correlatorParent,
            ));
          }
        }
      }
    }
  }

  /**
   * Run ONE tick for all processor ants.
   * Returns the number of deposits made.
   */
  async tick(): Promise<{ deposits: number; amplified: number; correlated: number; validated: number }> {
    let amplified = 0;
    let correlated = 0;
    let validated = 0;

    // Amplifiers
    const ampResults = await Promise.all(this.amplifiers.map(a => a.tick(this.space)));
    for (const deposit of ampResults) {
      if (deposit) {
        await this.space.deposit(deposit);
        amplified++;
      }
    }

    // Correlators
    const corResults = await Promise.all(this.correlators.map(c => c.tick(this.space)));
    for (const deposit of corResults) {
      if (deposit) {
        await this.space.deposit(deposit);
        correlated++;
      }
    }

    // Validators
    const valResults = await Promise.all(this.validators.map(v => v.tick(this.space)));
    for (const deposit of valResults) {
      if (deposit) {
        await this.space.deposit(deposit);
        validated++;
      }
    }

    const deposits = amplified + correlated + validated;
    this.totalDeposits += deposits;
    this.totalTicks++;

    return { deposits, amplified, correlated, validated };
  }

  getStats(): {
    amplifiers: number;
    correlators: number;
    validators: number;
    totalAnts: number;
    totalTicks: number;
    totalDeposits: number;
  } {
    return {
      amplifiers: this.amplifiers.length,
      correlators: this.correlators.length,
      validators: this.validators.length,
      totalAnts: this.amplifiers.length + this.correlators.length + this.validators.length,
      totalTicks: this.totalTicks,
      totalDeposits: this.totalDeposits,
    };
  }
}
