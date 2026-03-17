import { SwarmEngineConfig } from './swarm-engine';

export interface SwarmModelDefinition {
  id: string;
  name: string;
  description: string;
  costTier: number;
  config: Partial<SwarmEngineConfig>;
}

export const MODEL_DISCOVER: SwarmModelDefinition = {
  id: 'discover',
  name: 'Swarm Discover',
  description: 'Broad public-web discovery with heavier bootstrap and pathfinding bias.',
  costTier: 2,
  config: {
    id: 'engine:discover',
    browser: { maxBrowsers: 3, maxPagesPerBrowser: 4 },
    harvesters: { minConcentrationToHarvest: 0.15 },
  },
};

export const MODEL_PRECISE: SwarmModelDefinition = {
  id: 'precise',
  name: 'Swarm Precise',
  description: 'Higher verification bias and tighter evidence thresholds for known topics.',
  costTier: 3,
  config: {
    id: 'engine:precise',
    browser: { maxBrowsers: 2, maxPagesPerBrowser: 4 },
    harvesters: { minConcentrationToHarvest: 0.22 },
  },
};

export const MODEL_CORRELATE: SwarmModelDefinition = {
  id: 'correlate',
  name: 'Swarm Correlate',
  description: 'Best for multi-topic relationship and contextual co-occurrence patterns.',
  costTier: 4,
  config: {
    id: 'engine:correlate',
    browser: { maxBrowsers: 2, maxPagesPerBrowser: 5 },
    harvesters: { minConcentrationToHarvest: 0.18 },
  },
};

export const MODEL_SENTIMENT: SwarmModelDefinition = {
  id: 'sentiment',
  name: 'Swarm Sentiment',
  description: 'Forum-heavy public-web sensing tuned for crowd mood and social signals.',
  costTier: 2,
  config: {
    id: 'engine:sentiment',
    browser: { maxBrowsers: 1, maxPagesPerBrowser: 3 },
    harvesters: { minConcentrationToHarvest: 0.14 },
  },
};

export const MODEL_FULL: SwarmModelDefinition = {
  id: 'full',
  name: 'Swarm Full',
  description: 'Balanced maximum-depth adaptive swarm for broad evidence gathering and corroboration.',
  costTier: 5,
  config: {
    id: 'engine:full',
    browser: { maxBrowsers: 3, maxPagesPerBrowser: 5 },
    harvesters: { minConcentrationToHarvest: 0.16 },
  },
};

export const MODEL_REGISTRY: Map<string, SwarmModelDefinition> = new Map([
  [MODEL_DISCOVER.id, MODEL_DISCOVER],
  [MODEL_PRECISE.id, MODEL_PRECISE],
  [MODEL_CORRELATE.id, MODEL_CORRELATE],
  [MODEL_SENTIMENT.id, MODEL_SENTIMENT],
  [MODEL_FULL.id, MODEL_FULL],
]);

export function getModel(id: string): SwarmModelDefinition {
  return MODEL_REGISTRY.get(id) ?? MODEL_FULL;
}

export function listModels(): SwarmModelDefinition[] {
  return [...MODEL_REGISTRY.values()];
}
