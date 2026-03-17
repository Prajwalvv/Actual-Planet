import { CoverageBreakdown, EvidenceItem, QueryPolicyEvent, SourceCoverage, TopicAggregate } from '../adaptive-types';
import { normalizeTopic } from '../nlp/topic-normalizer';

interface OverlayTopicState {
  topic: string;
  normalizedTopic: string;
  mentions: number;
  evidenceIds: Set<string>;
  sourceDomains: Set<string>;
  terrains: Set<string>;
  totalConfidence: number;
  totalFreshness: number;
  totalSentiment: number;
  phrases: Set<string>;
  firstSeenAt: number;
  lastSeenAt: number;
}

export class QueryOverlayMemory {
  readonly id: string;
  private evidence = new Map<string, EvidenceItem>();
  private policyEvents: QueryPolicyEvent[] = [];
  private topics = new Map<string, OverlayTopicState>();
  private providerHits = new Map<string, number>();
  private terrainHits = new Map<string, number>();
  private firstEvidenceAt: number | null = null;
  private promotedCount = 0;

  constructor(id: string) {
    this.id = id;
  }

  addPolicyEvent(event: QueryPolicyEvent): void {
    this.policyEvents.push(event);
  }

  addEvidence(item: EvidenceItem): void {
    if (this.evidence.has(item.id)) return;
    this.evidence.set(item.id, item);
    if (!this.firstEvidenceAt) this.firstEvidenceAt = item.fetchedAt;
    const providerId = String(item.metadata?.sourceProviderId || 'unknown');
    this.providerHits.set(providerId, (this.providerHits.get(providerId) || 0) + 1);
    this.terrainHits.set(item.terrain, (this.terrainHits.get(item.terrain) || 0) + 1);

    for (const raw of [...item.entities, ...item.phrases]) {
      const normalized = normalizeTopic(raw);
      if (!normalized || normalized.length < 2) continue;
      const existing = this.topics.get(normalized) || {
        topic: raw,
        normalizedTopic: normalized,
        mentions: 0,
        evidenceIds: new Set<string>(),
        sourceDomains: new Set<string>(),
        terrains: new Set<string>(),
        totalConfidence: 0,
        totalFreshness: 0,
        totalSentiment: 0,
        phrases: new Set<string>(),
        firstSeenAt: item.fetchedAt,
        lastSeenAt: item.fetchedAt,
      };
      existing.topic = existing.topic.length >= raw.length ? existing.topic : raw;
      existing.mentions += 1;
      existing.evidenceIds.add(item.id);
      existing.sourceDomains.add(item.domain);
      existing.terrains.add(item.terrain);
      existing.totalConfidence += item.confidence;
      existing.totalFreshness += item.freshnessScore;
      existing.totalSentiment += item.sentimentScore;
      existing.phrases.add(raw);
      existing.lastSeenAt = Math.max(existing.lastSeenAt, item.fetchedAt);
      this.topics.set(normalized, existing);
    }
  }

  markPromoted(count: number): void {
    this.promotedCount += count;
  }

  getFirstEvidenceAt(): number | null {
    return this.firstEvidenceAt;
  }

  getEvidence(): EvidenceItem[] {
    return [...this.evidence.values()];
  }

  getPolicyEvents(): QueryPolicyEvent[] {
    return [...this.policyEvents];
  }

  getTopicAggregates(): TopicAggregate[] {
    return [...this.topics.values()].map((topic) => ({
      topic: topic.topic,
      normalizedTopic: topic.normalizedTopic,
      mentions: topic.mentions,
      evidenceIds: [...topic.evidenceIds],
      sourceDomains: [...topic.sourceDomains],
      terrains: [...topic.terrains] as any,
      averageConfidence: Number((topic.totalConfidence / Math.max(1, topic.evidenceIds.size)).toFixed(3)),
      averageFreshness: Number((topic.totalFreshness / Math.max(1, topic.evidenceIds.size)).toFixed(3)),
      sentimentScore: Number((topic.totalSentiment / Math.max(1, topic.evidenceIds.size)).toFixed(3)),
      corroborationScore: Number(Math.min(1, (topic.sourceDomains.size * 0.2) + (topic.evidenceIds.size * 0.1) + (topic.mentions * 0.04)).toFixed(3)),
      phrases: [...topic.phrases],
      firstSeenAt: topic.firstSeenAt,
      lastSeenAt: topic.lastSeenAt,
    }));
  }

  getSourceCoverage(): SourceCoverage {
    const blockedCount = this.policyEvents.filter((event) => event.action === 'blocked').length;
    const allowedCount = this.policyEvents.filter((event) => event.action === 'allowed').length;
    return {
      totalEvidence: this.evidence.size,
      totalDomains: new Set([...this.evidence.values()].map((item) => item.domain)).size,
      providerHits: Object.fromEntries(this.providerHits.entries()),
      terrainHits: Object.fromEntries(this.terrainHits.entries()),
      blockedCount,
      allowedCount,
      promotedTopics: this.promotedCount,
    };
  }

  computeCoverage(requested: string[]): CoverageBreakdown {
    const aggregates = this.getTopicAggregates();
    const exact = requested.filter((input) => aggregates.some((topic) => topic.normalizedTopic === normalizeTopic(input))).length;
    const relatedOnly = Math.max(0, requested.length - exact);
    const resolved = exact;
    const notFound = Math.max(0, requested.length - exact - relatedOnly);
    const usefulness = requested.length > 0 ? Number(((exact + relatedOnly * 0.5) / requested.length).toFixed(3)) : 0;
    return {
      requestedSymbols: requested.length,
      exactCount: exact,
      resolvedCount: resolved,
      relatedOnlyCount: relatedOnly,
      notFoundCount: notFound,
      coverageRatio: requested.length > 0 ? Number(((resolved + relatedOnly) / requested.length).toFixed(3)) : 0,
      usefulnessScore: usefulness,
    };
  }
}
