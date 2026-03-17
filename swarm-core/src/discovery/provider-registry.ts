import * as cheerio from 'cheerio';
import { DiscoveryCandidate, DiscoveryInput, ProviderBudget } from '../adaptive-types';
import { DiscoveryProvider } from './provider';
import { guessTerrainFromUrl, hostnameOf, normalizeUrl, scoreUrl } from './url-policy';

function take<T>(items: T[], n: number): T[] {
  return items.slice(0, Math.max(0, n));
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'SwarmBot/2.0', 'Accept': 'text/html, application/json, application/xml, text/xml' },
      signal: AbortSignal.timeout(7000),
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

function buildCandidate(providerId: string, providerKind: DiscoveryProvider['kind'], url: string, title?: string, snippet?: string, terrainHint?: DiscoveryCandidate['terrainHint'], confidence?: number): DiscoveryCandidate | null {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  return {
    url: normalized,
    domain: hostnameOf(normalized),
    title,
    snippet,
    sourceProviderId: providerId,
    providerKind,
    terrainHint: terrainHint || guessTerrainFromUrl(normalized),
    confidence: confidence ?? scoreUrl(normalized, title, terrainHint),
    discoveredAt: Date.now(),
  };
}

const duckDuckGoProvider: DiscoveryProvider = {
  id: 'duckduckgo_html',
  kind: 'search',
  costClass: 'cheap',
  supportsQuery: true,
  supportsDomainBootstrap: false,
  supportsPagination: false,
  async discover(input: DiscoveryInput, budget: ProviderBudget): Promise<DiscoveryCandidate[]> {
    const q = encodeURIComponent([input.query, ...input.symbols].filter(Boolean).join(' ').trim());
    if (!q) return [];
    const body = await fetchText(`https://html.duckduckgo.com/html/?q=${q}`);
    if (!body) return [];
    const $ = cheerio.load(body);
    const found: DiscoveryCandidate[] = [];
    $('a.result__a, .result__title a').each((_i, el) => {
      if (found.length >= budget.maxCandidates) return false;
      const href = $(el).attr('href') || '';
      const title = $(el).text().trim();
      const snippet = $(el).closest('.result').find('.result__snippet').text().trim();
      const candidate = buildCandidate('duckduckgo_html', 'search', href, title, snippet);
      if (candidate) found.push(candidate);
      return undefined;
    });
    return found;
  },
};

const redditSearchProvider: DiscoveryProvider = {
  id: 'reddit_search',
  kind: 'forum',
  costClass: 'cheap',
  supportsQuery: true,
  supportsDomainBootstrap: false,
  supportsPagination: false,
  async discover(input: DiscoveryInput, budget: ProviderBudget): Promise<DiscoveryCandidate[]> {
    const q = encodeURIComponent([input.query, ...input.symbols].filter(Boolean).join(' ').trim());
    if (!q) return [];
    const body = await fetchText(`https://www.reddit.com/search.json?q=${q}&sort=relevance&t=week&limit=${Math.min(25, budget.maxCandidates)}`);
    if (!body) return [];
    try {
      const json = JSON.parse(body);
      const posts = json?.data?.children || [];
      const found: DiscoveryCandidate[] = [];
      for (const post of posts) {
        const data = post?.data;
        if (!data) continue;
        const href = data.url_overridden_by_dest || data.url || `https://reddit.com${data.permalink || ''}`;
        const candidate = buildCandidate('reddit_search', 'forum', href, data.title, data.selftext?.slice(0, 240), 'forum', 0.72);
        if (candidate) found.push(candidate);
        if (found.length >= budget.maxCandidates) break;
      }
      return found;
    } catch {
      return [];
    }
  },
};

const hackerNewsProvider: DiscoveryProvider = {
  id: 'hn_algolia',
  kind: 'forum',
  costClass: 'cheap',
  supportsQuery: true,
  supportsDomainBootstrap: false,
  supportsPagination: false,
  async discover(input: DiscoveryInput, budget: ProviderBudget): Promise<DiscoveryCandidate[]> {
    const q = encodeURIComponent([input.query, ...input.symbols].filter(Boolean).join(' ').trim());
    if (!q) return [];
    const body = await fetchText(`https://hn.algolia.com/api/v1/search?query=${q}&hitsPerPage=${Math.min(20, budget.maxCandidates)}`);
    if (!body) return [];
    try {
      const json = JSON.parse(body);
      const hits = json?.hits || [];
      const found: DiscoveryCandidate[] = [];
      for (const hit of hits) {
        const href = hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
        const candidate = buildCandidate('hn_algolia', 'forum', href, hit.title, hit.story_text?.slice(0, 240), 'forum', 0.7);
        if (candidate) found.push(candidate);
        if (found.length >= budget.maxCandidates) break;
      }
      return found;
    } catch {
      return [];
    }
  },
};

