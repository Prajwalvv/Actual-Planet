import { TerrainType } from '../adaptive-types';

export function scoreSourceQuality(domain: string, terrain: TerrainType): number {
  const lower = domain.toLowerCase();
  let score = 0.45;
  if (/(wikipedia|reuters|apnews|bbc|nytimes|ft|wsj|theverge|techcrunch|arxiv|acm|ieee|github|docs)/.test(lower)) score += 0.22;
  if (/(reddit|news.ycombinator|hn\.algolia)/.test(lower)) score += 0.12;
  if (/(gov|edu)$/.test(lower)) score += 0.18;
  if (terrain === 'academic' || terrain === 'docs') score += 0.06;
  return Math.max(0.05, Math.min(1, Number(score.toFixed(3))));
}

export function scoreFreshness(publishedAt?: number, fetchedAt?: number): number {
  const ref = publishedAt || fetchedAt || Date.now();
  const ageHours = Math.max(0, (Date.now() - ref) / (1000 * 60 * 60));
  if (ageHours <= 6) return 1;
  if (ageHours <= 24) return 0.88;
  if (ageHours <= 72) return 0.72;
  if (ageHours <= 168) return 0.58;
  return 0.38;
}
