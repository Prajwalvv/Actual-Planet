import { QueryExecutionPlan } from '../../adaptive-types';
import { PheromoneSpace } from '../../pheromone-space';
import { ensurePolicyLocations, recordPolicyOutcomePheromones, summarizePheromoneContext } from '../pheromone-context';

const plan: QueryExecutionPlan = {
  query: 'ai chips',
  terrains: [
    { terrain: 'news', weight: 0.7 },
    { terrain: 'docs', weight: 0.3 },
  ],
  providerPlan: [
    { providerId: 'duckduckgo_html', budgetPct: 0.5 },
    { providerId: 'reddit_search', budgetPct: 0.5 },
  ],
  breedPlan: [
    { breedId: 'search_bootstrap', count: 1 },
    { breedId: 'link_pathfinder', count: 2 },
    { breedId: 'news_reader', count: 2 },
    { breedId: 'source_verifier', count: 1 },
  ],
  timeBudgetMs: 45000,
  phaseBudgetsMs: {
    bootstrap: 5000,
    explore: 20000,
    corroborate: 10000,
    synthesize: 10000,
  },
};

describe('pheromone context policy integration', () => {
  it('registers policy locations and writes role/model deposits', async () => {
    const space = new PheromoneSpace();
    await space.registerLocation({ id: 'DOMAIN:DISCOVERED', type: 'domain', parents: [] });
    await ensurePolicyLocations(space, {
      rootLocation: 'DOMAIN:DISCOVERED',
      modelId: 'full',
      plan,
    });

    await recordPolicyOutcomePheromones(space, {
      roleId: 'news_reader',
      units: 2,
      confidence: 0.9,
      source: 'heuristic',
      reason: 'test',
    }, {
      processed: 2,
      added: 1,
      elapsedMs: 20,
      evidenceDelta: 1,
      coverageDelta: 0.1,
      usefulnessDelta: 0.2,
      frontierDelta: -1,
      blockedDelta: 0,
      allowedDelta: 1,
      promotedDelta: 0,
      terrainDeltaIds: ['news'],
      providerDeltaIds: ['duckduckgo_html'],
      useful: true,
    }, {
      modelId: 'full',
      traceId: 'trace-1',
      stepIndex: 0,
    });

    const summary = await summarizePheromoneContext(space, {
      rootLocation: 'DOMAIN:DISCOVERED',
      modelId: 'full',
      providerIds: ['duckduckgo_html', 'reddit_search'],
    });

    expect(summary.roles.news_reader.concentration).toBeGreaterThan(0);
    expect(summary.model.concentration).toBeGreaterThan(0);
    expect(summary.providers.duckduckgo_html.concentration).toBeGreaterThan(0);
    expect(summary.terrains.news.concentration).toBeGreaterThan(0);
  });
});
