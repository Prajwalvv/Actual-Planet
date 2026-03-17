export { AgentModelRuntime } from './agent-model-runtime';
export { createAgentTraceCollector, NoopAgentTraceCollector, FileAgentTraceCollector } from './agent-trace-collector';
export type { IAgentTraceCollector } from './agent-trace-collector';
export { ExplorerAgent } from './explorer/explorer-agent';
export type { ExplorerAgentMode } from './explorer/explorer-agent';
export { buildExplorerFeatures, buildExplorerObservation, EXPLORER_INPUT_DIM } from './explorer/feature-builder';
export type { ExplorerObservationInput } from './explorer/feature-builder';

export { SynthesizerAgent, type SynthesizerAgentMode } from './synthesizer/synthesizer-agent';
export { buildSynthesizerFeatures, buildSynthesizerObservation, SYNTHESIZER_INPUT_DIM } from './synthesizer/feature-builder';

export { ValidatorAgent, type ValidatorAgentMode } from './validator/validator-agent';
export { buildValidatorFeatures, buildValidatorObservation, VALIDATOR_INPUT_DIM } from './validator/feature-builder';

export type {
  AgentType,
  AgentModelManifest,
  AgentObservation,
  AgentTraceRecord,
  CandidateOutcome,
  FeatureNormalization,
  IAgentModel,
  LinkCandidate,
  ScoredCandidate,
} from './agent-types';
