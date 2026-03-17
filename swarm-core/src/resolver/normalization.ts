/**
 * NORMALIZATION HELPERS — lightweight canonicalization for open-world entities.
 * This is intentionally small and generic (not a hard-coded synonym dictionary).
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'for', 'to', 'in', 'on', 'at', 'by', 'with', 'from',
  'and', 'or', 'as', 'is', 'are', 'was', 'were', 'be', 'this', 'that', 'these', 'those',
]);

function singularizeToken(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith('ies') && token.length > 4) return token.slice(0, -3) + 'y';
  if (token.endsWith('ses') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

export function canonicalizeEntity(raw: string): string {
  if (!raw) return '';
  const cleaned = raw
    .normalize('NFKD')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[_/\\-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const tokens = cleaned
    .split(' ')
    .map((t) => singularizeToken(t))
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));

  return tokens.join(' ').trim();
}

export function tokenizeCanonical(raw: string): string[] {
  const canonical = canonicalizeEntity(raw);
  if (!canonical) return [];
  return canonical.split(' ').filter(Boolean);
}

export function normalizationVariants(raw: string): string[] {
  const canonical = canonicalizeEntity(raw);
  const lowered = (raw || '').toLowerCase().trim();
  const squashed = canonical.replace(/\s+/g, '');
  return [...new Set([raw.trim(), lowered, canonical, squashed].filter(Boolean))];
}

