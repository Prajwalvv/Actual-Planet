import { NeuralAntObservation, PositionContext, LocalPheromones, ResourceState, NearbyAnts, OBSERVATION_DIM } from './neural-ant-types';

export interface SwarmState {
  currentDepth: number;
  stepsTaken: number;
  timeElapsedMs: number;
  timeBudgetMs: number;
  queryLength: number;
  terrain: string;
  depthMode: 'quick' | 'standard' | 'deep';
  evidenceCount: number;
  coverageRatio: number;
  frontierSize: number;
  sourceDiversity: number;
  blockedCount: number;
  totalUrls: number;
  usefulnessScore: number;
  successfulFetches: number;
  totalFetches: number;
  trailStrength: number;
  interestStrength: number;
  deadTrailStrength: number;
  trailGradientX: number;
  trailGradientY: number;
  trailGradientZ: number;
  pheromoneAge: number;
  trailDiversity: number;
  evaporationRate: number;
  nearbyAntCount: number;
  localAntDensity: number;
  avgNearbySuccess: number;
  communicationSignal: number;
  swarmAlignment: number;
  competitionPressure: number;
  energyRemaining: number;
}

const TERRAIN_TYPES = ['news', 'forum', 'docs', 'academic', 'company', 'general-web', 'social-signal'];
const DEPTH_MODES = ['quick', 'standard', 'deep'];

export function buildNeuralAntObservation(
  state: SwarmState,
  previousHidden?: Float32Array,
): NeuralAntObservation {
  const positionContext = buildPositionContext(state);
  const localPheromones = buildLocalPheromones(state);
  const resourceState = buildResourceState(state);
  const nearbyAnts = buildNearbyAnts(state);
  
  const hiddenState = previousHidden || new Float32Array(64);
  
  return {
    positionContext,
    localPheromones,
    resourceState,
    nearbyAnts,
    hiddenState,
  };
}

function buildPositionContext(state: SwarmState): PositionContext {
  const currentDepth = Math.min(1.0, state.currentDepth / 10.0);
  const stepsTaken = Math.min(1.0, state.stepsTaken / 100.0);
  const timeRemaining = Math.max(0, 1.0 - (state.timeElapsedMs / state.timeBudgetMs));
  const queryLengthNorm = Math.min(1.0, state.queryLength / 200.0);
  
  const terrainOneHot = TERRAIN_TYPES.map(t => t === state.terrain ? 1 : 0);
  
  const depthModeOneHot = DEPTH_MODES.map(m => m === state.depthMode ? 1 : 0);
  
  return {
    currentDepth,
    stepsTaken,
    timeRemaining,
    queryLengthNorm,
    terrainOneHot,
    depthModeOneHot,
  };
}

function buildLocalPheromones(state: SwarmState): LocalPheromones {
  const trailGradient: [number, number, number] = [
    state.trailGradientX,
    state.trailGradientY,
    state.trailGradientZ,
  ];
  
  return {
    trailStrength: state.trailStrength,
    interestStrength: state.interestStrength,
    deadTrailStrength: state.deadTrailStrength,
    trailGradient,
    pheromoneAge: state.pheromoneAge,
    trailDiversity: state.trailDiversity,
    evaporationRate: state.evaporationRate,
  };
}

function buildResourceState(state: SwarmState): ResourceState {
  const evidenceCountNorm = Math.min(1.0, state.evidenceCount / 100.0);
  const frontierSizeNorm = Math.min(1.0, state.frontierSize / 200.0);
  const sourceDiversityNorm = Math.min(1.0, state.sourceDiversity / 50.0);
  const blockedRatioNorm = state.totalUrls > 0 ? state.blockedCount / state.totalUrls : 0;
  const successRate = state.totalFetches > 0 ? state.successfulFetches / state.totalFetches : 0;
  
  return {
    evidenceCountNorm,
    coverageRatio: state.coverageRatio,
    frontierSizeNorm,
    sourceDiversityNorm,
    blockedRatioNorm,
    usefulnessScore: state.usefulnessScore,
    energyLevel: state.energyRemaining,
    successRate,
  };
}

