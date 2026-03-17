import { hostnameOf } from './url-policy';

interface RobotsRuleSet {
  allow: string[];
  disallow: string[];
  fetchedAt: number;
}

function pathMatches(rule: string, path: string): boolean {
  if (!rule) return false;
  if (rule === '/') return true;
  return path.startsWith(rule);
}

function parseRobotsTxt(body: string): RobotsRuleSet {
  const lines = body.split(/\r?\n/);
  let inWildcard = false;
  const allow: string[] = [];
  const disallow: string[] = [];

  for (const line of lines) {
    const clean = line.replace(/#.*/, '').trim();
    if (!clean) continue;
    const sep = clean.indexOf(':');
    if (sep < 0) continue;
    const key = clean.slice(0, sep).trim().toLowerCase();
    const value = clean.slice(sep + 1).trim();
    if (key === 'user-agent') {
      inWildcard = value === '*' || value.toLowerCase().includes('swarmbot');
      continue;
    }
    if (!inWildcard) continue;
    if (key === 'allow' && value) allow.push(value);
    if (key === 'disallow' && value) disallow.push(value);
  }

  return { allow, disallow, fetchedAt: Date.now() };
}

export class RobotsCache {
  private ttlMs: number;
  private userAgent: string;
  private cache = new Map<string, RobotsRuleSet>();

  constructor(opts: { ttlMs?: number; userAgent?: string } = {}) {
    this.ttlMs = opts.ttlMs ?? 30 * 60 * 1000;
    this.userAgent = opts.userAgent || 'SwarmBot/2.0';
  }

  private async load(hostname: string): Promise<RobotsRuleSet> {
    const existing = this.cache.get(hostname);
    if (existing && (Date.now() - existing.fetchedAt) < this.ttlMs) return existing;

    const robotsUrl = `https://${hostname}/robots.txt`;
    try {
      const resp = await fetch(robotsUrl, {
        headers: { 'User-Agent': this.userAgent },
        signal: AbortSignal.timeout(4000),
      });
      if (!resp.ok) {
        const empty = { allow: [], disallow: [], fetchedAt: Date.now() };
        this.cache.set(hostname, empty);
        return empty;
      }
      const body = await resp.text();
      const parsed = parseRobotsTxt(body);
      this.cache.set(hostname, parsed);
      return parsed;
    } catch {
      const empty = { allow: [], disallow: [], fetchedAt: Date.now() };
      this.cache.set(hostname, empty);
      return empty;
    }
  }

  async isAllowed(url: string): Promise<boolean> {
    const hostname = hostnameOf(url);
    if (!hostname) return false;
    const rules = await this.load(hostname);
    try {
      const path = new URL(url).pathname || '/';
      const disallowed = rules.disallow.filter((rule) => pathMatches(rule, path)).sort((a, b) => b.length - a.length)[0];
      const allowed = rules.allow.filter((rule) => pathMatches(rule, path)).sort((a, b) => b.length - a.length)[0];
      if (!disallowed) return true;
      if (allowed && allowed.length >= disallowed.length) return true;
      return false;
    } catch {
      return false;
    }
  }
}
