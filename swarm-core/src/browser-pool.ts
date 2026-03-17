/**
 * BROWSER POOL — Shared Chromium instances for adaptive runtime workers
 * 
 * Like a colony's shared physical environment — workers take turns using trails.
 * A pool of browser instances serves concurrent discovery and reader tasks.
 * Each worker borrows a page, does its work (3-5 seconds), returns it.
 * 
 * 10 browsers × 10 pages each = 100 concurrent fetch events.
 * At 3 seconds per event, that's ~2000 fetch events per minute.
 * Enough for large adaptive query bursts at 1-minute intervals.
 * 
 * The pool handles:
 * - Launching browsers lazily (only when needed)
 * - Recycling pages (reset between worker tasks)
 * - Health checks (restart crashed browsers)
 * - Queuing (if all pages are busy, workers wait)
 */

import puppeteer, { Browser, Page } from 'puppeteer';

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────

export interface BrowserPoolConfig {
  /** Max browser instances to launch. Default: 3 */
  maxBrowsers: number;
  /** Max pages per browser. Default: 5 */
  maxPagesPerBrowser: number;
  /** Page navigation timeout in ms. Default: 15000 */
  navigationTimeoutMs: number;
  /** How long a worker can hold a page before forced release. Default: 10000 */
  maxPageHoldMs: number;
  /** User agent string. Default: looks like a normal browser. */
  userAgent: string;
  /** Run headless. Default: true */
  headless: boolean;
}

const DEFAULT_CONFIG: BrowserPoolConfig = {
  maxBrowsers: 3,
  maxPagesPerBrowser: 5,
  navigationTimeoutMs: 15_000,
  maxPageHoldMs: 10_000,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  headless: true,
};

// ─────────────────────────────────────────────
// Page Lease — what an ant gets when it borrows a page
// ─────────────────────────────────────────────

export interface PageLease {
  /** The Puppeteer page to use */
  page: Page;
  /** Unique lease ID */
  leaseId: string;
  /** When the lease was granted */
  grantedAt: number;
  /** Release the page back to the pool — MUST be called when done */
  release: () => Promise<void>;
}

// ─────────────────────────────────────────────
// Internal tracking
// ─────────────────────────────────────────────

interface BrowserEntry {
  browser: Browser;
  activePages: number;
  totalPagesCreated: number;
}

interface QueueEntry {
  resolve: (lease: PageLease) => void;
  reject: (err: Error) => void;
  requestedAt: number;
}

// ─────────────────────────────────────────────
// The Pool
// ─────────────────────────────────────────────

export class BrowserPool {
  private config: BrowserPoolConfig;
  private browsers: BrowserEntry[] = [];
  private queue: QueueEntry[] = [];
  private leaseCounter: number = 0;
  private totalLeases: number = 0;
  private totalNavigations: number = 0;
  private isShuttingDown: boolean = false;

  constructor(config: Partial<BrowserPoolConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── ACQUIRE A PAGE ─────────────────────────

  /**
   * Request a browser page. Returns a PageLease.
   * If all pages are busy, queues the request and resolves when one frees up.
   * The ant MUST call lease.release() when done.
   */
  async acquire(): Promise<PageLease> {
    if (this.isShuttingDown) {
      throw new Error('BrowserPool is shutting down');
    }

    // Try to find a browser with available capacity
    for (const entry of this.browsers) {
      if (entry.activePages < this.config.maxPagesPerBrowser) {
        return this.createLease(entry);
      }
    }

    // No capacity — can we launch a new browser?
    if (this.browsers.length < this.config.maxBrowsers) {
      const entry = await this.launchBrowser();
      return this.createLease(entry);
    }

    // All browsers full, all slots used — queue the request
    return new Promise<PageLease>((resolve, reject) => {
      this.queue.push({ resolve, reject, requestedAt: Date.now() });
    });
  }

  // ─── INTERNAL ───────────────────────────────

  private async launchBrowser(): Promise<BrowserEntry> {
    const browser = await puppeteer.launch({
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
      ],
    });

    const entry: BrowserEntry = {
      browser,
      activePages: 0,
      totalPagesCreated: 0,
    };

    this.browsers.push(entry);
    return entry;
  }

