import { canonicalizeEntity } from '../resolver/normalization';

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'about', 'what', 'when', 'where', 'which', 'while', 'have', 'will', 'your', 'their', 'there']);

function cleanTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

export function minePhrases(text: string, queryTerms: string[] = [], limit: number = 10): string[] {
  const tokens = cleanTokens(text);
  if (tokens.length === 0) return [];
  const anchored = new Set(cleanTokens(queryTerms.join(' ')));
  const counts = new Map<string, number>();

  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i <= tokens.length - n; i++) {
      const chunk = tokens.slice(i, i + n);
      if (chunk.some((token) => token.length <= 2)) continue;
      if (anchored.size > 0 && !chunk.some((token) => anchored.has(token))) continue;
      const phrase = chunk.join(' ');
      counts.set(phrase, (counts.get(phrase) || 0) + 1);
    }
  }

  const singles = tokens.filter((token) => anchored.has(token));
  for (const token of singles) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  return [...counts.entries()]
    .filter(([phrase, count]) => count >= 1 && canonicalizeEntity(phrase))
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([phrase]) => phrase);
}
