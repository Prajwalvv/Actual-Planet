/**
 * MENTIONS ANT — Watches one entity's mention volume
 * 
 * Deposits: unusual_activity, dry_up, accumulation
 * 
 * Volume is the heartbeat of the market. Price lies. Volume doesn't.
 * 
 * Rules:
 * 1. Volume spike vs average → deposit UNUSUAL_ACTIVITY
 * 2. Volume drops to near-zero → deposit DRY_UP
 * 3. Steady above-average volume → deposit ACCUMULATION
 * 4. Amplification — if nearby ants are clustering, amplify
 */

import { AntRule, PheromoneType, SensorReading, LocationSnapshot } from '../types';

const THRESHOLDS = {
  SPIKE_RATIO: 2.0,           // 2x average volume = spike
  DRY_UP_RATIO: 0.3,          // < 30% of average = dry up
  ACCUMULATION_RATIO: 1.3,    // > 130% of average sustained = accumulation
  ACCUMULATION_MIN_TICKS: 3,  // metadata tracks consecutive above-average ticks
  AMPLIFICATION_CONC: 3.0,
};

export function createVolumeRules(_locationId: string): AntRule[] {
  return [
    // RULE 1: Unusual activity — volume spike
    {
      name: 'spike_detector',
      evaluate: (input: SensorReading, _nearby: LocationSnapshot) => {
        const volumeRatio = input.metadata.volumeRatio ?? 1.0;
        if (volumeRatio > THRESHOLDS.SPIKE_RATIO) {
          return {
            type: PheromoneType.UNUSUAL_ACTIVITY,
            locationId: '',
            strength: Math.min(1.0, volumeRatio / 5.0), // scales up to 5x
            sourceAntId: '',
            sourceColony: '',
            timestamp: 0,
          };
        }
        return null;
      },
    },

    // RULE 2: Dry up — volume collapse
    {
      name: 'dryup_detector',
      evaluate: (input: SensorReading, _nearby: LocationSnapshot) => {
        const volumeRatio = input.metadata.volumeRatio ?? 1.0;
        if (volumeRatio < THRESHOLDS.DRY_UP_RATIO) {
          return {
            type: PheromoneType.DRY_UP,
            locationId: '',
            strength: Math.min(1.0, (1.0 - volumeRatio) / 0.7), // stronger as ratio → 0
            sourceAntId: '',
            sourceColony: '',
            timestamp: 0,
          };
        }
        return null;
      },
    },

    // RULE 3: Accumulation — sustained above-average volume
    {
      name: 'accumulation_detector',
      evaluate: (input: SensorReading, _nearby: LocationSnapshot) => {
        const volumeRatio = input.metadata.volumeRatio ?? 1.0;
        const consecutiveAbove = input.metadata.consecutiveAboveAvg ?? 0;
        if (volumeRatio > THRESHOLDS.ACCUMULATION_RATIO && consecutiveAbove >= THRESHOLDS.ACCUMULATION_MIN_TICKS) {
          return {
            type: PheromoneType.ACCUMULATION,
            locationId: '',
            strength: Math.min(1.0, consecutiveAbove / 10.0),
            sourceAntId: '',
            sourceColony: '',
            timestamp: 0,
          };
        }
        return null;
      },
    },

    // RULE 4: AMPLIFICATION
    {
      name: 'amplifier',
      evaluate: (_input: SensorReading, nearby: LocationSnapshot) => {
        if (nearby.totalConcentration > THRESHOLDS.AMPLIFICATION_CONC) {
          return {
            type: PheromoneType.CLUSTER_DETECTED,
            locationId: '',
            strength: Math.min(0.6, nearby.totalConcentration / 10.0),
            sourceAntId: '',
            sourceColony: '',
            timestamp: 0,
          };
        }
        return null;
      },
    },
  ];
}
