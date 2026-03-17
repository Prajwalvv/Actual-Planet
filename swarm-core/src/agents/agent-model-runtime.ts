/**
 * AGENT MODEL RUNTIME — Shared ONNX session manager with batched inference
 *
 * Key design decisions:
 * 1. ONE ONNX session per agent type (not per agent instance)
 *    → 1000 explorer agents share 1 session
 * 2. Batched inference: all candidates from all agents in one forward pass
 *    → 20,000 candidates in ~5ms instead of 20,000 × 0.5ms = 10,000ms
 * 3. Lazy loading: models loaded on first use, not at startup
 * 4. Graceful fallback: if model fails, agents use heuristic scoring
 */

import * as fs from 'fs';
import * as path from 'path';
import { AgentModelManifest, AgentType, FeatureNormalization } from './agent-types';

// ─────────────────────────────────────────────
// ONNX Runtime types (dynamic import to keep optional)
// ─────────────────────────────────────────────

interface OrtModule {
  InferenceSession: {
    create(path: string, options?: any): Promise<OrtSession>;
  };
  Tensor: new (type: string, data: Float32Array | BigInt64Array | Int32Array | number[], dims: number[]) => OrtTensor;
}

interface OrtSession {
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
  release(): Promise<void>;
}

interface OrtTensor {
  data: Float32Array | BigInt64Array;
  dims: readonly number[];
}

// ─────────────────────────────────────────────
// Agent Model Runtime
// ─────────────────────────────────────────────

export class AgentModelRuntime {
  private sessions: Map<AgentType, OrtSession> = new Map();
  private manifests: Map<AgentType, AgentModelManifest> = new Map();
  private normalizations: Map<AgentType, FeatureNormalization> = new Map();
  private ort: OrtModule | null = null;
  private modelsRoot: string;
  private loading: Map<AgentType, Promise<boolean>> = new Map();

  constructor(modelsRoot?: string) {
    this.modelsRoot = modelsRoot || path.resolve(process.cwd(), 'models', 'agents');
  }

  /**
   * Load the ONNX runtime module (lazy, once).
   */
  private async loadOrt(): Promise<OrtModule | null> {
    if (this.ort) return this.ort;
    try {
      // @ts-ignore - onnxruntime-node is an optional dependency
      this.ort = await import('onnxruntime-node') as unknown as OrtModule;
      return this.ort;
    } catch {
      console.warn('[AgentModelRuntime] onnxruntime-node not available — agents will use heuristic scoring');
      return null;
    }
  }

  /**
   * Load a specific agent model. Safe to call multiple times (idempotent).
   * Returns true if model loaded successfully.
   */
  async loadModel(agentType: AgentType): Promise<boolean> {
    if (this.sessions.has(agentType)) return true;

    // Prevent concurrent loads of the same model
    const existing = this.loading.get(agentType);
    if (existing) return existing;

    const promise = this._doLoad(agentType);
    this.loading.set(agentType, promise);
    const result = await promise;
    this.loading.delete(agentType);
    return result;
  }

  private async _doLoad(agentType: AgentType): Promise<boolean> {
    try {
      const manifestPath = path.join(this.modelsRoot, agentType, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        console.warn(`[AgentModelRuntime] No manifest for agent type '${agentType}' at ${manifestPath}`);
        return false;
      }

      const manifest: AgentModelManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (!manifest.enabled) {
        console.info(`[AgentModelRuntime] Agent model '${agentType}' is disabled in manifest`);
        return false;
      }

      const modelPath = path.join(this.modelsRoot, agentType, manifest.modelFile);
      if (!fs.existsSync(modelPath)) {
        console.warn(`[AgentModelRuntime] ONNX file not found: ${modelPath}`);
        return false;
      }

      const ort = await this.loadOrt();
      if (!ort) return false;

      const session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      });

      // Load normalization if available
      const normPath = path.join(this.modelsRoot, agentType, manifest.normalizationFile);
      if (fs.existsSync(normPath)) {
        const norm: FeatureNormalization = JSON.parse(fs.readFileSync(normPath, 'utf-8'));
        this.normalizations.set(agentType, norm);
      }

      this.sessions.set(agentType, session);
      this.manifests.set(agentType, manifest);
      console.info(`[AgentModelRuntime] Loaded '${agentType}' model v${manifest.version} (${manifest.inputDim} features)`);
      return true;
    } catch (err) {
      console.error(`[AgentModelRuntime] Failed to load '${agentType}':`, err);
      return false;
    }
  }

  /**
   * Run batched inference for an agent type.
   * Takes a 2D array of feature vectors [batchSize × inputDim].
   * Returns scores as Float32Array [batchSize].
   */
  async scoreBatch(agentType: AgentType, features: number[][]): Promise<Float32Array | null> {
    const session = this.sessions.get(agentType);
    const manifest = this.manifests.get(agentType);
    if (!session || !manifest || !this.ort) return null;

    const batchSize = features.length;
    if (batchSize === 0) return new Float32Array(0);

    const inputDim = manifest.inputDim;

    // Normalize features if normalization config exists
    const norm = this.normalizations.get(agentType);
    const flat = new Float32Array(batchSize * inputDim);
    for (let i = 0; i < batchSize; i++) {
      for (let j = 0; j < inputDim; j++) {
        let val = features[i][j] ?? 0;
        if (norm && norm.means.length > j && norm.stds.length > j) {
          const std = norm.stds[j] || 1;
          val = (val - norm.means[j]) / std;
        }
        flat[i * inputDim + j] = val;
      }
    }

    try {
      const inputTensor = new this.ort.Tensor('float32', flat, [batchSize, inputDim]);
      const results = await session.run({ [manifest.inputName]: inputTensor });
      const output = results[manifest.outputName];
      if (!output) return null;
      return output.data as Float32Array;
    } catch (err) {
      console.error(`[AgentModelRuntime] Inference failed for '${agentType}':`, err);
      return null;
    }
  }

  /**
   * Check if a model is loaded and ready for a given agent type.
   */
  isReady(agentType: AgentType): boolean {
    return this.sessions.has(agentType);
  }

  /**
   * Get the manifest for a loaded agent type.
   */
  getManifest(agentType: AgentType): AgentModelManifest | undefined {
    return this.manifests.get(agentType);
  }

  /**
   * Dispose all sessions.
   */
  async dispose(): Promise<void> {
    for (const [type, session] of this.sessions) {
      try {
        await session.release();
      } catch (err) {
        console.warn(`[AgentModelRuntime] Error releasing session for '${type}':`, err);
      }
    }
    this.sessions.clear();
    this.manifests.clear();
    this.normalizations.clear();
  }
}
