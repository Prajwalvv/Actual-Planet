import * as cheerio from 'cheerio';
import { randomUUID } from 'crypto';
import { EvidenceItem, TerrainType } from '../adaptive-types';
import { minePhrases } from '../nlp/phrase-miner';
import { scoreFreshness, scoreSourceQuality } from '../ranking/source-quality';

export interface ExtractorInput {
  url: string;
  html: string;
  terrain: TerrainType;
  queryTerms: string[];
  providerId: string;
  fetchedAt: number;
}

export interface TerrainAdapter {
  terrain: TerrainType | 'generic-web';
  extract(input: ExtractorInput): EvidenceItem[];
}

function parseDateCandidate(text: string): number | undefined {
  const match = text.match(/(20\d{2}-\d{2}-\d{2}|20\d{2}\/\d{2}\/\d{2}|[A-Z][a-z]{2,8}\s+\d{1,2},\s+20\d{2})/);
  if (!match) return undefined;
  const parsed = Date.parse(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sentimentScore(text: string): number {
  const lower = text.toLowerCase();
  const positive = ['growth', 'surge', 'breakthrough', 'gain', 'improve', 'strong', 'positive', 'record'];
  const negative = ['risk', 'fear', 'crisis', 'decline', 'warn', 'drop', 'negative', 'loss'];
  let score = 0;
  for (const token of positive) if (lower.includes(token)) score += 1;
  for (const token of negative) if (lower.includes(token)) score -= 1;
  return Math.max(-1, Math.min(1, score / 4));
}

function extractCommon(input: ExtractorInput): { title: string; snippet: string; phrases: string[]; entities: string[]; claims: string[]; links: string[]; publishedAt?: number; relevanceScore: number } {
  const $ = cheerio.load(input.html);
  const title = $('title').first().text().trim() || $('h1').first().text().trim();
  const snippet = $('meta[name="description"]').attr('content') || $('article p').first().text().trim() || $('p').first().text().trim();
  const bodyText = $('main, article, body').text().replace(/\s+/g, ' ').trim().slice(0, 5000);
  const phrases = minePhrases(`${title} ${snippet} ${bodyText}`, input.queryTerms, 12);
  const entities = [...new Set([
    ...phrases.filter((phrase) => phrase.split(' ').length <= 3),
    ...((title.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || []).slice(0, 6)),
  ])].slice(0, 10);
  const claims = $('h1, h2, h3, article p, p').toArray().map((el) => $(el).text().trim()).filter(Boolean).slice(0, 4);
  const links = $('a[href]').toArray().map((el) => $(el).attr('href') || '').filter((href) => /^https?:\/\//i.test(href)).slice(0, 12);
  const publishedAt = parseDateCandidate(`${$('time').first().attr('datetime') || ''} ${bodyText.slice(0, 400)}`);
  const queryLower = input.queryTerms.join(' ').toLowerCase();
  const haystack = `${title} ${snippet} ${bodyText}`.toLowerCase();
  const relevanceScore = queryLower ? Math.min(1, input.queryTerms.filter((term) => term && haystack.includes(term.toLowerCase())).length / Math.max(1, input.queryTerms.length)) : 0.45;
  return { title, snippet, phrases, entities, claims, links, publishedAt, relevanceScore: Number(relevanceScore.toFixed(3)) };
}

export function buildEvidenceItem(input: ExtractorInput, terrain: TerrainType, boost: number = 0): EvidenceItem {
  const common = extractCommon(input);
  const domain = new URL(input.url).hostname.toLowerCase();
  const sourceScore = scoreSourceQuality(domain, terrain);
  const freshnessScore = scoreFreshness(common.publishedAt, input.fetchedAt);
  const confidence = Math.max(0.2, Math.min(1, 0.35 + sourceScore * 0.3 + freshnessScore * 0.2 + common.relevanceScore * 0.25 + boost));
  return {
    id: randomUUID(),
    url: input.url,
    domain,
    terrain,
    title: common.title,
    snippet: common.snippet,
    entities: common.entities,
    phrases: common.phrases,
    claims: common.claims,
    discoveredLinks: common.links,
    feedHints: [domain],
    publishedAt: common.publishedAt,
    fetchedAt: input.fetchedAt,
    confidence: Number(confidence.toFixed(3)),
    freshnessScore,
    sourceScore,
    relevanceScore: common.relevanceScore,
    sentimentScore: sentimentScore(`${common.title} ${common.snippet} ${common.claims.join(' ')}`),
    metadata: { sourceProviderId: input.providerId },
  };
}