function buildNearbyAnts(state: SwarmState): NearbyAnts {
  const nearbyAntCountNorm = Math.min(1.0, state.nearbyAntCount / 20.0);
  
  return {
    nearbyAntCountNorm,
    antDensity: state.localAntDensity,
    avgAntSuccess: state.avgNearbySuccess,
    communicationSignal: state.communicationSignal,
    swarmAlignment: state.swarmAlignment,
    competitionPressure: state.competitionPressure,
  };
}

export function flattenObservation(obs: NeuralAntObservation): Float32Array {
  const features: number[] = [];
  
  features.push(obs.positionContext.currentDepth);
  features.push(obs.positionContext.stepsTaken);
  features.push(obs.positionContext.timeRemaining);
  features.push(obs.positionContext.queryLengthNorm);
  features.push(...obs.positionContext.terrainOneHot);
  features.push(...obs.positionContext.depthModeOneHot);
  
  features.push(obs.localPheromones.trailStrength);
  features.push(obs.localPheromones.interestStrength);
  features.push(obs.localPheromones.deadTrailStrength);
  features.push(...obs.localPheromones.trailGradient);
  features.push(obs.localPheromones.pheromoneAge);
  features.push(obs.localPheromones.trailDiversity);
  features.push(obs.localPheromones.evaporationRate);
  
  features.push(obs.resourceState.evidenceCountNorm);
  features.push(obs.resourceState.coverageRatio);
  features.push(obs.resourceState.frontierSizeNorm);
  features.push(obs.resourceState.sourceDiversityNorm);
  features.push(obs.resourceState.blockedRatioNorm);
  features.push(obs.resourceState.usefulnessScore);
  features.push(obs.resourceState.energyLevel);
  features.push(obs.resourceState.successRate);
  
  features.push(obs.nearbyAnts.nearbyAntCountNorm);
  features.push(obs.nearbyAnts.antDensity);
  features.push(obs.nearbyAnts.avgAntSuccess);
  features.push(obs.nearbyAnts.communicationSignal);
  features.push(obs.nearbyAnts.swarmAlignment);
  features.push(obs.nearbyAnts.competitionPressure);
  
  if (features.length !== OBSERVATION_DIM - 16) {
    throw new Error(`Expected ${OBSERVATION_DIM - 16} features, got ${features.length}`);
  }
  
  return new Float32Array(features);
}

export function extractSwarmState(context: any): SwarmState {
  return {
    currentDepth: context.depth || 0,
    stepsTaken: context.steps || 0,
    timeElapsedMs: context.timeElapsed || 0,
    timeBudgetMs: context.timeBudget || 30000,
    queryLength: context.query?.length || 0,
    terrain: context.terrain || 'general-web',
    depthMode: context.depthMode || 'standard',
    evidenceCount: context.evidence?.length || 0,
    coverageRatio: context.coverage || 0,
    frontierSize: context.frontier?.size || 0,
    sourceDiversity: context.sources?.size || 0,
    blockedCount: context.blocked?.length || 0,
    totalUrls: context.totalUrls || 0,
    usefulnessScore: context.usefulness || 0,
    successfulFetches: context.successfulFetches || 0,
    totalFetches: context.totalFetches || 0,
    trailStrength: context.pheromones?.trail || 0,
    interestStrength: context.pheromones?.interest || 0,
    deadTrailStrength: context.pheromones?.dead || 0,
    trailGradientX: context.pheromones?.gradientX || 0,
    trailGradientY: context.pheromones?.gradientY || 0,
    trailGradientZ: context.pheromones?.gradientZ || 0,
    pheromoneAge: context.pheromones?.age || 0,
    trailDiversity: context.pheromones?.diversity || 0,
    evaporationRate: context.pheromones?.evaporation || 0.1,
    nearbyAntCount: context.nearbyAnts?.count || 0,
    localAntDensity: context.nearbyAnts?.density || 0,
    avgNearbySuccess: context.nearbyAnts?.avgSuccess || 0,
    communicationSignal: context.communication?.signal || 0,
    swarmAlignment: context.swarm?.alignment || 0,
    competitionPressure: context.swarm?.competition || 0,
    energyRemaining: context.energy || 1.0,
  };
}
