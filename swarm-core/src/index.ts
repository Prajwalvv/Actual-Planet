/**
 * @rylvo/swarm-core
 * 
 * Stigmergic Computing Engine
 * Intelligence from non-intelligence.
 */

// Core types
export * from './types';
export * from './adaptive-types';

// Pheromone space
export { PheromoneSpace, PheromoneSpaceConfig } from './pheromone-space';

// Minimal core primitives
export { Ant } from './ant';

// Ant rule factories
export { createPriceRules } from './ants/price-ant';
export { createVolumeRules } from './ants/volume-ant';
export { createSentimentRules } from './ants/sentiment-ant';

// Browser runtime
export { BrowserPool, BrowserPoolConfig, PageLease } from './browser-pool';

// Adaptive swarm runtime
export { AdaptiveSwarmOrchestrator } from './runtime/adaptive-swarm-orchestrator';
export { ProviderRegistry } from './discovery/provider-registry';
export { QueryFrontier, FrontierItem } from './discovery/frontier';
export { CrawlPolicyEngine, CrawlPolicyConfig, PolicyDecision } from './discovery/policy-engine';
export { buildQueryExecutionPlan } from './planner/query-terrain-planner';
export { classifyQueryTerrains } from './planner/query-intent-classifier';
export { QueryOverlayMemory } from './memory/query-overlay';
export { buildPromotionDecisions } from './memory/promotion-manager';
export { BreedRegistry } from './ants/breeds/breed-registry';
export { PolicyController } from './policy/controller';
export { GruPolicyRuntime } from './policy/gru-inference';
export * from './policy/policy-types';
export * from './policy/role-ids';

// Processor caste (millions, no browser)
export { AmplifierAnt, CorrelatorAnt, ValidatorAnt, ProcessorColony, ProcessorColonyConfig } from './ants/processor-ants';

// Runtime workers
export { HarvesterAnt, HarvesterColony, HarvesterColonyConfig } from './ants/harvester-ant';
export { NurseAnt, NurseAntConfig } from './ants/nurse-ant';

// Phase 4B: Swarm Engine + Models (API layer)
export { SwarmEngine, SwarmEngineConfig, DEFAULT_ENGINE_CONFIG, TickResult, EngineEvent, EngineEventType } from './swarm-engine';
export { SwarmModelDefinition, MODEL_DISCOVER, MODEL_PRECISE, MODEL_CORRELATE, MODEL_SENTIMENT, MODEL_FULL, MODEL_REGISTRY, getModel, listModels } from './swarm-models';

// Redis pheromone space
export { RedisPheromoneSpace, RedisPheromoneSpaceConfig } from './redis-pheromone-space';