const wikipediaProvider: DiscoveryProvider = {
  id: 'wikipedia_search',
  kind: 'search',
  costClass: 'cheap',
  supportsQuery: true,
  supportsDomainBootstrap: false,
  supportsPagination: false,
  async discover(input: DiscoveryInput, budget: ProviderBudget): Promise<DiscoveryCandidate[]> {
    const q = encodeURIComponent([input.query, ...input.symbols].filter(Boolean).join(' ').trim());
    if (!q) return [];
    const body = await fetchText(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${q}&limit=${Math.min(10, budget.maxCandidates)}&format=json`);
    if (!body) return [];
    try {
      const [_, titles, __, urls] = JSON.parse(body);
      const found: DiscoveryCandidate[] = [];
      for (let i = 0; i < Math.min(titles.length, urls.length, budget.maxCandidates); i++) {
        const candidate = buildCandidate('wikipedia_search', 'search', urls[i], titles[i], titles[i], 'general-web', 0.78);
        if (candidate) found.push(candidate);
      }
      return found;
    } catch {
      return [];
    }
  },
};

const rssProvider: DiscoveryProvider = {
  id: 'rss_autodiscovery',
  kind: 'feed',
  costClass: 'medium',
  supportsQuery: false,
  supportsDomainBootstrap: true,
  supportsPagination: false,
  async discover(input: DiscoveryInput, budget: ProviderBudget): Promise<DiscoveryCandidate[]> {
    const domains = take(input.domains || [], budget.maxRequests);
    const found: DiscoveryCandidate[] = [];
    const paths = ['/feed', '/rss', '/rss.xml', '/feed.xml', '/atom.xml'];
    for (const domain of domains) {
      for (const path of paths) {
        if (found.length >= budget.maxCandidates) break;
        const body = await fetchText(`https://${domain}${path}`);
        if (!body || !/<(rss|feed)/i.test(body)) continue;
        const entries = [...body.matchAll(/<link>(https?:[^<]+)<\/link>/gi)].slice(0, 5);
        for (const entry of entries) {
          const candidate = buildCandidate('rss_autodiscovery', 'feed', entry[1], `${domain} feed`, '', guessTerrainFromUrl(entry[1]), 0.68);
          if (candidate) found.push(candidate);
          if (found.length >= budget.maxCandidates) break;
        }
      }
    }
    return found;
  },
};

const sitemapProvider: DiscoveryProvider = {
  id: 'sitemap_probe',
  kind: 'sitemap',
  costClass: 'medium',
  supportsQuery: false,
  supportsDomainBootstrap: true,
  supportsPagination: false,
  async discover(input: DiscoveryInput, budget: ProviderBudget): Promise<DiscoveryCandidate[]> {
    const domains = take(input.domains || [], budget.maxRequests);
    const found: DiscoveryCandidate[] = [];
    for (const domain of domains) {
      if (found.length >= budget.maxCandidates) break;
      const body = await fetchText(`https://${domain}/sitemap.xml`);
      if (!body || !/<urlset|<sitemapindex/i.test(body)) continue;
      const urls = [...body.matchAll(/<loc>(https?:[^<]+)<\/loc>/gi)].slice(0, budget.maxCandidates);
      for (const match of urls) {
        const candidate = buildCandidate('sitemap_probe', 'sitemap', match[1], `${domain} sitemap`, '', guessTerrainFromUrl(match[1]), 0.62);
        if (candidate) found.push(candidate);
        if (found.length >= budget.maxCandidates) break;
      }
    }
    return found;
  },
};

export class ProviderRegistry {
  private providers: DiscoveryProvider[];

  constructor(providers: DiscoveryProvider[] = [duckDuckGoProvider, redditSearchProvider, hackerNewsProvider, wikipediaProvider, rssProvider, sitemapProvider]) {
    this.providers = providers;
  }

  list(): DiscoveryProvider[] {
    return [...this.providers];
  }

  listIds(): string[] {
    return this.providers.map((p) => p.id);
  }

  byId(id: string): DiscoveryProvider | undefined {
    return this.providers.find((p) => p.id === id);
  }

  async discover(input: DiscoveryInput, providerPlan: Array<{ providerId: string; budgetPct: number }>, deadlineMs: number): Promise<DiscoveryCandidate[]> {
    const all: DiscoveryCandidate[] = [];
    for (const step of providerPlan) {
      const provider = this.byId(step.providerId);
      if (!provider) continue;
      const budget: ProviderBudget = {
        maxCandidates: Math.max(2, Math.round(12 * step.budgetPct)),
        maxRequests: Math.max(1, Math.round(4 * step.budgetPct)),
        maxDepth: 1,
        deadlineMs,
      };
      const found = await provider.discover(input, budget);
      all.push(...found);
      if (Date.now() >= deadlineMs) break;
    }
    return all;
  }
}
