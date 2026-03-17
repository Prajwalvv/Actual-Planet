import { heuristicPolicyAction, createHeuristicPolicyState } from '../heuristic-fallback';
import { computeAvailableRoles, validateModelAction } from '../policy-guard';
import { QueryExecutionPlan } from '../../adaptive-types';

const plan: QueryExecutionPlan = {
  query: 'ai chips',
  terrains: [
    { terrain: 'news', weight: 0.5 },
    { terrain: 'docs', weight: 0.5 },
  ],
  providerPlan: [
    { providerId: 'duckduckgo_html', budgetPct: 0.5 },
    { providerId: 'reddit_search', budgetPct: 0.5 },
  ],
  breedPlan: [
    { breedId: 'search_bootstrap', count: 1 },
    { breedId: 'link_pathfinder', count: 2 },
    { breedId: 'news_reader', count: 2 },
    { breedId: 'docs_reader', count: 1 },
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

describe('policy guard and heuristic fallback', () => {
  it('computes only controllable roles that fit the current state', () => {
    expect(computeAvailableRoles(plan, 0, 0)).toEqual([]);
    expect(computeAvailableRoles(plan, 0, 2)).toEqual(['link_pathfinder']);
    expect(computeAvailableRoles(plan, 4, 2)).toEqual(['link_pathfinder', 'news_reader', 'docs_reader']);
  });

  it('rotates through available heuristic roles and preserves configured units', () => {
    const state = createHeuristicPolicyState();
    const roles = computeAvailableRoles(plan, 4, 2);

    expect(heuristicPolicyAction(plan, roles, state)).toMatchObject({
      roleId: 'link_pathfinder',
      units: 2,
    });
    expect(heuristicPolicyAction(plan, roles, state)).toMatchObject({
      roleId: 'news_reader',
      units: 2,
    });
    expect(heuristicPolicyAction(plan, roles, state)).toMatchObject({
      roleId: 'docs_reader',
      units: 1,
    });
  });

  it('rejects invalid low-confidence GRU actions', () => {
    const roles = computeAvailableRoles(plan, 4, 2);
    const result = validateModelAction({
      roleId: 'news_reader',
      units: 2,
      confidence: 0.2,
      source: 'gru',
      reason: 'gru_policy',
    }, roles, 0.35);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('confidence_below_floor');
  });
});
