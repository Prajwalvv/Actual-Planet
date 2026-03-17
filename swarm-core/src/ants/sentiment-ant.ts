/**
 * SENTIMENT ANT — Watches social/news sentiment for one entity
 * 
 * Deposits: fear, hype, confusion, silence
 * 
 * The crowd doesn't know what it knows.
 * But the pheromone space does.
 * 
 * Rules:
 * 1. Negative sentiment spike → deposit FEAR
 * 2. Positive sentiment spike → deposit HYPE
 * 3. Mixed/conflicting signals → deposit CONFUSION
 * 4. Sudden drop in mentions → deposit SILENCE
 * 5. Amplification
 */

import { AntRule, PheromoneType, SensorReading, LocationSnapshot } from '../types';

const THRESHOLDS = {
  FEAR_SCORE: -0.3,          // Sentiment score below -0.3 (range: -1 to 1)
  HYPE_SCORE: 0.3,           // Sentiment score above 0.3
  CONFUSION_VARIANCE: 0.5,   // High variance in sentiment = confusion
  SILENCE_RATIO: 0.2,        // Mention count < 20% of average = silence
  AMPLIFICATION_CONC: 3.0,
};

export function createSentimentRules(_locationId: string): AntRule[] {
  return [
    // RULE 1: Fear — negative sentiment wave
    {
      name: 'fear_detector',
      evaluate: (input: SensorReading, _nearby: LocationSnapshot) => {
        const sentimentScore = input.value; // -1 to 1 scale
        if (sentimentScore < THRESHOLDS.FEAR_SCORE) {
          return {
            type: PheromoneType.FEAR,
            locationId: '',
            strength: Math.min(1.0, Math.abs(sentimentScore)),
            sourceAntId: '',
            sourceColony: '',
            timestamp: 0,
          };
        }
        return null;
      },
    },

    // RULE 2: Hype — positive sentiment wave
    {
      name: 'hype_detector',
      evaluate: (input: SensorReading, _nearby: LocationSnapshot) => {
        const sentimentScore = input.value;
        if (sentimentScore > THRESHOLDS.HYPE_SCORE) {
          return {
            type: PheromoneType.HYPE,
            locationId: '',
            strength: Math.min(1.0, sentimentScore),
            sourceAntId: '',
            sourceColony: '',
            timestamp: 0,
          };
        }
        return null;
      },
    },

    // RULE 3: Confusion — conflicting signals (high variance)
    {
      name: 'confusion_detector',
      evaluate: (input: SensorReading, _nearby: LocationSnapshot) => {
        const variance = input.metadata.sentimentVariance ?? 0;
        if (variance > THRESHOLDS.CONFUSION_VARIANCE) {
          return {
            type: PheromoneType.CONFUSION,
            locationId: '',
            strength: Math.min(1.0, variance),
            sourceAntId: '',
            sourceColony: '',
            timestamp: 0,
          };
        }
        return null;
      },
    },

    // RULE 4: Silence — the crowd goes quiet (often precedes big moves)
    {
      name: 'silence_detector',
      evaluate: (input: SensorReading, _nearby: LocationSnapshot) => {
        const mentionRatio = input.metadata.mentionRatio ?? 1.0;
        if (mentionRatio < THRESHOLDS.SILENCE_RATIO) {
          return {
            type: PheromoneType.SILENCE,
            locationId: '',
            strength: Math.min(1.0, (1.0 - mentionRatio) / 0.8),
            sourceAntId: '',
            sourceColony: '',
            timestamp: 0,
          };
        }
        return null;
      },
    },

    // RULE 5: AMPLIFICATION
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
