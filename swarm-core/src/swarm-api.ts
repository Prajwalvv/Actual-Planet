/**
 * SWARM API — REST + WebSocket server for LLM tool calls
 * 
 * This is the product surface. LLMs, developers, and dashboards
 * connect here to query the swarm's intelligence.
 * 
 * Endpoints:
 *   GET  /api/models              — List available swarm models
 *   GET  /api/status              — Engine status + ant counts
 *   GET  /api/health              — Colony health report (from nurse)
 *   GET  /api/discover            — What's trending / recently discovered
 *   GET  /api/analyze/:locationId — Deep analysis on one entity
 *   GET  /api/reports             — All intelligence reports (sorted by conviction)
 *   GET  /api/reports/top/:n      — Top N reports
 *   GET  /api/correlate           — Cross-entity correlation patterns
 *   GET  /api/events              — Recent engine event log
 *   POST /api/query               — Natural language query (routes to appropriate data)
 *   WS   /ws                      — Real-time event stream
 * 
 * Run: npm run api
 * Default: http://localhost:3388
 */

import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { SwarmEngine, EngineEvent } from './swarm-engine';
import { listModels } from './swarm-models';
import { IntelligenceReport, SignalPolarity } from './types';
import { ModelShardManager } from './runtime/model-shard-manager';
import { QueryBackpressureError, QueryRouter } from './runtime/query-router';
import { QoSManager } from './runtime/qos';
import {
  db, auth as adminAuth, verifyIdToken, generateApiKey, validateApiKey,
  deductCredits, createUserDocument, syncUserDocument, COLLECTIONS, PLANS, MODEL_CREDIT_COST,
  firebaseAdmin, logApiRequest, getRequestLogs, checkRateLimit, getUserPlan,
  isAdmin, listAllUsers, getSystemStats, updateUserByAdmin, ADMIN_EMAILS,
} from './firebase-config';

const PORT = parseInt(process.env.SWARM_API_PORT || '3388', 10);
const API_PREFIX = '/api';

// ─────────────────────────────────────────────
// Engine Instance
// ─────────────────────────────────────────────

let engine: SwarmEngine | null = null;
let activeModelId: string = 'full';

interface ModelWaitLimitsSec {
  min: number;
  default: number;
  max: number;
}

const MODEL_WAIT_LIMITS_SEC: Record<string, ModelWaitLimitsSec> = {
  discover: { min: 20, default: 45, max: 120 },
  precise: { min: 15, default: 35, max: 90 },
  correlate: { min: 20, default: 45, max: 120 },
  sentiment: { min: 10, default: 25, max: 60 },
  full: { min: 20, default: 45, max: 120 },
};

const QUERY_POLL_INTERVAL_MS = 5000;
const IDLE_AUTO_STOP_MS = 120_000;
const QUERY_RESOLUTION_V2 = (process.env.QUERY_RESOLUTION_V2 || 'true').toLowerCase() !== 'false';
const MAX_QUERY_RESOLUTION_ATTEMPTS = Math.max(1, parseInt(process.env.QUERY_RESOLUTION_V2_MAX_ATTEMPTS || '4', 10));

const shardManager = new ModelShardManager({
  idleTtlMs: IDLE_AUTO_STOP_MS,
  maxShardsPerModel: parseInt(process.env.SWARM_MAX_SHARDS_PER_MODEL || '4', 10),
  scaleOutQueueDepth: parseInt(process.env.SWARM_SCALE_OUT_QUEUE_DEPTH || '1', 10),
  onEngineEvent: (event: EngineEvent, shard) => {
    activeModelId = shard.modelId;
    const current = shardManager.getShardEngine(shard.modelId);
    engine = current?.engine || engine;
    broadcast({
      type: event.type,
      data: {
        ...event,
        modelId: shard.modelId,
        shardId: shard.id,
      },
    });
  },
  onLifecycleEvent: (event) => {
    if (event.type === 'shard_started') {
      activeModelId = event.modelId;
    }
    broadcast({
      type: 'info',
      data: {
        message: `[runtime] ${event.type} ${event.shardId} (${event.modelId})${event.reason ? `: ${event.reason}` : ''}`,
        model: event.modelId,
        shardId: event.shardId,
      },
    });
  },
});
const qosManager = new QoSManager();
const queryRouter = new QueryRouter(shardManager, qosManager);

function getModelWaitLimits(modelId: string): ModelWaitLimitsSec {
  return MODEL_WAIT_LIMITS_SEC[modelId] ?? MODEL_WAIT_LIMITS_SEC.full;
}

function getPlanDefaultModel(plan: string): string {
  return plan === 'free' ? 'discover' : 'full';
}

function resolveRequestModel(
  requestedModel: string | undefined,
  plan: string,
  runningModel: string | null,
): { requested: string | null; resolved: string } {
  const normalizedRequested = requestedModel?.trim() || null;
  if (normalizedRequested) {
    return { requested: normalizedRequested, resolved: normalizedRequested };
  }
  if (runningModel && (PLANS[plan]?.models || []).includes(runningModel)) {
    return { requested: null, resolved: runningModel };
  }
  return { requested: null, resolved: getPlanDefaultModel(plan) };
}

function normalizeTimeoutForModel(
  timeoutRaw: unknown,
  modelId: string,
): {
  ok: boolean;
  requestedSec: number | null;
  acceptedSec?: number;
  limits: ModelWaitLimitsSec;
  error?: string;
} {
  const limits = getModelWaitLimits(modelId);
  if (timeoutRaw === undefined || timeoutRaw === null || timeoutRaw === '') {
    return { ok: true, requestedSec: null, acceptedSec: limits.default, limits };
  }

  const requestedSec = Number(timeoutRaw);
  if (!Number.isFinite(requestedSec)) {
    return {
      ok: false,
      requestedSec: null,
      limits,
      error: `Invalid "timeout". Must be a number in seconds for model "${modelId}".`,
    };
  }
  if (requestedSec < limits.min || requestedSec > limits.max) {
    return {
      ok: false,
      requestedSec,
      limits,
      error: `Invalid "timeout" for model "${modelId}". Allowed range: ${limits.min}-${limits.max} seconds.`,
    };
  }
  return { ok: true, requestedSec, acceptedSec: requestedSec, limits };
}

function updateLegacyRuntimePointers(preferredModel?: string): void {
  const picked = shardManager.getShardEngine(preferredModel);
  if (picked) {
    engine = picked.engine;
    activeModelId = picked.modelId;
    return;
  }
  engine = null;
}

