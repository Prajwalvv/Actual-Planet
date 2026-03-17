/**
 * FIREBASE ADMIN SDK — Server-side initialization
 * 
 * Used by the API server for:
 * - Verifying Firebase Auth ID tokens
 * - Reading/writing Firestore (users, API keys, credits, reports)
 * - Creating user documents on signup
 */

import * as admin from 'firebase-admin';
import path from 'path';
import Redis from 'ioredis';

// ─── Initialize Admin SDK ────────────────────

const serviceAccountPath = path.join(__dirname, '..', 'rylvo-vid-firebase-adminsdk-fbsvc-298fc1f402.json');

let app: admin.app.App;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const serviceAccount = require(serviceAccountPath);
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'rylvo-vid',
  });
} catch (err) {
  console.warn('⚠️  Firebase Admin SDK init failed. Using default credentials.');
  app = admin.initializeApp({
    projectId: 'rylvo-vid',
  });
}

// ─── Exports ─────────────────────────────────

export const firebaseAdmin = admin;
export const db = admin.firestore();
export const auth = admin.auth();

// ─── Firestore Collections ───────────────────

export const COLLECTIONS = {
  USERS: 'users',
  API_KEYS: 'apiKeys',
  USAGE: 'usage',
  INVOICES: 'invoices',
  REPORTS: 'reports',
  DISCOVERIES: 'discoveries',
  SWARM_INSTANCES: 'swarmInstances',
} as const;

// ─── Plan Definitions ────────────────────────

export interface PlanConfig {
  id: string;
  name: string;
  creditsPerMonth: number;
  rateLimit: number;        // queries per minute
  models: string[];
  priceUsd: number;
}

export const PLANS: Record<string, PlanConfig> = {
  free: {
    id: 'free',
    name: 'Starter',
    creditsPerMonth: 10_000,
    rateLimit: 10,
    models: ['discover', 'sentiment'],
    priceUsd: 0,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    creditsPerMonth: 100_000,
    rateLimit: 60,
    models: ['discover', 'precise', 'correlate', 'sentiment', 'full'],
    priceUsd: 49,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    creditsPerMonth: Infinity,
    rateLimit: Infinity,
    models: ['discover', 'precise', 'correlate', 'sentiment', 'full'],
    priceUsd: -1, // custom
  },
};

// ─── Credit Costs per Model ──────────────────

export const MODEL_CREDIT_COST: Record<string, number> = {
  discover: 1,
  sentiment: 1,
  precise: 3,
  correlate: 3,
  full: 5,
};

// ─── Admin Emails ───────────────────────────
// Add your admin emails here. These users get role:'admin' on signup.
export const ADMIN_EMAILS: string[] = [
  'prajwalv.v@gmail.com',
  // Add more admin emails as needed
];

// ─── Helper: Check if user is admin ─────────

export async function isAdmin(uid: string): Promise<boolean> {
  const userDoc = await db.collection(COLLECTIONS.USERS).doc(uid).get();
  if (!userDoc.exists) return false;
  return userDoc.data()?.role === 'admin';
}

// ─── Helper: Sync user document (create or update) ──

export interface SyncUserData {
  email: string;
  displayName?: string | null;
  photoURL?: string | null;
  provider?: string; // 'email' | 'google.com' | 'github.com'
}

