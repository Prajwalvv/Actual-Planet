import { TerrainType } from '../adaptive-types';

const BLOCKED_PATH = /(login|signup|register|auth|account|cart|checkout|wp-admin|admin|session|oauth|signin)/i;
const BLOCKED_PROTOCOL = /^(mailto:|tel:|javascript:)/i;
const BINARY_EXT = /\.(?:pdf|zip|gz|rar|7z|png|jpe?g|gif|svg|webp|mp4|mp3|avi|mov|dmg|exe|bin)(?:$|\?)/i;

export function normalizeUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    const params = new URLSearchParams(parsed.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid', 'gclid'].forEach((k) => params.delete(k));
    parsed.search = params.toString() ? `?${params.toString()}` : '';
    if (parsed.pathname.endsWith('/')) parsed.pathname = parsed.pathname.slice(0, -1) || '/';
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isBlockedUrl(raw: string): string | null {
  if (!raw) return 'empty_url';
  if (BLOCKED_PROTOCOL.test(raw)) return 'blocked_protocol';
  const normalized = normalizeUrl(raw);
  if (!normalized) return 'invalid_url';
  if (BINARY_EXT.test(normalized)) return 'binary_asset';
  try {
    const parsed = new URL(normalized);
    if (!/^https?:$/.test(parsed.protocol)) return 'unsupported_protocol';
    if (BLOCKED_PATH.test(parsed.pathname)) return 'blocked_path';
    return null;
  } catch {
    return 'invalid_url';
  }
}

export function hostnameOf(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function guessTerrainFromUrl(url: string): TerrainType {
  const lower = url.toLowerCase();
  if (/(reddit|hn\.algolia|forum|thread|discussion|community)/.test(lower)) return 'forum';
  if (/(arxiv|paper|journal|proceedings|cvpr|neurips|icml|acm|ieee|doi)/.test(lower)) return 'academic';
  if (/(docs|documentation|developer|api|release|changelog|github\.com\/.+\/(issues|releases))/.test(lower)) return 'docs';
  if (/(news|article|press|reuters|bbc|nytimes|theverge|techcrunch|substack)/.test(lower)) return 'news';
  if (/(investor|company|corp|inc|about|pressroom)/.test(lower)) return 'company';
  return 'general-web';
}

export function scoreUrl(url: string, title?: string, terrainHint?: TerrainType): number {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = (title || '').toLowerCase();
  let score = 0.35;
  if (/https:\/\//.test(lowerUrl)) score += 0.05;
  if (terrainHint && terrainHint !== 'general-web') score += 0.08;
  if (/(news|article|story|post|thread|discussion|docs|paper|research|blog)/.test(lowerUrl)) score += 0.12;
  if (/(breaking|analysis|report|release|guide|overview|study)/.test(lowerTitle)) score += 0.08;
  if (/(wikipedia|reddit|news\.ycombinator|arxiv|github|docs)/.test(lowerUrl)) score += 0.05;
  return Math.min(1, Number(score.toFixed(3)));
}