function getReadEngine(preferredModel?: string): SwarmEngine | null {
  updateLegacyRuntimePointers(preferredModel);
  if (engine && engine.isRunning()) return engine;
  return null;
}

// ─────────────────────────────────────────────
// Express App
// ─────────────────────────────────────────────

const app = express();
app.use(express.json());

// REQUEST LOGGER — log every incoming request
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (!req.url.match(/\.(css|js|svg|png|ico|woff|ttf)$/)) {
    console.log(`[REQ] ${req.method} ${req.url}`);
  }
  next();
});

// CORS — allow all origins (LLM tool calls come from anywhere)
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  if (_req.method === 'OPTIONS') { res.sendStatus(200); return; }
  next();
});

// ─────────────────────────────────────────────
// WebSocket Clients
// ─────────────────────────────────────────────

const wsClients = new Set<WebSocket>();

function broadcast(data: any): void {
  const msg = JSON.stringify(data);
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// ─────────────────────────────────────────────
// Helper: wrap API responses
// ─────────────────────────────────────────────

interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  meta?: {
    model: string;
    engineRunning: boolean;
    round: number;
    timestamp: number;
  };
}

function success<T>(res: Response, data: T): void {
  updateLegacyRuntimePointers(activeModelId);
  const meta = {
    model: activeModelId,
    engineRunning: engine?.isRunning() ?? false,
    round: engine?.getRound() ?? 0,
    timestamp: Date.now(),
  };
  res.json({ ok: true, data, meta } as ApiResponse<T>);
}

function fail(res: Response, error: string, status: number = 400): void {
  res.status(status).json({ ok: false, error } as ApiResponse);
}

function writeSse(res: Response, event: string, data: any): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ─────────────────────────────────────────────
// GET /api/models — List available swarm models
// ─────────────────────────────────────────────

app.get(`${API_PREFIX}/models`, (_req: Request, res: Response) => {
  const runtime = shardManager.getRuntimeSnapshot();
  const activeModels = new Set(runtime.pools.filter((p) => p.shards > 0).map((p) => p.modelId));
  const models = listModels().map(m => ({
    id: m.id,
    name: m.name,
    description: m.description,
    costTier: m.costTier,
    active: activeModels.has(m.id),
    waitLimitsSec: getModelWaitLimits(m.id),
  }));
  success(res, { models });
});

// ─────────────────────────────────────────────
// GET /api/status — Engine status + ant counts
// ─────────────────────────────────────────────

app.get(`${API_PREFIX}/status`, (_req: Request, res: Response) => {
  const runtime = shardManager.getRuntimeSnapshot();
  updateLegacyRuntimePointers(runtime.activeModel);

  if (!runtime.running || !engine) {
    success(res, {
      running: false,
      model: runtime.activeModel,
      message: 'Engine is query-driven and auto-starts on POST /api/query. It auto-stops after idle timeout.',
      lifecycle: { mode: 'query-driven', idleAutoStopSec: IDLE_AUTO_STOP_MS / 1000 },
      queue: { depth: runtime.totalQueueDepth },
      qos: qosManager.getSnapshot(),
      shardPools: runtime.pools,
    });
    return;
  }
  success(res, {
    ...engine.getStats(),
    model: activeModelId,
    lifecycle: { mode: 'query-driven', idleAutoStopSec: IDLE_AUTO_STOP_MS / 1000 },
    queue: { depth: runtime.totalQueueDepth },
    qos: qosManager.getSnapshot(),
    shardPools: runtime.pools,
  });
});

app.get(`${API_PREFIX}/runtime-policy`, (_req: Request, res: Response) => {
  const eng = getReadEngine() || engine;
  success(res, eng?.getRuntimePolicy() || {
    crawlMode: 'robots-first',
    maxPagesPerDomainPerQuery: 5,
    maxTotalPagesPerQuery: 40,
    streamingSupported: true,
    providerKinds: ['search', 'feed', 'forum', 'sitemap', 'direct'],
  });
});

// ─────────────────────────────────────────────
// GET /api/health — Colony health report
// ─────────────────────────────────────────────

app.get(`${API_PREFIX}/health`, (_req: Request, res: Response) => {
  const eng = getReadEngine();
  if (!eng) { fail(res, 'Engine not running', 503); return; }
  const report = eng.getHealthReport();
  if (!report) { success(res, { message: 'No health report yet — waiting for first tick' }); return; }
  success(res, report);
});

// ─────────────────────────────────────────────
// GET /api/discover — What's trending / discovered
// ─────────────────────────────────────────────

app.get(`${API_PREFIX}/discover`, requireApiKey as any, (_req: Request, res: Response) => {
  const eng = getReadEngine((_req as any)._model);
  if (!eng) { fail(res, 'Engine not running', 503); return; }

  const limitStr = (Array.isArray(_req.query.limit) ? _req.query.limit[0] : _req.query.limit) as string | undefined;
  const limit = Math.min(50, parseInt(limitStr || '20', 10));
  const entities = eng.getDiscoveredEntities().slice(0, limit);
  const reports = eng.getAllReports().slice(0, limit);

  success(res, {
    discovered: entities,
    reports: reports.map(simplifyReport),
    totalEntities: entities.length,
    totalReports: reports.length,
  });
});

// ─────────────────────────────────────────────
// GET /api/analyze/:locationId — Deep analysis
// ─────────────────────────────────────────────

app.get(`${API_PREFIX}/analyze/:locationId`, requireApiKey as any, async (req: Request, res: Response) => {
  const eng = getReadEngine((req as any)._model);
  if (!eng) { fail(res, 'Engine not running', 503); return; }

  const rawId = req.params.locationId as string;
  // Try original case, then uppercase — entities are stored in mixed case
  let report = eng.getReport(rawId) || eng.getReport(rawId.toUpperCase());
  if (!report) {
    // Case-insensitive search across all reports
    const match = eng.getAllReports().find(r => r.locationId.toLowerCase() === rawId.toLowerCase());
    if (match) report = match;
  }
  const locationId = report?.locationId ?? rawId;

  if (!report) {
    // Check if the location exists in the pheromone space
    const space = eng.getSpace();
    let snapshot = await space.read(rawId);
    if (snapshot.signals.length === 0) {
      snapshot = await space.read(rawId.toUpperCase());
    }

    if (snapshot.signals.length === 0) {
      fail(res, `No data for "${rawId}". The swarm has not discovered or analyzed this entity yet.`, 404);
      return;
    }

    // Location exists but no harvester report yet — return raw snapshot
    success(res, {
      locationId,
      status: 'pending',
      message: 'Data exists but intelligence report not yet generated. Check back after the next tick.',
      rawSignals: snapshot.signals.map(s => ({
        type: s.type,
        strength: s.strength,
        contributors: s.contributorCount,
        ageMs: s.peakAge,
      })),
      totalConcentration: snapshot.totalConcentration,
      signalDiversity: snapshot.signalDiversity,
    });
    return;
  }

  success(res, report);
});