export async function syncUserDocument(uid: string, data: SyncUserData): Promise<{ created: boolean }> {
  const userRef = db.collection(COLLECTIONS.USERS).doc(uid);
  const existing = await userRef.get();

  if (existing.exists) {
    // ── RETURNING USER: update lastLoginAt + any new info ──
    const updates: Record<string, any> = {
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Update displayName/photoURL if they were null before and now provided
    const current = existing.data()!;
    if (data.displayName && !current.displayName) updates.displayName = data.displayName;
    if (data.photoURL && !current.photoURL) updates.photoURL = data.photoURL;
    if (data.provider && !current.providers?.includes(data.provider)) {
      updates.providers = admin.firestore.FieldValue.arrayUnion(data.provider);
    }

    // Auto-upgrade admin emails that were created before admin role was added
    if (data.email && ADMIN_EMAILS.includes(data.email.toLowerCase()) && current.role !== 'admin') {
      updates.role = 'admin';
      updates.plan = 'enterprise';
      updates.creditsTotal = 999_999_999;
    }

    await userRef.update(updates);
    return { created: false };
  }

  // ── NEW USER: create full document ──
  const isAdminUser = ADMIN_EMAILS.includes(data.email.toLowerCase());
  const role = isAdminUser ? 'admin' : 'user';

  await userRef.set({
    email: data.email,
    displayName: data.displayName || data.email.split('@')[0],
    photoURL: data.photoURL || null,
    role,
    plan: isAdminUser ? 'enterprise' : 'free',
    creditsTotal: isAdminUser ? 999_999_999 : PLANS.free.creditsPerMonth,
    creditsUsed: 0,
    providers: data.provider ? [data.provider] : ['email'],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { created: true };
}

// Backward compat wrapper
export async function createUserDocument(uid: string, email: string, displayName: string | null): Promise<void> {
  await syncUserDocument(uid, { email, displayName });
}

// ─── Admin Helpers ──────────────────────────

export async function listAllUsers(limitN: number = 50): Promise<any[]> {
  const snap = await db.collection(COLLECTIONS.USERS)
    .orderBy('createdAt', 'desc')
    .limit(limitN)
    .get();
  return snap.docs.map(d => ({
    uid: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
    lastLoginAt: d.data().lastLoginAt?.toDate?.()?.toISOString() || null,
  }));
}

export async function getSystemStats(): Promise<any> {
  const usersSnap = await db.collection(COLLECTIONS.USERS).get();
  const totalUsers = usersSnap.size;

  let totalCreditsUsed = 0;
  let totalCreditsTotal = 0;
  const planCounts: Record<string, number> = { free: 0, pro: 0, enterprise: 0 };

  usersSnap.docs.forEach(d => {
    const data = d.data();
    totalCreditsUsed += data.creditsUsed || 0;
    totalCreditsTotal += data.creditsTotal || 0;
    planCounts[data.plan || 'free'] = (planCounts[data.plan || 'free'] || 0) + 1;
  });

  return {
    totalUsers,
    planCounts,
    totalCreditsUsed,
    totalCreditsTotal,
    creditUtilization: totalCreditsTotal > 0 ? (totalCreditsUsed / totalCreditsTotal * 100).toFixed(1) + '%' : '0%',
  };
}

export async function updateUserByAdmin(uid: string, updates: Record<string, any>): Promise<void> {
  const allowed = ['plan', 'creditsTotal', 'creditsUsed', 'role'];
  const filtered: Record<string, any> = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) filtered[key] = updates[key];
  }
  if (Object.keys(filtered).length === 0) return;
  await db.collection(COLLECTIONS.USERS).doc(uid).update(filtered);
}

// ─── Helper: Verify ID token from client ─────

export async function verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken | null> {
  try {
    return await auth.verifyIdToken(idToken);
  } catch {
    return null;
  }
}

// ─── Helper: Generate API key ────────────────

import crypto from 'crypto';

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const raw = 'sk_live_swr_' + crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const prefix = raw.substring(0, 16) + '...' + raw.substring(raw.length - 4);
  return { key: raw, hash, prefix };
}

// ─── Helper: Validate API key ────────────────

