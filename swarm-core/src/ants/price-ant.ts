/**
 * ACTIVITY ANT — Watches one entity's activity level
 * 
 * Deposits: momentum, distress, breakout, flatline
 * 
 * Rules:
 * 1. Large price drop → deposit DISTRESS
 * 2. Large price rise → deposit MOMENTUM  
 * 3. Price breaks out of recent range → deposit BREAKOUT
 * 4. Price flatlines (near-zero change) → deposit FLATLINE
 * 5. Amplification — if nearby ants are signaling, amplify
 */

import { AntRule, PheromoneType, SensorReading, LocationSnapshot } from '../types';

const THRESHOLDS = {
  DISTRESS_DROP: -0.02,       // -2% price change
  MOMENTUM_RISE: 0.02,        // +2% price change
  BREAKOUT_MAGNITUDE: 0.05,   // 5% move = breakout
  FLATLINE_RANGE: 0.002,      // < 0.2% change = flatline
  AMPLIFICATION_CONC: 3.0,    // Nearby concentration threshold to amplify (raised to dampen runaway feedback)
};

export function createPriceRules(_locationId: string): AntRule[] {
  return [
    // RULE 1: Distress — sharp price drop
    {
      name: 'distress_detector',
      evaluate: (input: SensorReading, _nearby: LocationSnapshot) => {
        if (input.change < THRESHOLDS.DISTRESS_DROP) {
          return {
            type: PheromoneType.DISTRESS,
            locationId: '',  // stamped by ant runtime
            strength: Math.min(1.0, Math.abs(input.change) / 0.10), // scales up to 10% drop
            sourceAntId: '',
            sourceColony: '',
            timestamp: 0,
          };
        }
        return null;
      },
    },

    // RULE 2: Momentum — strong price rise
    {
      name: 'momentum_detector',
      evaluate: (input: SensorReading, _nearby: LocationSnapshot) => {
        if (input.change > THRESHOLDS.MOMENTUM_RISE) {
          return {
            type: PheromoneType.MOMENTUM,
            locationId: '',
            strength: Math.min(1.0, input.change / 0.10),
            sourceAntId: '',
            sourceColony: '',
            timestamp: 0,
          };
        }
        return null;
      },
    },

    // RULE 3: Breakout — unusually large move in either direction
    {
      name: 'breakout_detector',
      evaluate: (input: SensorReading, _nearby: LocationSnapshot) => {
        if (Math.abs(input.change) > THRESHOLDS.BREAKOUT_MAGNITUDE) {
          return {
            type: PheromoneType.BREAKOUT,
            locationId: '',
            strength: Math.min(1.0, Math.abs(input.change) / 0.15),
            sourceAntId: '',
            sourceColony: '',
            timestamp: 0,
          };
        }
        return null;
      },
    },

    // RULE 4: Flatline — suspiciously quiet
    {
      name: 'flatline_detector',
      evaluate: (input: SensorReading, _nearby: LocationSnapshot) => {
        if (Math.abs(input.change) < THRESHOLDS.FLATLINE_RANGE) {
          return {
            type: PheromoneType.FLATLINE,
            locationId: '',
            strength: 0.3, // low but present — absence is notable
            sourceAntId: '',
            sourceColony: '',
            timestamp: 0,
          };
        }
        return null;
      },
    },

    // RULE 5: AMPLIFICATION — the critical positive feedback loop
    // If nearby ants are signaling heavily, this ant signals stronger
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