// ─────────────────────────────────────────────
// GET /api/reports — All intelligence reports
// ─────────────────────────────────────────────

app.get(`${API_PREFIX}/reports`, requireApiKey as any, (_req: Request, res: Response) => {
  const eng = getReadEngine((_req as any)._model);
  if (!eng) { fail(res, 'Engine not running', 503); return; }

  const limitStr2 = (Array.isArray(_req.query.limit) ? _req.query.limit[0] : _req.query.limit) as string | undefined;
  const limit = Math.min(100, parseInt(limitStr2 || '50', 10));
  const polarityRaw = (Array.isArray(_req.query.polarity) ? _req.query.polarity[0] : _req.query.polarity) as string | undefined;
  const polarity = polarityRaw as SignalPolarity | undefined;
  const minConvictionStr = (Array.isArray(_req.query.minConviction) ? _req.query.minConviction[0] : _req.query.minConviction) as string | undefined;
  const minConviction = parseFloat(minConvictionStr || '0');

  let reports: IntelligenceReport[];

  if (polarity) {
    reports = eng.getReportsByPolarity(polarity);
  } else {
    reports = eng.getAllReports();
  }

  if (minConviction > 0) {
    reports = reports.filter(r => r.conviction >= minConviction);
  }

  reports = reports.slice(0, limit);

  success(res, {
    reports: reports.map(simplifyReport),
    total: reports.length,
    filters: { polarity: polarity || 'all', minConviction, limit },
  });
});

// ─────────────────────────────────────────────
// GET /api/reports/top/:n — Top N reports
// ─────────────────────────────────────────────

app.get(`${API_PREFIX}/reports/top/:n`, requireApiKey as any, (_req: Request, res: Response) => {
  const eng = getReadEngine((_req as any)._model);
  if (!eng) { fail(res, 'Engine not running', 503); return; }

  const n = Math.min(50, Math.max(1, parseInt(_req.params.n as string, 10) || 10));
  const reports = eng.getTopReports(n);

  success(res, {
    reports: reports.map(simplifyReport),
    count: reports.length,
  });
});

// ─────────────────────────────────────────────
// GET /api/correlate — Cross-entity patterns
// ─────────────────────────────────────────────

app.get(`${API_PREFIX}/correlate`, requireApiKey as any, async (_req: Request, res: Response) => {
  const eng = getReadEngine((_req as any)._model);
  if (!eng) { fail(res, 'Engine not running', 503); return; }

  const reports = eng.getAllReports();
  const correlations: any[] = [];

  for (const report of reports) {
    if (report.correlations.length > 0) {
      correlations.push({
        locationId: report.locationId,
        polarity: report.polarity,
        conviction: report.conviction,
        correlations: report.correlations,
      });
    }
  }

  // Also check parent locations for convergence/divergence signals
  const space = eng.getSpace();
  const locationIds = await space.getLocationIds();
  const parentPatterns: any[] = [];

  for (const locId of locationIds) {
    if (!locId.includes(':')) continue; // Only check meta-locations (CATEGORY:, DOMAIN:, etc.)
    const snap = await space.read(locId);
    const convergence = snap.signals.find(s => s.type === 'convergence' as any);
    const divergence = snap.signals.find(s => s.type === 'divergence' as any);

    if ((convergence && convergence.strength > 0.1) || (divergence && divergence.strength > 0.1)) {
      parentPatterns.push({
        locationId: locId,
        convergence: convergence ? convergence.strength : 0,
        divergence: divergence ? divergence.strength : 0,
        totalConcentration: snap.totalConcentration,
      });
    }
  }

  success(res, {
    entityCorrelations: correlations,
    categoryPatterns: parentPatterns.sort((a, b) => (b.convergence + b.divergence) - (a.convergence + a.divergence)),
  });
});

// ─────────────────────────────────────────────
// GET /api/events — Recent engine event log
// ─────────────────────────────────────────────

app.get(`${API_PREFIX}/events`, requireApiKey as any, (_req: Request, res: Response) => {
  const eng = getReadEngine((_req as any)._model);
  if (!eng) { fail(res, 'Engine not running', 503); return; }

  const limitStr3 = (Array.isArray(_req.query.limit) ? _req.query.limit[0] : _req.query.limit) as string | undefined;
  const limit = Math.min(100, parseInt(limitStr3 || '30', 10));
  const typeFilter = (Array.isArray(_req.query.type) ? _req.query.type[0] : _req.query.type) as string | undefined;

  let events = eng.getEventLog(limit);
  if (typeFilter) {
    events = events.filter(e => e.type === typeFilter);
  }

  success(res, { events, count: events.length });
});

// ─────────────────────────────────────────────
// POST /api/query — Natural language → intelligence
// This is the primary LLM tool call endpoint
// ─────────────────────────────────────────────

