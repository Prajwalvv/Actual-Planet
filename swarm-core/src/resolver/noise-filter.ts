import { canonicalizeEntity, tokenizeCanonical } from './normalization';

const GENERIC_NOISE = new Set([
  'latest', 'report', 'discussion', 'thread', 'update', 'news', 'today', 'yesterday',
  'tomorrow', 'week', 'month', 'year', 'time', 'people', 'thing', 'stuff', 'question',
  'answer', 'post', 'comment', 'article', 'market', 'global', 'state', 'country',
  'energy', 'model', 'data', 'analysis', 'detail', 'source',
]);

export interface RankedCandidate {
  symbol: string;
  score: number;
  reason?: string;
  mentions?: number;
  quality?: number;
}

export function isNoisyEntitySymbol(symbol: string): boolean {
  const canonical = canonicalizeEntity(symbol);
  if (!canonical) return true;

  const tokens = tokenizeCanonical(symbol);
  if (tokens.length === 0) return true;
  if (tokens.length > 6) return true; // extremely long phrase labels are usually extraction noise

  if (tokens.length === 1) {
    const t = tokens[0];
    if (t.length <= 2) return true;
    if (GENERIC_NOISE.has(t)) return true;
  }

  let genericCount = 0;
  for (const t of tokens) {
    if (GENERIC_NOISE.has(t)) genericCount++;
  }
  if (genericCount >= Math.max(2, Math.ceil(tokens.length * 0.7))) {
    return true;
  }

  return false;
}

export function filterRankedCandidates<T extends RankedCandidate>(
  candidates: T[],
  requestedSymbols: string[] = [],
): T[] {
  const requestedCanonical = new Set(requestedSymbols.map((s) => canonicalizeEntity(s)).filter(Boolean));

  return candidates.filter((c) => {
    const canonical = canonicalizeEntity(c.symbol);
    if (!canonical) return false;

    // Keep candidates that directly overlap requested symbols, even if borderline noisy.
    if (requestedCanonical.has(canonical)) return true;

    return !isNoisyEntitySymbol(c.symbol);
  });
}

