import { PheromoneType } from '../types';
import { QueryOverlayMemory } from './query-overlay';
import { TopicPromotionDecision } from '../adaptive-types';

export function buildPromotionDecisions(overlay: QueryOverlayMemory): TopicPromotionDecision[] {
  return overlay.getTopicAggregates().map((topic) => {
    const corroborationScore = Number(Math.min(1, topic.corroborationScore).toFixed(3));
    const promote = topic.sourceDomains.length >= 2 && topic.evidenceIds.length >= 2 && corroborationScore >= 0.65;
    const signals: Array<{ type: PheromoneType; strength: number }> = [
      { type: PheromoneType.TRAIL, strength: Math.min(1, 0.3 + topic.mentions * 0.05) },
      { type: PheromoneType.INTEREST, strength: Math.min(1, 0.2 + topic.evidenceIds.length * 0.08) },
    ];

    if (promote) {
      signals.push({ type: PheromoneType.VERIFIED, strength: Math.min(1, corroborationScore) });
      if (topic.sentimentScore > 0.18) signals.push({ type: PheromoneType.HYPE, strength: Math.min(1, 0.25 + topic.sentimentScore) });
      if (topic.sentimentScore < -0.18) signals.push({ type: PheromoneType.FEAR, strength: Math.min(1, 0.25 + Math.abs(topic.sentimentScore)) });
      if (topic.averageFreshness > 0.75 && topic.mentions >= 3) signals.push({ type: PheromoneType.MOMENTUM, strength: Math.min(1, 0.3 + topic.averageFreshness * 0.4) });
    }

    return {
      target: topic.topic,
      promote,
      reason: promote ? 'cross_domain_corroborated' : 'insufficient_corroboration',
      corroborationScore,
      sourceDomains: topic.sourceDomains,
      signals,
    };
  });
}