app.post(`${API_PREFIX}/query`, requireApiKey as any, async (req: Request, res: Response) => {
  const requestStartedAt = Date.now();
  const { query, symbols, depth, stream, terrainHints, policyMode } = req.body as {
    query?: string;
    symbols?: string[];
    depth?: 'quick' | 'standard' | 'deep';
    stream?: boolean;
    terrainHints?: Array<'news' | 'forum' | 'docs' | 'academic' | 'company' | 'general-web' | 'social-signal'>;
    policyMode?: 'heuristic' | 'gru_shadow' | 'gru_live' | 'auto';
  };
  const modelUsed = (req as any)._model as string;
  const modelRequested = ((req as any)._modelRequested as string | null | undefined) ?? null;
  const timeoutRequestedSec = ((req as any)._timeoutRequestedSec as number | null | undefined) ?? null;
  const timeoutAcceptedSec = (req as any)._timeoutAcceptedSec as number | undefined;
  const timeoutLimitsSec = ((req as any)._timeoutLimits as ModelWaitLimitsSec | undefined) ?? getModelWaitLimits(modelUsed);

  if (!query && (!symbols || symbols.length === 0)) {
    fail(res, 'Provide "query" (text) and/or "symbols" (array of entity IDs)');
    return;
  }

  const tenantId = ((req as any).uid as string | undefined) || 'anonymous';
  const waitSec = timeoutAcceptedSec ?? timeoutLimitsSec.default;
  const streamRequested = Boolean(stream) || String(req.headers.accept || '').includes('text/event-stream');

  if (streamRequested) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
  }

  try {
    const results = await queryRouter.execute({ tenantId, modelId: modelUsed }, async (ticket) => {
      const eng = ticket.engine;
      activeModelId = ticket.modelId;
      engine = eng;
      return eng.executeQuery({
        query,
        symbols,
        depth,
        modelId: ticket.modelId,
        timeoutSec: waitSec,
        stream: streamRequested,
        terrainHints,
        policyMode,
      }, {
        queuePosition: ticket.queuePosition,
        queueWaitMs: ticket.queueWaitMs,
        autoStarted: ticket.autoStarted,
        restartedForModel: ticket.restartedForModel,
        coldStartMs: ticket.coldStartMs,
        modelRequested,
        timeoutRequestedSec,
        timeoutLimitsSec,
        shardId: ticket.shardId,
      }, streamRequested ? (payload) => writeSse(res, payload.type, payload.data) : undefined);
    });

    if (streamRequested) {
      writeSse(res, 'done', { ok: true, meta: { model: activeModelId, round: engine?.getRound() ?? 0, timestamp: Date.now() } });
      res.end();
      return;
    }
    success(res, results);
  } catch (err: any) {
    if (err instanceof QueryBackpressureError) {
      if (streamRequested) {
        writeSse(res, 'error', {
          ok: false,
          error: err.message,
          code: err.code,
          retryAfter: err.retryAfterSec,
        });
        res.end();
        return;
      }
      res.status(err.statusCode).json({
        ok: false,
        error: err.message,
        code: err.code,
        retryAfter: err.retryAfterSec,
      });
      return;
    }
    if (streamRequested) {
      writeSse(res, 'error', { ok: false, error: err?.message || 'Query failed' });
      res.end();
      return;
    }
    fail(res, err?.message || 'Query failed', 500);
  }
});

// ─────────────────────────────────────────────
// LLM Tool Definition endpoint
// Returns the OpenAI function calling schema
// ─────────────────────────────────────────────

app.get(`${API_PREFIX}/tool-definition`, (_req: Request, res: Response) => {
  success(res, {
    name: 'swarm_query',
    description: 'Query the Rylvo open-web adaptive swarm. It explores public web sources under a strict timeout budget, returns evidence-ranked topic resolutions, and can stream partial updates while discovery is in progress.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What you want to know. Best for emerging topics, ambiguous entities, or real-time public-web discovery questions.',
        },
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific topics/entities/phrases to resolve. E.g. ["smart drugs", "India", "AI chip export controls"]',
        },
        model: {
          type: 'string',
          enum: ['discover', 'precise', 'correlate', 'sentiment', 'full'],
          description: 'Query-scoped model selection. Runtime routes this query to a shard pool for the selected model (auto-start on demand). If omitted, server chooses a plan-aware default.',
        },
        depth: {
          type: 'string',
          enum: ['quick', 'standard', 'deep'],
          description: 'How detailed the response should be',
        },
        timeout: {
          type: 'number',
          description: 'Strict client wait budget in seconds (server does not extend it). Model-specific bounds apply; out-of-range values return 400 with { model, minSec, defaultSec, maxSec }. discover/correlate/full: 20-120 (default 45), precise: 15-90 (default 35), sentiment: 10-60 (default 25).',
        },
        stream: {
          type: 'boolean',
          description: 'If true, or if Accept: text/event-stream is used, the server streams lifecycle events: query_started, plan_ready, sources_discovered, evidence_added, policy_step, policy_fallback, policy_trace_ready, resolution_updated, coverage_updated, final.',
        },
        policyMode: {
          type: 'string',
          enum: ['heuristic', 'gru_shadow', 'gru_live', 'auto'],
          description: 'Policy controller mode. heuristic is the safe default. gru_shadow scores actions without executing them. gru_live executes GRU choices with heuristic fallback. auto behaves like gru_live when a model artifact is available and falls back otherwise.',
        },
        terrainHints: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['news', 'forum', 'docs', 'academic', 'company', 'general-web', 'social-signal'],
          },
          description: 'Optional hints to bias the terrain planner toward specific source types.',
        },
      },
    },
  });
});

// ─────────────────────────────────────────────
// AUTH MIDDLEWARE — verify Firebase ID token
// (for console/dashboard endpoints)
// ─────────────────────────────────────────────

async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log(`[AUTH] ❌ Missing Authorization header for ${req.method} ${req.url}`);
    res.status(401).json({ ok: false, error: 'Missing Authorization header' });
    return;
  }
  const token = authHeader.split('Bearer ')[1];

  // Try Firebase ID token first (console), then API key (external)
  const decoded = await verifyIdToken(token);
  if (!decoded) {
    console.log(`[AUTH] ❌ Invalid token for ${req.method} ${req.url} (token prefix: ${token.substring(0, 20)}...)`);
    res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    return;
  }
  console.log(`[AUTH] ✅ ${decoded.email} → ${req.method} ${req.url}`);
  (req as any).uid = decoded.uid;
  (req as any).email = decoded.email;
  next();
}

// ─────────────────────────────────────────────
// API KEY MIDDLEWARE — for external API calls
// Validates sk_live_swr_ key → rate limit → deduct credits → log
// ─────────────────────────────────────────────

