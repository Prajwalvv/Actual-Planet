/**
 * NEURAL ANT TYPES
 * 
 * Defines the observation space, action space, and model interface for
 * fully neural model-driven ants. Each ant is controlled by a GRU-based
 * policy network that makes all behavioral decisions.
 */

export interface NeuralAntObservation {
  positionContext: PositionContext;
  localPheromones: LocalPheromones;
  resourceState: ResourceState;
  nearbyAnts: NearbyAnts;
  hiddenState: Float32Array;
}

export interface PositionContext {
  currentDepth: number;
  stepsTaken: number;
  timeRemaining: number;
  queryLengthNorm: number;
  terrainOneHot: number[];
  depthModeOneHot: number[];
}

export interface LocalPheromones {
  trailStrength: number;
  interestStrength: number;
  deadTrailStrength: number;
  trailGradient: [number, number, number];
  pheromoneAge: number;
  trailDiversity: number;
  evaporationRate: number;
}

export interface ResourceState {
  evidenceCountNorm: number;
  coverageRatio: number;
  frontierSizeNorm: number;
  sourceDiversityNorm: number;
  blockedRatioNorm: number;
  usefulnessScore: number;
  energyLevel: number;
  successRate: number;
}

export interface NearbyAnts {
  nearbyAntCountNorm: number;
  antDensity: number;
  avgAntSuccess: number;
  communicationSignal: number;
  swarmAlignment: number;
  competitionPressure: number;
}

export type MovementAction =
  | 'STOP'
  | 'FOLLOW_TRAIL'
  | 'EXPLORE_NEW'
  | 'EXPLOIT_BEST'
  | 'RANDOM_WALK'
  | 'BACKTRACK'
  | 'JUMP_FRONTIER'
  | 'FOLLOW_SWARM';

export type AntMode =
  | 'EXPLORATION'
  | 'EXPLOITATION'
  | 'VALIDATION'
  | 'SYNTHESIS';

export interface PheromoneDeposit {
  trailAmount: number;
  interestAmount: number;
  deadTrailFlag: number;
}

export interface Communication {
  broadcastStrength: number;
  messageType: number;
  urgency: number;
  resourceShare: number;
}

export interface NeuralAntAction {
  movement: MovementAction;
  pheromone: PheromoneDeposit;
  communication: Communication;
  mode: AntMode;
  confidence: number;
}

export interface NeuralAntTraceRecord {
  traceId: string;
  antId: string;
  timestamp: number;
  step: number;
  observation: NeuralAntObservation;
  action: NeuralAntAction;
  reward: number;
  nextObservation: NeuralAntObservation | null;
  done: boolean;
  queryId: string;
  queryText: string;
}

export interface NeuralAntModelManifest {
  enabled: boolean;
  version: string;
  modelFile: string;
  inputDim: number;
  hiddenSize: number;
  inputName: string;
  hiddenInputName: string;
  outputNames: {
    movement: string;
    pheromone: string;
    communication: string;
    mode: string;
    hiddenState: string;
  };
}

export interface NeuralAntFitness {
  antId: string;
  generation: number;
  episodeReward: number;
  evidenceQuality: number;
  coverageAchieved: number;
  efficiency: number;
  successRate: number;
  totalSteps: number;
  queriesCompleted: number;
}

export interface INeuralAntModel {
  isReady(): boolean;
  step(observation: NeuralAntObservation): Promise<NeuralAntAction>;
  reset(): void;
  getHiddenState(): Float32Array;
  setHiddenState(state: Float32Array): void;
  dispose(): Promise<void>;
}

export const MOVEMENT_ACTIONS: MovementAction[] = [
  'STOP',
  'FOLLOW_TRAIL',
  'EXPLORE_NEW',
  'EXPLOIT_BEST',
  'RANDOM_WALK',
  'BACKTRACK',
  'JUMP_FRONTIER',
  'FOLLOW_SWARM',
];

export const ANT_MODES: AntMode[] = [
  'EXPLORATION',
  'EXPLOITATION',
  'VALIDATION',
  'SYNTHESIS',
];

export const OBSERVATION_DIM = 51;
export const HIDDEN_DIM = 64;
export const MOVEMENT_ACTION_COUNT = 8;
export const MODE_COUNT = 4;