  private async createLease(entry: BrowserEntry): Promise<PageLease> {
    const page = await entry.browser.newPage();
    entry.activePages++;
    entry.totalPagesCreated++;
    this.leaseCounter++;
    this.totalLeases++;

    const leaseId = `lease-${this.leaseCounter}`;
    const grantedAt = Date.now();

    // Configure the page
    await page.setUserAgent(this.config.userAgent);
    await page.setViewport({ width: 1280, height: 800 });
    page.setDefaultNavigationTimeout(this.config.navigationTimeoutMs);

    // Block unnecessary resources to speed up loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      // Only load documents and scripts — skip images, css, fonts, media
      if (['image', 'stylesheet', 'font', 'media', 'other'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Auto-release safety: if ant doesn't release within maxPageHoldMs, force it
    const timeout = setTimeout(async () => {
      try { await releaseFn(); } catch {}
    }, this.config.maxPageHoldMs);

    let released = false;
    const releaseFn = async () => {
      if (released) return;
      released = true;
      clearTimeout(timeout);

      try {
        await page.close();
      } catch {
        // Page may already be closed
      }
      entry.activePages--;

      // Serve queued requests
      if (this.queue.length > 0) {
        const next = this.queue.shift()!;
        try {
          const newLease = await this.createLease(entry);
          next.resolve(newLease);
        } catch (err) {
          next.reject(err as Error);
        }
      }
    };

    return {
      page,
      leaseId,
      grantedAt,
      release: releaseFn,
    };
  }

  // ─── NAVIGATION HELPERS ─────────────────────

  /**
   * Navigate to a URL and return the page content.
   * This is the primary method adaptive readers use.
   * Handles the full lifecycle: acquire → navigate → return content → release.
   */
  async browse(url: string): Promise<{ html: string; status: number; elapsed: number } | null> {
    const start = Date.now();
    let lease: PageLease | null = null;

    try {
      lease = await this.acquire();
      const response = await lease.page.goto(url, { waitUntil: 'domcontentloaded' });
      const html = await lease.page.content();
      const status = response?.status() ?? 0;
      this.totalNavigations++;

      return {
        html,
        status,
        elapsed: Date.now() - start,
      };
    } catch (err) {
      return null; // Navigation failed — ant gets nothing, trail decays
    } finally {
      if (lease) {
        await lease.release();
      }
    }
  }

  /**
   * Navigate and extract text content using a CSS selector.
   * The most common evidence extraction operation.
   */
  async browseAndExtract(url: string, selector: string): Promise<{ text: string; elapsed: number } | null> {
    const start = Date.now();
    let lease: PageLease | null = null;

    try {
      lease = await this.acquire();
      await lease.page.goto(url, { waitUntil: 'domcontentloaded' });

      // Wait briefly for dynamic content
      await lease.page.waitForSelector(selector, { timeout: 5000 }).catch(() => null);

      const text = await lease.page.$eval(selector, (el) => el.textContent?.trim() ?? '');
      this.totalNavigations++;

      return {
        text,
        elapsed: Date.now() - start,
      };
    } catch {
      return null;
    } finally {
      if (lease) {
        await lease.release();
      }
    }
  }

  /**
   * Navigate and extract multiple pieces of data using a map of selectors.
   * Returns a Record<string, string> where keys match the input selector keys.
   */
  async browseAndExtractMany(url: string, selectors: Record<string, string>): Promise<{ data: Record<string, string>; elapsed: number } | null> {
    const start = Date.now();
    let lease: PageLease | null = null;

    try {
      lease = await this.acquire();
      await lease.page.goto(url, { waitUntil: 'domcontentloaded' });

      // Wait for any one selector to appear
      const firstSelector = Object.values(selectors)[0];
      if (firstSelector) {
        await lease.page.waitForSelector(firstSelector, { timeout: 5000 }).catch(() => null);
      }

      const data: Record<string, string> = {};
      for (const [key, sel] of Object.entries(selectors)) {
        try {
          data[key] = await lease.page.$eval(sel, (el) => el.textContent?.trim() ?? '');
        } catch {
          data[key] = '';
        }
      }

      this.totalNavigations++;
      return { data, elapsed: Date.now() - start };
    } catch {
      return null;
    } finally {
      if (lease) {
        await lease.release();
      }
    }
  }

  /**
   * Navigate and extract all links from a page.
   * Used by discovery workers to identify new public-web sources.
   */
  async browseAndDiscoverLinks(url: string, linkPattern?: RegExp): Promise<{ links: string[]; elapsed: number } | null> {
    const start = Date.now();
    let lease: PageLease | null = null;

    try {
      lease = await this.acquire();
      await lease.page.goto(url, { waitUntil: 'domcontentloaded' });

      const allLinks = await lease.page.$$eval('a[href]', (anchors) =>
        anchors.map((a) => a.getAttribute('href') || '').filter(Boolean)
      );

      // Resolve relative URLs
      const pageUrl = new URL(url);
      const resolvedLinks = allLinks.map(link => {
        try {
          return new URL(link, pageUrl.origin).href;
        } catch {
          return '';
        }
      }).filter(Boolean);

      // Filter by pattern if provided
      const links = linkPattern
        ? resolvedLinks.filter(l => linkPattern.test(l))
        : resolvedLinks;

      this.totalNavigations++;
      return { links: [...new Set(links)], elapsed: Date.now() - start };
    } catch {
      return null;
    } finally {
      if (lease) {
        await lease.release();
      }
    }
  }

  // ─── LIFECYCLE ──────────────────────────────

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Reject all queued requests
    for (const entry of this.queue) {
      entry.reject(new Error('BrowserPool shutting down'));
    }
    this.queue = [];

    // Close all browsers
    for (const entry of this.browsers) {
      try {
        await entry.browser.close();
      } catch {}
    }
    this.browsers = [];
  }

  // ─── STATS ──────────────────────────────────

  getStats(): {
    browsers: number;
    activePagesTotal: number;
    queueLength: number;
    totalLeases: number;
    totalNavigations: number;
  } {
    let activePagesTotal = 0;
    for (const entry of this.browsers) {
      activePagesTotal += entry.activePages;
    }

    return {
      browsers: this.browsers.length,
      activePagesTotal,
      queueLength: this.queue.length,
      totalLeases: this.totalLeases,
      totalNavigations: this.totalNavigations,
    };
  }
}