async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const startTime = Date.now();
  const authHeader = req.headers.authorization || req.headers['x-api-key'] as string;
  let rawKey: string | undefined;
  const requestedModelRaw = (
    typeof req.body?.model === 'string' ? req.body.model
      : typeof req.query.model === 'string' ? req.query.model
        : undefined
  );

  if (authHeader && typeof authHeader === 'string') {
    rawKey = authHeader.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : authHeader;
  }

  if (!rawKey) {
    res.status(401).json({ ok: false, error: 'Missing API key. Include Authorization: Bearer sk_live_swr_... header.' });
    return;
  }

  // If it's a Firebase ID token (from console), fall through to requireAuth logic
  if (!rawKey.startsWith('sk_')) {
    const decoded = await verifyIdToken(rawKey);
    if (decoded) {
      const plan = await getUserPlan(decoded.uid);
      const allowedModels = PLANS[plan]?.models || ['discover', 'sentiment'];
      const runningModel = shardManager.getPreferredRunningModel(allowedModels);
      const modelResolution = resolveRequestModel(requestedModelRaw, plan, runningModel);
      if (!allowedModels.includes(modelResolution.resolved)) {
        res.status(403).json({
          ok: false,
          error: `Model "${modelResolution.resolved}" not available on ${plan} plan. Available: ${allowedModels.join(', ')}. Upgrade at /pricing.`,
        });
        return;
      }

      if (req.method === 'POST' && req.path === `${API_PREFIX}/query`) {
        const timeoutValidation = normalizeTimeoutForModel(req.body?.timeout, modelResolution.resolved);
        if (!timeoutValidation.ok) {
          res.status(400).json({
            ok: false,
            error: timeoutValidation.error,
            data: {
              model: modelResolution.resolved,
              minSec: timeoutValidation.limits.min,
              defaultSec: timeoutValidation.limits.default,
              maxSec: timeoutValidation.limits.max,
            },
          });
          return;
        }
        (req as any)._timeoutRequestedSec = timeoutValidation.requestedSec;
        (req as any)._timeoutAcceptedSec = timeoutValidation.acceptedSec;
        (req as any)._timeoutLimits = timeoutValidation.limits;
      }

      (req as any).uid = decoded.uid;
      (req as any).email = decoded.email;
      (req as any).plan = plan;
      (req as any)._startTime = startTime;
      (req as any)._model = modelResolution.resolved;
      (req as any)._modelRequested = modelResolution.requested;
      (req as any)._credits = 0;
      next();
      return;
    }
    res.status(401).json({ ok: false, error: 'Invalid API key or token.' });
    return;
  }

  // Validate API key
  const keyResult = await validateApiKey(rawKey);
  if (!keyResult) {
    res.status(401).json({ ok: false, error: 'Invalid or revoked API key.' });
    return;
  }

  const { uid, keyId } = keyResult;

  // Get user plan for rate limiting + model access
  const plan = await getUserPlan(uid);

  // Rate limit check
  const rateCheck = await checkRateLimit(uid, plan);
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);
  res.setHeader('X-RateLimit-Reset', rateCheck.resetInSec);

  if (!rateCheck.ok) {
    res.status(429).json({
      ok: false,
      error: `Rate limit exceeded. ${PLANS[plan]?.rateLimit || 10} requests/minute on ${plan} plan.`,
      retryAfter: rateCheck.resetInSec,
    });
    return;
  }

  const allowedModels = PLANS[plan]?.models || ['discover', 'sentiment'];
  const runningModel = shardManager.getPreferredRunningModel(allowedModels);
  const modelResolution = resolveRequestModel(requestedModelRaw, plan, runningModel);
  const model = modelResolution.resolved;

  // Check model access for plan
  if (!allowedModels.includes(model)) {
    res.status(403).json({
      ok: false,
      error: `Model "${model}" not available on ${plan} plan. Available: ${allowedModels.join(', ')}. Upgrade at /pricing.`,
    });
    return;
  }

  if (req.method === 'POST' && req.path === `${API_PREFIX}/query`) {
    const timeoutValidation = normalizeTimeoutForModel(req.body?.timeout, model);
    if (!timeoutValidation.ok) {
      res.status(400).json({
        ok: false,
        error: timeoutValidation.error,
        data: {
          model,
          minSec: timeoutValidation.limits.min,
          defaultSec: timeoutValidation.limits.default,
          maxSec: timeoutValidation.limits.max,
        },
      });
      return;
    }
    (req as any)._timeoutRequestedSec = timeoutValidation.requestedSec;
    (req as any)._timeoutAcceptedSec = timeoutValidation.acceptedSec;
    (req as any)._timeoutLimits = timeoutValidation.limits;
  }

  // Deduct credits
  const creditResult = await deductCredits(uid, model);
  res.setHeader('X-Credits-Remaining', creditResult.remaining);

  if (!creditResult.ok) {
    res.status(429).json({
      ok: false,
      error: creditResult.error,
      creditsRemaining: creditResult.remaining,
    });
    return;
  }

  // Attach to request for downstream use
  (req as any).uid = uid;
  (req as any).keyId = keyId;
  (req as any).plan = plan;
  (req as any)._startTime = startTime;
  (req as any)._model = model;
  (req as any)._modelRequested = modelResolution.requested;
  (req as any)._credits = MODEL_CREDIT_COST[model] || 5;

  // Log request after response is sent
  const origEnd = res.end;
  (res as any).end = function (...args: any[]) {
    const latencyMs = Date.now() - startTime;
    logApiRequest(uid, {
      method: req.method,
      endpoint: req.originalUrl || req.url,
      model,
      credits: MODEL_CREDIT_COST[model] || 5,
      status: res.statusCode,
      latencyMs,
      keyId,
    }).catch(() => {});
    return origEnd.apply(res, args);
  };

  next();
}

// ─────────────────────────────────────────────
// AUTH ENDPOINTS — user data, API keys, usage
// ─────────────────────────────────────────────

// GET /api/me — current user data from Firestore
app.get(`${API_PREFIX}/me`, requireAuth as any, async (req: Request, res: Response) => {
  const uid = (req as any).uid;
  const email = (req as any).email;
  let userDoc = await db.collection(COLLECTIONS.USERS).doc(uid).get();

  if (!userDoc.exists) {
    // Safety net: create user doc if /api/sync-user wasn't called
    await syncUserDocument(uid, { email });
    userDoc = await db.collection(COLLECTIONS.USERS).doc(uid).get();
  }

  success(res, userDoc.data());
});

// GET /api/keys — list API keys
app.get(`${API_PREFIX}/keys`, requireAuth as any, async (req: Request, res: Response) => {
  const uid = (req as any).uid;
  const snap = await db.collection(COLLECTIONS.USERS).doc(uid)
    .collection(COLLECTIONS.API_KEYS).orderBy('createdAt', 'desc').get();
  const keys = snap.docs.map(d => ({
    id: d.id,
    name: d.data().name,
    prefix: d.data().prefix,
    active: d.data().active,
    createdAt: d.data().createdAt?.toDate?.() || null,
    lastUsedAt: d.data().lastUsedAt?.toDate?.() || null,
  }));
  success(res, { keys });
});

// POST /api/keys — create a new API key
app.post(`${API_PREFIX}/keys`, requireAuth as any, async (req: Request, res: Response) => {
  const uid = (req as any).uid;
  const { name } = req.body as { name?: string };
  if (!name) { fail(res, 'Key name is required'); return; }

  const { key, hash, prefix } = generateApiKey();

  await db.collection(COLLECTIONS.USERS).doc(uid)
    .collection(COLLECTIONS.API_KEYS).add({
      name,
      hash,
      prefix,
      active: true,
      createdAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
      lastUsedAt: null,
    });

  // Return the raw key ONCE — it won't be retrievable again
  success(res, { key, prefix, name, message: 'Save this key now. It will not be shown again.' });
});