export async function validateApiKey(rawKey: string): Promise<{ uid: string; keyId: string } | null> {
  const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

  // Query all users' apiKeys subcollections for this hash
  // In production, use a top-level index collection for O(1) lookup
  const snapshot = await db.collectionGroup(COLLECTIONS.API_KEYS)
    .where('hash', '==', hash)
    .where('active', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const keyData = doc.data();
  const uid = doc.ref.parent.parent?.id;

  if (!uid) return null;

  // Update lastUsedAt
  await doc.ref.update({ lastUsedAt: admin.firestore.FieldValue.serverTimestamp() });

  return { uid, keyId: doc.id };
}

// ─── Helper: Check & deduct credits ──────────

export async function deductCredits(uid: string, model: string): Promise<{ ok: boolean; remaining: number; error?: string }> {
  const cost = MODEL_CREDIT_COST[model] || 5;
  const userRef = db.collection(COLLECTIONS.USERS).doc(uid);

  return db.runTransaction(async (tx) => {
    const userDoc = await tx.get(userRef);
    if (!userDoc.exists) return { ok: false, remaining: 0, error: 'User not found' };

    const data = userDoc.data()!;
    const used = data.creditsUsed || 0;
    const total = data.creditsTotal || 0;
    const remaining = total - used;

    if (remaining < cost) {
      return { ok: false, remaining, error: `Insufficient credits. Need ${cost}, have ${remaining}.` };
    }

    tx.update(userRef, { creditsUsed: used + cost });

    // Update monthly usage doc
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const dayKey = `${monthKey}-${String(now.getDate()).padStart(2, '0')}`;
    const usageRef = userRef.collection(COLLECTIONS.USAGE).doc(monthKey);

    const usageDoc = await tx.get(usageRef);
    if (usageDoc.exists) {
      const uData = usageDoc.data()!;
      const byModel = uData.byModel || {};
      byModel[model] = (byModel[model] || 0) + cost;
      const daily = uData.dailyBreakdown || {};
      if (!daily[dayKey]) daily[dayKey] = { credits: 0, calls: 0 };
      daily[dayKey].credits += cost;
      daily[dayKey].calls += 1;

      tx.update(usageRef, {
        totalCredits: (uData.totalCredits || 0) + cost,
        totalCalls: (uData.totalCalls || 0) + 1,
        byModel,
        dailyBreakdown: daily,
      });
    } else {
      tx.set(usageRef, {
        totalCredits: cost,
        totalCalls: 1,
        byModel: { [model]: cost },
        dailyBreakdown: { [dayKey]: { credits: cost, calls: 1 } },
      });
    }

    return { ok: true, remaining: remaining - cost };
  });
}

// ─── Helper: Log API request ─────────────────

export async function logApiRequest(
  uid: string,
  data: {
    method: string;
    endpoint: string;
    model: string;
    credits: number;
    status: number;
    latencyMs: number;
    keyId?: string;
  },
): Promise<void> {
  try {
    await db.collection(COLLECTIONS.USERS).doc(uid)
      .collection('requestLogs').add({
        ...data,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
  } catch {
    // Non-critical — don't fail the request if logging fails
  }
}

// ─── Helper: Get recent request logs ─────────

export async function getRequestLogs(uid: string, limitN: number = 30): Promise<any[]> {
  const snap = await db.collection(COLLECTIONS.USERS).doc(uid)
    .collection('requestLogs')
    .orderBy('timestamp', 'desc')
    .limit(limitN)
    .get();

  return snap.docs.map(d => {
    const data = d.data();
    return {
      ...data,
      timestamp: data.timestamp?.toDate?.()?.toISOString() || null,
    };
  });
}

// ─── Helper: Rate limit check (Redis-backed with in-memory fallback) ────

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
const rateLimitWindowMs = 60_000;
const rateLimitRedisUrl = process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL || '';
let rateLimitRedis: Redis | null = null;

function getRateLimitRedisClient(): Redis | null {
  if (!rateLimitRedisUrl) return null;
  if (rateLimitRedis) return rateLimitRedis;

  try {
    rateLimitRedis = new Redis(rateLimitRedisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });

    rateLimitRedis.on('error', () => {});
    rateLimitRedis.connect().catch(() => {});
    return rateLimitRedis;
  } catch {
    return null;
  }
}

function checkRateLimitInMemory(uid: string, plan: string): { ok: boolean; remaining: number; resetInSec: number } {
  const limit = PLANS[plan]?.rateLimit || 10;
  if (!Number.isFinite(limit)) {
    return { ok: true, remaining: Number.MAX_SAFE_INTEGER, resetInSec: 60 };
  }

  const now = Date.now();
  const key = `${uid}:${plan}`;
  let bucket = rateLimitBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + rateLimitWindowMs };
    rateLimitBuckets.set(key, bucket);
  }

  bucket.count++;
  if (bucket.count > limit) {
    const resetInSec = Math.ceil((bucket.resetAt - now) / 1000);
    return { ok: false, remaining: 0, resetInSec };
  }

  return {
    ok: true,
    remaining: Math.max(0, limit - bucket.count),
    resetInSec: Math.ceil((bucket.resetAt - now) / 1000),
  };
}

export async function checkRateLimit(uid: string, plan: string): Promise<{ ok: boolean; remaining: number; resetInSec: number }> {
  const limit = PLANS[plan]?.rateLimit || 10;
  if (!Number.isFinite(limit)) {
    return { ok: true, remaining: Number.MAX_SAFE_INTEGER, resetInSec: 60 };
  }

  const redis = getRateLimitRedisClient();
  if (!redis) {
    return checkRateLimitInMemory(uid, plan);
  }

  try {
    const now = Date.now();
    const bucketId = Math.floor(now / rateLimitWindowMs);
    const key = `swr:rl:${plan}:${uid}:${bucketId}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, rateLimitWindowMs + 1_000);
    }

    const ttlMs = await redis.pttl(key);
    const resetInSec = Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : rateLimitWindowMs) / 1000));
    if (count > limit) {
      return { ok: false, remaining: 0, resetInSec };
    }

    return {
      ok: true,
      remaining: Math.max(0, limit - count),
      resetInSec,
    };
  } catch {
    return checkRateLimitInMemory(uid, plan);
  }
}

// ─── Helper: Get user plan ───────────────────

export async function getUserPlan(uid: string): Promise<string> {
  const doc = await db.collection(COLLECTIONS.USERS).doc(uid).get();
  return doc.exists ? (doc.data()?.plan || 'free') : 'free';
}
