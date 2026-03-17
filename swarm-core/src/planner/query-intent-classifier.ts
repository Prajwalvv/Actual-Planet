import { TerrainType } from '../adaptive-types';

const TERRAIN_RULES: Array<{ terrain: TerrainType; terms: string[]; weight: number }> = [
  { terrain: 'news', terms: ['trending', 'emerging', 'latest', 'breaking', 'today', 'recent', 'news', 'hot'], weight: 0.3 },
  { terrain: 'forum', terms: ['reddit', 'discussion', 'thread', 'community', 'people saying', 'opinion', 'forum'], weight: 0.28 },
  { terrain: 'docs', terms: ['docs', 'documentation', 'api', 'release notes', 'changelog', 'issue', 'github'], weight: 0.32 },
  { terrain: 'academic', terms: ['paper', 'study', 'research', 'cvpr', 'neurips', 'icml', 'arxiv', 'abstract'], weight: 0.34 },
  { terrain: 'company', terms: ['company', 'startup', 'stock', 'earnings', 'investor', 'brand'], weight: 0.24 },
  { terrain: 'social-signal', terms: ['sentiment', 'mood', 'hype', 'fear', 'buzz', 'reaction'], weight: 0.26 },
];

export function classifyQueryTerrains(query: string, symbols: string[] = [], hints: TerrainType[] = []): Array<{ terrain: TerrainType; weight: number }> {
  const lower = `${query || ''} ${symbols.join(' ')}`.toLowerCase();
  const scores = new Map<TerrainType, number>();

  for (const rule of TERRAIN_RULES) {
    let score = scores.get(rule.terrain) || 0;
    for (const term of rule.terms) {
      if (lower.includes(term)) score += rule.weight;
    }
    scores.set(rule.terrain, score);
  }

  if (!lower.trim()) {
    scores.set('general-web', 0.6);
  } else {
    scores.set('general-web', Math.max(0.2, scores.get('general-web') || 0.2));
  }

  for (const hint of hints) {
    scores.set(hint, (scores.get(hint) || 0) + 0.35);
  }

  if (symbols.length > 0) {
    scores.set('company', (scores.get('company') || 0) + 0.08);
    scores.set('forum', (scores.get('forum') || 0) + 0.06);
  }

  const ranked = [...scores.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const total = ranked.reduce((sum, [, score]) => sum + score, 0) || 1;
  return ranked.map(([terrain, score]) => ({ terrain, weight: Number((score / total).toFixed(3)) }));
}
