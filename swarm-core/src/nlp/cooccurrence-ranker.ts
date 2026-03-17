import { EvidenceItem } from '../adaptive-types';
import { normalizeTopic } from './topic-normalizer';

export function rankCooccurringTopics(target: string, evidence: EvidenceItem[], limit: number = 6): string[] {
  const canonical = normalizeTopic(target);
  if (!canonical) return [];
  const scores = new Map<string, number>();

  for (const item of evidence) {
    const phrases = [...item.entities, ...item.phrases].map(normalizeTopic).filter(Boolean);
    if (!phrases.includes(canonical)) continue;
    for (const phrase of phrases) {
      if (phrase === canonical) continue;
      scores.set(phrase, (scores.get(phrase) || 0) + item.confidence + item.relevanceScore);
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic]) => topic);
}
