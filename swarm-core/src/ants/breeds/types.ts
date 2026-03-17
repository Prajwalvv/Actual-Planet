import { BrowserPool } from '../../browser-pool';
import { AdaptiveQueryRequest, EvidenceItem, QueryExecutionPlan, RuntimeEventPayload, TerrainType } from '../../adaptive-types';
import { QueryFrontier } from '../../discovery/frontier';
import { ProviderRegistry } from '../../discovery/provider-registry';
import { CrawlPolicyEngine } from '../../discovery/policy-engine';
import { QueryOverlayMemory } from '../../memory/query-overlay';
import { AgentModelRuntime } from '../../agents/agent-model-runtime';
import { IAgentTraceCollector } from '../../agents/agent-trace-collector';

export interface BreedRunResult {
  processed: number;
  added: number;
}

export interface BreedExecutionContext {
  request: AdaptiveQueryRequest;
  plan: QueryExecutionPlan;
  frontier: QueryFrontier;
  overlay: QueryOverlayMemory;
  providers: ProviderRegistry;
  policy: CrawlPolicyEngine;
  pool: BrowserPool;
  deadlineMs: number;
  emit: (event: RuntimeEventPayload) => void;
  fetchHtml: (url: string, preferred?: 'http' | 'browser') => Promise<string | null>;
  addEvidence: (items: EvidenceItem[]) => void;
  enqueueUrl: (args: {
    url: string;
    sourceProviderId: string;
    terrainHint?: TerrainType;
    depth?: number;
    priority?: number;
    discoveredFrom?: string;
    title?: string;
    snippet?: string;
  }) => Promise<boolean>;
  /** Shared agent model runtime for per-ant neural network inference (optional) */
  agentRuntime?: AgentModelRuntime;
  /** Agent trace collector for training data (optional) */
  agentTraceCollector?: IAgentTraceCollector;
}

export interface AntBreedDefinition {
  id: string;
  terrains: readonly TerrainType[];
  costClass: 'cheap' | 'medium' | 'expensive';
  run(context: BreedExecutionContext, units: number): Promise<BreedRunResult>;
}

export async function fetchPageHtml(pool: BrowserPool, url: string, preferred: 'http' | 'browser' = 'http'): Promise<string | null> {
  if (preferred === 'browser') {
    const page = await pool.browse(url);
    return page?.html || null;
  }

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'SwarmBot/2.0', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      const browser = await pool.browse(url);
      return browser?.html || null;
    }
    const type = resp.headers.get('content-type') || '';
    if (!/html|xml|json|text/i.test(type)) return null;
    return await resp.text();
  } catch {
    const browser = await pool.browse(url);
    return browser?.html || null;
  }
}
