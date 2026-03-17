import { AdaptiveQueryRequest, QueryExecutionPlan, TerrainType } from '../adaptive-types';
import { classifyQueryTerrains } from './query-intent-classifier';

function modelBias(modelId: string, terrain: TerrainType): number {
  switch (modelId) {
    case 'discover':
      return terrain === 'news' || terrain === 'forum' || terrain === 'general-web' ? 1.15 : 0.9;
    case 'precise':
      return terrain === 'docs' || terrain === 'company' || terrain === 'academic' ? 1.18 : 0.88;
    case 'correlate':
      return terrain === 'news' || terrain === 'forum' || terrain === 'company' ? 1.08 : 0.95;
    case 'sentiment':
      return terrain === 'forum' || terrain === 'social-signal' || terrain === 'news' ? 1.2 : 0.8;
    default:
      return 1;
  }
}

export function buildQueryExecutionPlan(request: AdaptiveQueryRequest): QueryExecutionPlan {
  const terrains = classifyQueryTerrains(request.query || '', request.symbols || [], request.terrainHints || [])
    .map((entry) => ({ ...entry, weight: Number((entry.weight * modelBias(request.modelId, entry.terrain)).toFixed(3)) }));

  const terrainTotal = terrains.reduce((sum, t) => sum + t.weight, 0) || 1;
  const normalizedTerrains = terrains.map((t) => ({ terrain: t.terrain, weight: Number((t.weight / terrainTotal).toFixed(3)) }));

  const providerPlan = [
    { providerId: 'duckduckgo_html', budgetPct: 0.34 },
    { providerId: 'reddit_search', budgetPct: 0.2 },
    { providerId: 'hn_algolia', budgetPct: 0.16 },
    { providerId: 'wikipedia_search', budgetPct: 0.12 },
    { providerId: 'rss_autodiscovery', budgetPct: 0.1 },
    { providerId: 'sitemap_probe', budgetPct: 0.08 },
  ];

  const breedPlan = [
    { breedId: 'search_bootstrap', count: request.modelId === 'discover' ? 2 : 1 },
    { breedId: 'link_pathfinder', count: request.modelId === 'discover' || request.modelId === 'full' ? 2 : 1 },
    { breedId: 'news_reader', count: normalizedTerrains.some((t) => t.terrain === 'news') ? 2 : 1 },
    { breedId: 'forum_thread_reader', count: normalizedTerrains.some((t) => t.terrain === 'forum' || t.terrain === 'social-signal') ? 2 : 1 },
    { breedId: 'docs_reader', count: normalizedTerrains.some((t) => t.terrain === 'docs' || t.terrain === 'company') ? 2 : 1 },
    { breedId: 'paper_abstract_reader', count: normalizedTerrains.some((t) => t.terrain === 'academic') ? 2 : 1 },
    { breedId: 'source_verifier', count: request.modelId === 'precise' || request.modelId === 'full' ? 2 : 1 },
  ];

  const timeBudgetMs = request.timeoutSec * 1000;
  const phaseBudgetsMs = {
    bootstrap: Math.max(1500, Math.round(timeBudgetMs * 0.18)),
    explore: Math.max(2500, Math.round(timeBudgetMs * 0.44)),
    corroborate: Math.max(1000, Math.round(timeBudgetMs * 0.18)),
    synthesize: Math.max(1000, Math.round(timeBudgetMs * 0.2)),
  };

  return {
    query: request.query || (request.symbols || []).join(' '),
    terrains: normalizedTerrains,
    providerPlan,
    breedPlan,
    timeBudgetMs,
    phaseBudgetsMs,
  };
}