// DELETE /api/keys/:keyId — revoke an API key
app.delete(`${API_PREFIX}/keys/:keyId`, requireAuth as any, async (req: Request, res: Response) => {
  const uid = (req as any).uid;
  const keyId = req.params.keyId as string;
  const keyRef = db.collection(COLLECTIONS.USERS).doc(uid)
    .collection(COLLECTIONS.API_KEYS).doc(keyId);
  const keyDoc = await keyRef.get();
  if (!keyDoc.exists) { fail(res, 'Key not found', 404); return; }
  await keyRef.update({ active: false });
  success(res, { message: 'Key revoked' });
});

// GET /api/usage — monthly usage data
app.get(`${API_PREFIX}/usage`, requireAuth as any, async (req: Request, res: Response) => {
  const uid = (req as any).uid;
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const usageRef = db.collection(COLLECTIONS.USERS).doc(uid)
    .collection(COLLECTIONS.USAGE).doc(monthKey);
  const usageDoc = await usageRef.get();
  success(res, {
    month: monthKey,
    usage: usageDoc.exists ? usageDoc.data() : { totalCredits: 0, totalCalls: 0, byModel: {}, dailyBreakdown: {} },
  });
});

// POST /api/sync-user — called after EVERY auth action (login, signup, social)
// This is the ONLY way user docs are created/updated in Firestore.
// Uses Admin SDK → bypasses all Firestore security rules.
app.post(`${API_PREFIX}/sync-user`, requireAuth as any, async (req: Request, res: Response) => {
  const uid = (req as any).uid;
  const email = (req as any).email;
  const { displayName, photoURL, provider } = req.body as {
    displayName?: string;
    photoURL?: string;
    provider?: string;
  };

  try {
    const result = await syncUserDocument(uid, {
      email,
      displayName: displayName || null,
      photoURL: photoURL || null,
      provider: provider || 'email',
    });

    // Fetch the full user doc to return
    const userDoc = await db.collection(COLLECTIONS.USERS).doc(uid).get();
    success(res, {
      message: result.created ? 'User created' : 'User synced',
      created: result.created,
      user: userDoc.data(),
    });
  } catch (err: any) {
    console.error('❌ sync-user failed:', err.message);
    fail(res, 'Failed to sync user: ' + err.message, 500);
  }
});

// PATCH /api/settings — update user profile & notification preferences
app.patch(`${API_PREFIX}/settings`, requireAuth as any, async (req: Request, res: Response) => {
  const uid = (req as any).uid;
  const { displayName, photoURL, webhookUrl, alertThreshold, emailNotifications } = req.body as {
    displayName?: string;
    photoURL?: string;
    webhookUrl?: string;
    alertThreshold?: number;
    emailNotifications?: { usageAlerts?: boolean; weeklyReport?: boolean; securityAlerts?: boolean };
  };

  const updates: Record<string, any> = {};

  // Profile fields
  if (displayName !== undefined) {
    if (typeof displayName !== 'string' || displayName.trim().length < 1 || displayName.length > 100) {
      fail(res, 'Display name must be 1-100 characters'); return;
    }
    updates.displayName = displayName.trim();
  }
  if (photoURL !== undefined) {
    if (photoURL && typeof photoURL === 'string' && photoURL.length > 2048) {
      fail(res, 'Photo URL too long'); return;
    }
    updates.photoURL = photoURL || null;
  }

  // Notification preferences (stored in settings sub-object)
  if (webhookUrl !== undefined) {
    if (webhookUrl && !/^https?:\/\/.+/.test(webhookUrl)) {
      fail(res, 'Webhook URL must be a valid HTTP(S) URL'); return;
    }
    updates['settings.webhookUrl'] = webhookUrl || null;
  }
  if (alertThreshold !== undefined) {
    const t = Number(alertThreshold);
    if (isNaN(t) || t < 0 || t > 100) {
      fail(res, 'Alert threshold must be 0-100'); return;
    }
    updates['settings.alertThreshold'] = t;
  }
  if (emailNotifications !== undefined) {
    if (typeof emailNotifications === 'object') {
      if (emailNotifications.usageAlerts !== undefined) updates['settings.emailNotifications.usageAlerts'] = !!emailNotifications.usageAlerts;
      if (emailNotifications.weeklyReport !== undefined) updates['settings.emailNotifications.weeklyReport'] = !!emailNotifications.weeklyReport;
      if (emailNotifications.securityAlerts !== undefined) updates['settings.emailNotifications.securityAlerts'] = !!emailNotifications.securityAlerts;
    }
  }

  if (Object.keys(updates).length === 0) {
    fail(res, 'No valid fields to update'); return;
  }

  updates.updatedAt = firebaseAdmin.firestore.FieldValue.serverTimestamp();
  await db.collection(COLLECTIONS.USERS).doc(uid).update(updates);

  const userDoc = await db.collection(COLLECTIONS.USERS).doc(uid).get();
  success(res, { message: 'Settings updated', user: userDoc.data() });
});

// POST /api/export-data — export all user data as JSON
app.post(`${API_PREFIX}/export-data`, requireAuth as any, async (req: Request, res: Response) => {
  const uid = (req as any).uid;

  const userDoc = await db.collection(COLLECTIONS.USERS).doc(uid).get();
  if (!userDoc.exists) { fail(res, 'User not found', 404); return; }

  // Gather all subcollections
  const keysSnap = await db.collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.API_KEYS).get();
  const usageSnap = await db.collection(COLLECTIONS.USERS).doc(uid).collection(COLLECTIONS.USAGE).get();
  const logsSnap = await db.collection(COLLECTIONS.USERS).doc(uid).collection('requestLogs').orderBy('timestamp', 'desc').limit(500).get();

  const exportData = {
    exportedAt: new Date().toISOString(),
    profile: userDoc.data(),
    apiKeys: keysSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    usage: usageSnap.docs.map(d => ({ month: d.id, ...d.data() })),
    requestLogs: logsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
  };

  success(res, exportData);
});

