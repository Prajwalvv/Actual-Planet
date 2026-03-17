import { EvidenceItem, TopicAggregate, TopicResolution } from '../adaptive-types';
import { rankCooccurringTopics } from '../nlp/cooccurrence-ranker';
import { normalizeTopic } from '../nlp/topic-normalizer';
import { suppressNoisyTopics } from '../ranking/noise-suppressor';

function pickBestTopicMatch(input: string, topics: TopicAggregate[]): TopicAggregate | null {
  const normalized = normalizeTopic(input);
  if (!normalized) return null;

  const exact = topics.find((topic) => topic.normalizedTopic === normalized);
  if (exact) return exact;

  const phrase = topics.find((topic) => topic.normalizedTopic.includes(normalized) || normalized.includes(topic.normalizedTopic));
  if (phrase) return phrase;

  const tokenSet = new Set(normalized.split(' '));
  let best: { topic: TopicAggregate; score: number } | null = null;
  for (const topic of topics) {
    const tokens = new Set(topic.normalizedTopic.split(' '));
    let overlap = 0;
    for (const token of tokenSet) if (tokens.has(token)) overlap += 1;
    const union = new Set([...tokenSet, ...tokens]).size || 1;
    const score = overlap / union;
    if (score > 0.25 && (!best || score > best.score)) best = { topic, score };
  }
  return best?.topic || null;
}

export function resolveTopics(inputs: string[], topics: TopicAggregate[], evidence: EvidenceItem[]): TopicResolution[] {
  const filteredTopics = suppressNoisyTopics(topics).sort((a, b) => b.corroborationScore - a.corroborationScore || b.mentions - a.mentions);

  return inputs.map((input) => {
    const normalized = normalizeTopic(input);
    const match = pickBestTopicMatch(input, filteredTopics);
    if (!match) {
      return {
        input,
        normalized,
        status: 'not_found',
        confidence: 0,
        evidenceIds: [],
        alternatives: filteredTopics.slice(0, 5).map((topic) => topic.topic),
        nextActions: ['Increase timeout or narrow the query terms.', 'Try explicit domain or terrain hints.'],
        summary: `No corroborated public-web evidence found for "${input}" in the current query window.`,
      };
    }

    let status: TopicResolution['status'] = 'fuzzy_match';
    if (match.normalizedTopic === normalized) status = 'exact';
    else if (match.normalizedTopic.includes(normalized) || normalized.includes(match.normalizedTopic)) status = 'phrase_match';
    else if (match.corroborationScore >= 0.45) status = 'related_only';

    const related = rankCooccurringTopics(match.topic, evidence, 6).filter((topic) => topic !== match.normalizedTopic);
    const confidence = Math.min(0.98, Math.max(0.22, match.corroborationScore * 0.55 + match.averageConfidence * 0.45));

    return {
      input,
      normalized,
      status,
      matchedTopic: match.topic,
      confidence: Number(confidence.toFixed(3)),
      evidenceIds: match.evidenceIds,
      alternatives: related.slice(0, 5),
      nextActions: ['Follow matchedTopic directly for deeper evidence.', 'Inspect returned evidence URLs before acting.'],
      summary: `${match.topic} appears across ${match.sourceDomains.length} domains and ${match.evidenceIds.length} evidence items.`,
    };
  });
}
