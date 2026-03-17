import fs from 'fs';
import path from 'path';
import { encodePolicyObservation } from './feature-extractor';
import { PolicyAction, PolicyObservation } from './policy-types';
import { POLICY_ACTIONS } from './role-ids';

interface GruManifest {
  enabled?: boolean;
  version?: string;
  modelFile?: string;
  inputName?: string;
  hiddenInputName?: string;
  hiddenOutputName?: string;
  roleInputName?: string;
  actionOutputName?: string;
  unitsOutputName?: string;
  confidenceOutputName?: string;
  roleEmbeddingDim?: number;
  hiddenSize?: number;
}

type OrtModule = {
  InferenceSession: {
    create: (modelPath: string) => Promise<any>;
  };
  Tensor: new (type: string, data: Float32Array | BigInt64Array | Int32Array, dims: number[]) => any;
};

export class GruPolicyRuntime {
  private loaded = false;
  private session: any = null;
  private ort: OrtModule | null = null;
  private manifest: GruManifest | null = null;
  private hiddenState: Float32Array | null = null;
  private lastRoleIndex = 0;
  private readonly modelDir: string;

  constructor(modelDir?: string) {
    this.modelDir = modelDir || process.env.SWARM_POLICY_MODEL_DIR || path.join(process.cwd(), 'models', 'gru');
  }

  reset(): void {
    this.hiddenState = null;
    this.lastRoleIndex = 0;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    const manifestPath = path.join(this.modelDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return;

    try {
      this.manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8')) as GruManifest;
    } catch {
      this.manifest = null;
      return;
    }

    if (!this.manifest?.enabled) return;

    try {
      const runtime = require('onnxruntime-node') as OrtModule;
      const modelFile = this.manifest.modelFile || 'gru_scheduler.onnx';
      const modelPath = path.join(this.modelDir, modelFile);
      if (!fs.existsSync(modelPath)) {
        console.warn(`[GruPolicyRuntime] ONNX file not found: ${modelPath}`);
        return;
      }
      this.ort = runtime;
      this.session = await runtime.InferenceSession.create(modelPath);
      console.info(`[GruPolicyRuntime] Loaded GRU model v${this.manifest.version} from ${modelPath}`);
    } catch (err) {
      console.warn(`[GruPolicyRuntime] Failed to load ONNX model:`, err);
      this.ort = null;
      this.session = null;
    }
  }

  async decide(observation: PolicyObservation): Promise<PolicyAction | null> {
    await this.ensureLoaded();
    if (!this.manifest?.enabled || !this.session || !this.ort) return null;

    try {
      const features = encodePolicyObservation(observation);
      const featureDims = [1, features.length];
      const hiddenSize = Number(process.env.SWARM_POLICY_HIDDEN_SIZE || 96);

      if (!this.hiddenState || this.hiddenState.length !== hiddenSize) {
        this.hiddenState = new Float32Array(hiddenSize);
      }

      const feeds: Record<string, any> = {
        [this.manifest.inputName || 'observation']: new this.ort.Tensor('float32', features, featureDims),
      };

      if (this.manifest.hiddenInputName) {
        feeds[this.manifest.hiddenInputName] = new this.ort.Tensor('float32', this.hiddenState, [1, hiddenSize]);
      }

      if (this.manifest.roleInputName) {
        feeds[this.manifest.roleInputName] = new this.ort.Tensor('int64', BigInt64Array.from([BigInt(this.lastRoleIndex)]), [1]);
      }

      const outputs = await this.session.run(feeds);
      const actionKey = this.manifest.actionOutputName || 'action_logits';
      const unitsKey = this.manifest.unitsOutputName || 'units_logits';
      const confidenceKey = this.manifest.confidenceOutputName || 'confidence';
      const hiddenKey = this.manifest.hiddenOutputName || 'next_hidden_state';

      const actionLogits = Array.from(outputs[actionKey]?.data || [], (value: any) => Number(value));
      const unitsLogits = Array.from(outputs[unitsKey]?.data || [], (value: any) => Number(value));
      const confidenceRaw = Number(outputs[confidenceKey]?.data?.[0] ?? 0);

      if (outputs[hiddenKey]?.data && this.hiddenState) {
        const nextHidden = Array.from(outputs[hiddenKey].data || [], (value: any) => Number(value));
        if (nextHidden.length === this.hiddenState.length) {
          this.hiddenState = Float32Array.from(nextHidden);
        }
      }

      if (actionLogits.length === 0) return null;

      const pickedActionIndex = argmax(actionLogits);
      const pickedAction = POLICY_ACTIONS[pickedActionIndex] || 'stop_explore';
      const pickedUnits = unitsLogits.length > 0 ? argmax(unitsLogits) + 1 : 1;
      this.lastRoleIndex = pickedActionIndex;
      const confidence = Math.max(0, Math.min(1, Number.isFinite(confidenceRaw) ? confidenceRaw : softmaxPeak(actionLogits)));

      return {
        roleId: pickedAction,
        units: pickedAction === 'stop_explore' ? 0 : Math.max(1, Math.min(2, pickedUnits)),
        confidence,
        source: 'gru',
        reason: 'gru_policy',
        modelVersion: this.manifest.version || null,
      };
    } catch {
      return null;
    }
  }
}

function argmax(values: number[]): number {
  let bestIndex = 0;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] > bestValue) {
      bestIndex = i;
      bestValue = values[i];
    }
  }
  return bestIndex;
}

function softmaxPeak(values: number[]): number {
  const peak = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - peak));
  const total = exps.reduce((sum, value) => sum + value, 0) || 1;
  return Math.max(...exps) / total;
}