// DELETE /api/account — permanently delete user account and all data
app.delete(`${API_PREFIX}/account`, requireAuth as any, async (req: Request, res: Response) => {
  const uid = (req as any).uid;
  const { confirmation } = req.body as { confirmation?: string };

  if (confirmation !== 'DELETE_MY_ACCOUNT') {
    fail(res, 'Must send { confirmation: "DELETE_MY_ACCOUNT" } to confirm'); return;
  }

  try {
    // Delete all subcollections
    const subcollections = ['apiKeys', 'usage', 'requestLogs', 'invoices'];
    for (const sub of subcollections) {
      const snap = await db.collection(COLLECTIONS.USERS).doc(uid).collection(sub).get();
      const batch = db.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      if (snap.docs.length > 0) await batch.commit();
    }

    // Delete user document
    await db.collection(COLLECTIONS.USERS).doc(uid).delete();

    // Delete Firebase Auth user
    try { await adminAuth.deleteUser(uid); } catch (e: any) {
      console.warn('Could not delete auth user:', e.message);
    }

    success(res, { message: 'Account permanently deleted' });
  } catch (err: any) {
    console.error('Account deletion failed:', err.message);
    fail(res, 'Failed to delete account: ' + err.message, 500);
  }
});

// GET /api/request-logs — recent API call history for the console
app.get(`${API_PREFIX}/request-logs`, requireAuth as any, async (req: Request, res: Response) => {
  const uid = (req as any).uid;
  const limitStr = (Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit) as string | undefined;
  const limitN = Math.min(100, parseInt(limitStr || '30', 10));
  const logs = await getRequestLogs(uid, limitN);
  success(res, { logs, count: logs.length });
});

// ─────────────────────────────────────────────
// ADMIN MIDDLEWARE — requires auth + admin role
// ─────────────────────────────────────────────

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  // First verify auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, error: 'Missing Authorization header' });
    return;
  }
  const token = authHeader.split('Bearer ')[1];
  const decoded = await verifyIdToken(token);
  if (!decoded) {
    res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    return;
  }
  (req as any).uid = decoded.uid;
  (req as any).email = decoded.email;

  // Then check admin role
  const admin = await isAdmin(decoded.uid);
  if (!admin) {
    res.status(403).json({ ok: false, error: 'Admin access required' });
    return;
  }
  next();
}

// ─────────────────────────────────────────────
// ADMIN ENDPOINTS
// ─────────────────────────────────────────────

// GET /api/admin/stats — system-wide statistics
app.get(`${API_PREFIX}/admin/stats`, requireAdmin as any, async (_req: Request, res: Response) => {
  const stats = await getSystemStats();
  const runtime = shardManager.getRuntimeSnapshot();
  updateLegacyRuntimePointers(runtime.activeModel);
  const engineStats = engine?.getStats();
  // Add runtime info
  stats.engineRunning = runtime.running;
  stats.engineModel = runtime.activeModel;
  stats.engineRound = engine?.getRound() ?? 0;
  stats.engineLifecycle = 'query-driven';
  stats.idleAutoStopSec = IDLE_AUTO_STOP_MS / 1000;
  stats.queueDepth = runtime.totalQueueDepth;
  stats.runningModels = runtime.pools.length;
  stats.shardPools = runtime.pools;
  stats.qos = qosManager.getSnapshot();
  stats.runtimePolicy = engineStats?.runtimePolicy || null;
  stats.executionPlan = engineStats?.executionPlan || null;
  stats.lastQueryMeta = engineStats?.lastQueryMeta || null;
  stats.sourceCoverage = engineStats?.sourceCoverage || null;
  stats.topicsTracked = engineStats?.topicsTracked || 0;
  stats.evidenceStored = engineStats?.evidenceStored || 0;
  success(res, stats);
});

// GET /api/admin/users — list all users
app.get(`${API_PREFIX}/admin/users`, requireAdmin as any, async (req: Request, res: Response) => {
  const limitStr = (Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit) as string | undefined;
  const limitN = Math.min(200, parseInt(limitStr || '50', 10));
  const users = await listAllUsers(limitN);
  success(res, { users, count: users.length });
});

// GET /api/admin/users/:uid — single user detail
app.get(`${API_PREFIX}/admin/users/:uid`, requireAdmin as any, async (req: Request, res: Response) => {
  const uid = req.params.uid as string;
  const userDoc = await db.collection(COLLECTIONS.USERS).doc(uid).get();
  if (!userDoc.exists) { fail(res, 'User not found', 404); return; }

  // Also get their API keys and recent usage
  const keysSnap = await db.collection(COLLECTIONS.USERS).doc(uid)
    .collection(COLLECTIONS.API_KEYS).orderBy('createdAt', 'desc').get();
  const keys = keysSnap.docs.map(d => ({
    id: d.id, name: d.data().name, prefix: d.data().prefix,
    active: d.data().active, createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
  }));

  const logs = await getRequestLogs(uid, 20);

  const userData = userDoc.data();
  success(res, {
    uid,
    ...userData,
    createdAt: userData?.createdAt?.toDate?.()?.toISOString() || null,
    lastLoginAt: userData?.lastLoginAt?.toDate?.()?.toISOString() || null,
    apiKeys: keys,
    recentLogs: logs,
  });
});

// PUT /api/admin/users/:uid — update user (plan, credits, role)
app.put(`${API_PREFIX}/admin/users/:uid`, requireAdmin as any, async (req: Request, res: Response) => {
  const uid = req.params.uid as string;
  const updates = req.body;

  // If changing plan, also update credits
  if (updates.plan && PLANS[updates.plan]) {
    updates.creditsTotal = PLANS[updates.plan].creditsPerMonth;
  }

  await updateUserByAdmin(uid, updates);
  success(res, { message: `User ${uid} updated`, updates });
});

// GET /api/admin/check — quick check if current user is admin
app.get(`${API_PREFIX}/admin/check`, requireAuth as any, async (req: Request, res: Response) => {
  const uid = (req as any).uid;
  const admin = await isAdmin(uid);
  success(res, { isAdmin: admin });
});

// ─────────────────────────────────────────────
// Product Site — static files from public/site/
// ─────────────────────────────────────────────

