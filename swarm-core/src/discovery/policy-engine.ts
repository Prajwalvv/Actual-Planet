import { QueryPolicyEvent } from '../adaptive-types';
import { RobotsCache } from './robots-cache';
import { hostnameOf, isBlockedUrl, normalizeUrl } from './url-policy';

export interface CrawlPolicyConfig {
  maxPagesPerDomainPerQuery: number;
  maxTotalPagesPerQuery: number;
  perDomainCooldownMs: number;
  userAgent: string;
}

export interface PolicyDecision {
  ok: boolean;
  url: string;
  domain: string;
  reason: string;
  event: QueryPolicyEvent;
}

const DEFAULT_CONFIG: CrawlPolicyConfig = {
  maxPagesPerDomainPerQuery: Number(process.env.SWARM_MAX_PAGES_PER_DOMAIN || 5),
  maxTotalPagesPerQuery: Number(process.env.SWARM_MAX_TOTAL_PAGES || 40),
  perDomainCooldownMs: Number(process.env.SWARM_DOMAIN_COOLDOWN_MS || 500),
  userAgent: process.env.SWARM_USER_AGENT || 'SwarmBot/2.0',
};

export class CrawlPolicyEngine {
  private config: CrawlPolicyConfig;
  private robots: RobotsCache;
  private totalAllowed = 0;
  private perDomain = new Map<string, number>();
  private lastDomainTouch = new Map<string, number>();
  private seen = new Set<string>();

  constructor(config: Partial<CrawlPolicyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.robots = new RobotsCache({ userAgent: this.config.userAgent });
  }

  async allow(rawUrl: string, sourceProviderId?: string): Promise<PolicyDecision> {
    const normalized = normalizeUrl(rawUrl);
    const domain = hostnameOf(normalized || rawUrl);
    const mk = (ok: boolean, reason: string, url: string): PolicyDecision => ({
      ok,
      url,
      domain,
      reason,
      event: {
        url,
        domain,
        action: ok ? 'allowed' : 'blocked',
        reason,
        sourceProviderId,
        timestamp: Date.now(),
      },
    });

    const blockReason = isBlockedUrl(rawUrl);
    if (blockReason || !normalized) return mk(false, blockReason || 'invalid_url', rawUrl);
    if (this.seen.has(normalized)) return mk(false, 'duplicate_url', normalized);
    if (this.totalAllowed >= this.config.maxTotalPagesPerQuery) return mk(false, 'max_total_pages_reached', normalized);

    const domainCount = this.perDomain.get(domain) || 0;
    if (domainCount >= this.config.maxPagesPerDomainPerQuery) return mk(false, 'max_pages_per_domain_reached', normalized);

    const lastTouch = this.lastDomainTouch.get(domain) || 0;
    if ((Date.now() - lastTouch) < this.config.perDomainCooldownMs) {
      return mk(false, 'domain_cooldown', normalized);
    }

    const robotsAllowed = await this.robots.isAllowed(normalized);
    if (!robotsAllowed) return mk(false, 'robots_blocked', normalized);

    this.seen.add(normalized);
    this.totalAllowed += 1;
    this.perDomain.set(domain, domainCount + 1);
    this.lastDomainTouch.set(domain, Date.now());
    return mk(true, 'allowed', normalized);
  }

  getSnapshot() {
    return {
      totalAllowed: this.totalAllowed,
      perDomain: Object.fromEntries(this.perDomain.entries()),
      maxPagesPerDomainPerQuery: this.config.maxPagesPerDomainPerQuery,
      maxTotalPagesPerQuery: this.config.maxTotalPagesPerQuery,
    };
  }
}