const siteDir = path.join(__dirname, '..', 'public', 'site');
const siteBuildDir = path.join(siteDir, 'dist');
const noStoreHtmlHeaders = (res: Response, filePath: string): void => {
  if (filePath.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
};

// Serve Vite build output first (built React landing page JS/CSS assets)
app.use(express.static(siteBuildDir, { setHeaders: noStoreHtmlHeaders as any }));

// Serve all static files from public/site/ at root (CSS, images, .html files)
app.use(express.static(siteDir, { setHeaders: noStoreHtmlHeaders as any }));

// Clean URL routes → serve .html files without extension
const sitePages = ['pricing', 'docs', 'login', 'signup', 'console', 'admin', 'playground'];
for (const page of sitePages) {
  app.get(`/${page}`, (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(path.join(siteDir, `${page}.html`));
  });
}

// Root route — serve the Vite-built landing page
app.get('/', (_req: Request, res: Response) => {
  const builtIndex = path.join(siteBuildDir, 'index.html');
  if (fs.existsSync(builtIndex)) {
    res.sendFile(builtIndex);
  } else {
    res.sendFile(path.join(siteDir, 'index.html'));
  }
});

// Internal dashboard (swarm monitoring)
app.get('/dashboard', (_req: Request, res: Response) => {
  const htmlPath = path.join(__dirname, '..', 'public', 'dashboard.html');
  fs.readFile(htmlPath, 'utf-8', (err, data) => {
    if (err) { res.status(500).send('Dashboard file not found'); return; }
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(data);
  });
});

// ─────────────────────────────────────────────
// TEST / DIAGNOSTIC ENDPOINTS (admin-only)
// Used by the Testing Ground playground
// ─────────────────────────────────────────────

// GET /api/test/ping — simple latency test
app.get(`${API_PREFIX}/test/ping`, (_req: Request, res: Response) => {
  success(res, { pong: true, timestamp: Date.now(), serverTime: new Date().toISOString() });
});

// GET /api/test/snapshot — full pheromone space snapshot (admin)
app.get(`${API_PREFIX}/test/snapshot`, requireAdmin as any, async (_req: Request, res: Response) => {
  const eng = getReadEngine();
  if (!eng) { fail(res, 'Engine not running', 503); return; }
  const space = eng.getSpace();
  const locationIds = await space.getLocationIds();
  const snapshot: any[] = [];
  for (const locId of locationIds) {
    const snap = await space.read(locId);
    if (snap.totalConcentration > 0.01) {
      snapshot.push({
        locationId: locId,
        totalConcentration: snap.totalConcentration,
        signalDiversity: snap.signalDiversity,
        signals: snap.signals.map(s => ({ type: s.type, strength: s.strength, contributors: s.contributorCount, ageMs: s.peakAge })),
      });
    }
  }
  snapshot.sort((a, b) => b.totalConcentration - a.totalConcentration);
  success(res, { locations: snapshot, count: snapshot.length });
});

// GET /api/test/config — current engine configuration (admin)
app.get(`${API_PREFIX}/test/config`, requireAdmin as any, (_req: Request, res: Response) => {
  const eng = getReadEngine();
  if (!eng) { fail(res, 'Engine not running', 503); return; }
  success(res, { config: eng.getConfig(), model: activeModelId });
});

// POST /api/test/stress — run N sequential queries to test throughput (admin)
app.post(`${API_PREFIX}/test/stress`, requireAdmin as any, async (req: Request, res: Response) => {
  const { count = 5, endpoint = '/api/status' } = req.body as { count?: number; endpoint?: string };
  const n = Math.min(20, Math.max(1, count));
  const results: { iteration: number; latencyMs: number; status: number }[] = [];
  for (let i = 0; i < n; i++) {
    const start = Date.now();
    try {
      const r = await fetch(`http://localhost:${PORT}${endpoint}`);
      results.push({ iteration: i + 1, latencyMs: Date.now() - start, status: r.status });
    } catch {
      results.push({ iteration: i + 1, latencyMs: Date.now() - start, status: 0 });
    }
  }
  const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b);
  success(res, {
    results,
    summary: {
      total: n,
      avgMs: Math.round(latencies.reduce((a, b) => a + b, 0) / n),
      minMs: latencies[0],
      maxMs: latencies[latencies.length - 1],
      p95Ms: latencies[Math.floor(n * 0.95)],
    },
  });
});

// API docs JSON fallback
app.get('/api-docs', (_req: Request, res: Response) => {
  res.json({
    name: 'Rylvo API',
    version: '0.1.0',
    site: '/',
    dashboard: '/dashboard',
    endpoints: {
      models: 'GET /api/models',
      status: 'GET /api/status',
      health: 'GET /api/health',
      discover: 'GET /api/discover',
      analyze: 'GET /api/analyze/:locationId',
      reports: 'GET /api/reports',
      topReports: 'GET /api/reports/top/:n',
      correlate: 'GET /api/correlate',
      events: 'GET /api/events',
      query: 'POST /api/query',
      toolDefinition: 'GET /api/tool-definition',
      testPing: 'GET /api/test/ping',
      testSnapshot: 'GET /api/test/snapshot',
      testConfig: 'GET /api/test/config',
      testStress: 'POST /api/test/stress',
      websocket: 'WS /ws',
      playground: '/playground',
    },
  });
});

// ─────────────────────────────────────────────
// Helper: simplify report for list views
// ─────────────────────────────────────────────

function simplifyReport(r: IntelligenceReport): any {
  return {
    locationId: r.locationId,
    polarity: r.polarity,
    conviction: r.conviction,
    confidence: r.confidence,
    signalCount: r.signals.length,
    topSignals: r.signals.slice(0, 3).map(s => ({ type: s.type, strength: s.strength })),
    correlationCount: r.correlations.length,
    quality: r.quality.qualityScore,
    freshness: r.dataFreshnessMs,
    summary: r.summary,
    generatedAt: r.generatedAt,
  };
}

// ─────────────────────────────────────────────
// HTTP + WebSocket Server
// ─────────────────────────────────────────────

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  wsClients.add(ws);

  // Send current status on connect
  const runtime = shardManager.getRuntimeSnapshot();
  updateLegacyRuntimePointers(runtime.activeModel);
  if (engine) {
    ws.send(JSON.stringify({
      type: 'status',
      data: {
        ...engine.getStats(),
        model: activeModelId,
        queue: { depth: runtime.totalQueueDepth },
        shardPools: runtime.pools,
      },
    }));
  } else {
    ws.send(JSON.stringify({
      type: 'status',
      data: {
        running: false,
        model: runtime.activeModel,
        queue: { depth: runtime.totalQueueDepth },
        shardPools: runtime.pools,
      },
    }));
  }

  ws.on('close', () => wsClients.delete(ws));
});

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\n  🐜 RYLVO API → http://localhost:${PORT}`);
  console.log(`  📡 WebSocket      → ws://localhost:${PORT}/ws`);
  console.log(`  📖 Docs           → http://localhost:${PORT}/`);
  console.log(`  🧪 Testing Ground → http://localhost:${PORT}/playground`);
  console.log(`\n  Query-driven shard runtime enabled: POST /api/query auto-starts model shards, applies QoS/backpressure, and idles shards out after ${IDLE_AUTO_STOP_MS / 1000}s.\n`);
});

process.on('SIGINT', async () => {
  await shardManager.stopAll('sigint');
  server.close();
  process.exit(0);
});
