/**
 * HARVESTER ANT — The Output Layer
 * 
 * Biological analog: Honeypot ant (Myrmecocystus)
 * In real colonies, honeypot ants store and dispense food — they are
 * living storage vessels that other ants feed from.
 * 
 * Our HarvesterAnt does the same for intelligence:
 * 1. Scans the pheromone space for locations with rich signal activity
 * 2. Reads ALL signals at each location (what discovery/readers + processors deposited)
 * 3. Computes conviction, polarity, confidence — the "digest"
 * 4. Produces an IntelligenceReport — structured, domain-agnostic output
 * 5. Deposits HARVEST_READY pheromone so the API layer knows what's ripe
 * 
 * The harvester doesn't know what domain it's in. It doesn't know if
 * "MOMENTUM" can mean trend velocity in any domain (topics, products, orgs, etc.).
 * It just reads pheromone concentrations and produces a report.
 * 
 * This is the bridge between the swarm's internal chemical state
 * and the external world (API, LLM tool calls, dashboards).
 * 
 * Memory per ant: ~500 bytes (location + last report cache)
 * Cost per tick: ~1ms (reads pheromone space, does math)
 * One harvester per active location. Colony auto-scales.
 */

import {
  PheromoneType,
  PheromoneDeposit,
  IPheromoneSpace,
  LocationSnapshot,
  PheromoneReading,
  IntelligenceReport,
  IntelligenceSignal,
  IntelligenceCorrelation,
  DataQualityAssessment,
  SignalPolarity,
  ConfidenceTier,
} from '../types';

// ─────────────────────────────────────────────
// Signal Classification — domain-agnostic
// ─────────────────────────────────────────────

/** Signals that indicate positive momentum / growth / confidence */
const POSITIVE_SIGNALS: Set<PheromoneType> = new Set([
  PheromoneType.MOMENTUM,
  PheromoneType.HYPE,
  PheromoneType.BREAKOUT,
  PheromoneType.ACCUMULATION,
  PheromoneType.INSIDER_CONFIDENCE,
  PheromoneType.INSIDER_CLUSTER,
]);

/** Signals that indicate negative trend / decline / risk */
const NEGATIVE_SIGNALS: Set<PheromoneType> = new Set([
  PheromoneType.DISTRESS,
  PheromoneType.FEAR,
  PheromoneType.DRY_UP,
  PheromoneType.INSIDER_EXIT,
  PheromoneType.DEAD_TRAIL,
]);

/** Signals that are neutral / informational */
const NEUTRAL_SIGNALS: Set<PheromoneType> = new Set([
  PheromoneType.FLATLINE,
  PheromoneType.SILENCE,
  PheromoneType.MACRO_STABLE,
  PheromoneType.TRAIL,
  PheromoneType.INTEREST,
  PheromoneType.FOOD_SOURCE,
]);

/** Meta-signals from processors — indicate pattern quality, not direction */
const META_SIGNALS: Set<PheromoneType> = new Set([
  PheromoneType.CLUSTER_DETECTED,
  PheromoneType.CASCADE_FORMING,
  PheromoneType.ANOMALY,
  PheromoneType.CONVERGENCE,
  PheromoneType.DIVERGENCE,
  PheromoneType.DECOUPLING,
  PheromoneType.CONFUSION,
]);

/** Quality signals from guards — affect confidence, not polarity */
const QUALITY_SIGNALS: Set<PheromoneType> = new Set([
  PheromoneType.QUARANTINE,
  PheromoneType.VERIFIED,
  PheromoneType.ECHO_CHAMBER,
  PheromoneType.STALE,
  PheromoneType.SATURATED,
]);

// ─────────────────────────────────────────────
// Harvester Config
// ─────────────────────────────────────────────

export interface HarvesterAntConfig {
  id: string;
  /** Location this harvester monitors */
  locationId: string;
}

// ─────────────────────────────────────────────
// The Harvester Ant
// ─────────────────────────────────────────────

export class HarvesterAnt {
  private config: HarvesterAntConfig;
  /** Cached last report — avoids recomputation if nothing changed */
  private lastReport: IntelligenceReport | null = null;
  private lastSnapshotHash: string = '';

  constructor(config: HarvesterAntConfig) {
    this.config = config;
  }

  /**
   * One harvest tick. Reads the pheromone space, produces a report.
   * Returns null if the location has insufficient data.
   */
  async tick(space: IPheromoneSpace): Promise<{ report: IntelligenceReport | null; deposit: PheromoneDeposit | null }> {
    const snapshot = await space.read(this.config.locationId);

    // Skip locations with no meaningful activity
    if (snapshot.signals.length === 0 || snapshot.totalConcentration < 0.05) {
      return { report: null, deposit: null };
    }

    // Check if anything changed since last harvest (avoid redundant work)
    const hash = this.computeSnapshotHash(snapshot);
    if (hash === this.lastSnapshotHash && this.lastReport) {
      return { report: this.lastReport, deposit: null };
    }
    this.lastSnapshotHash = hash;

    // Build the intelligence report
    const report = await this.buildReport(snapshot, space);
    this.lastReport = report;

    // Deposit HARVEST_READY if the report has sufficient conviction
    let deposit: PheromoneDeposit | null = null;
    if (report.conviction >= 0.3 && report.confidence !== 'unverified') {
      deposit = {
        type: PheromoneType.HARVEST_READY,
        locationId: this.config.locationId,
        strength: Math.min(1.0, report.conviction),
        sourceAntId: this.config.id,
        sourceColony: 'harvester',
        timestamp: Date.now(),
      };
    }

    return { report, deposit };
  }

  // ─── REPORT BUILDING ──────────────────────────

  private async buildReport(snapshot: LocationSnapshot, space: IPheromoneSpace): Promise<IntelligenceReport> {
    const now = Date.now();
    const signals = this.buildSignals(snapshot);
    const polarity = this.computePolarity(snapshot);
    const conviction = this.computeConviction(snapshot);
    const quality = this.assessQuality(snapshot);
    const confidence = this.computeConfidence(snapshot, quality);
    const correlations = await this.findCorrelations(snapshot, space);
    const freshness = this.computeFreshness(snapshot);
    const sourceCount = this.countSources(snapshot);
    const summary = this.generateSummary(snapshot, polarity, conviction, confidence, correlations);

    return {
      locationId: this.config.locationId,
      generatedAt: now,
      polarity,
      conviction,
      confidence,
      signals,
      correlations,
      quality,
      summary,
      dataFreshnessMs: freshness,
      sourceCount,
    };
  }

  // ─── SIGNAL EXTRACTION ────────────────────────

  private buildSignals(snapshot: LocationSnapshot): IntelligenceSignal[] {
    return snapshot.signals
      .filter(s => !QUALITY_SIGNALS.has(s.type) && s.type !== PheromoneType.HARVEST_READY)
      .map(s => ({
        type: s.type,
        strength: s.strength,
        contributors: s.contributorCount,
        ageMs: s.peakAge,
      }))
      .sort((a, b) => b.strength - a.strength);
  }

  // ─── POLARITY (direction of evidence) ─────────

  private computePolarity(snapshot: LocationSnapshot): SignalPolarity {
    let positiveWeight = 0;
    let negativeWeight = 0;

    for (const sig of snapshot.signals) {
      if (POSITIVE_SIGNALS.has(sig.type)) {
        positiveWeight += sig.strength;
      } else if (NEGATIVE_SIGNALS.has(sig.type)) {
        negativeWeight += sig.strength;
      }
    }

    const total = positiveWeight + negativeWeight;
    if (total < 0.1) return 'neutral';

    const ratio = positiveWeight / total;

    if (ratio > 0.65) return 'positive';
    if (ratio < 0.35) return 'negative';

    // Both are strong — check for CONFUSION meta-signal
    const confusionSignal = snapshot.signals.find(s => s.type === PheromoneType.CONFUSION);
    if (confusionSignal && confusionSignal.strength > 0.2) return 'mixed';

    return 'mixed';
  }

  // ─── CONVICTION (how strongly signals agree) ──

  private computeConviction(snapshot: LocationSnapshot): number {
    const directional = snapshot.signals.filter(
      s => POSITIVE_SIGNALS.has(s.type) || NEGATIVE_SIGNALS.has(s.type)
    );

    if (directional.length === 0) return 0;

    let positiveWeight = 0;
    let negativeWeight = 0;
    for (const sig of directional) {
      if (POSITIVE_SIGNALS.has(sig.type)) positiveWeight += sig.strength;
      else negativeWeight += sig.strength;
    }

    const total = positiveWeight + negativeWeight;
    if (total === 0) return 0;

    // Agreement ratio: how much of the evidence points the same direction
    const dominant = Math.max(positiveWeight, negativeWeight);
    const agreement = dominant / total; // 0.5 = split, 1.0 = unanimous

    // Diversity bonus: more distinct signal types agreeing = higher conviction
    const diversityBonus = Math.min(0.2, directional.length * 0.05);

    // Cluster detected bonus — processors confirmed the pattern
    const clusterSignal = snapshot.signals.find(s => s.type === PheromoneType.CLUSTER_DETECTED);
    const clusterBonus = clusterSignal ? clusterSignal.strength * 0.15 : 0;

    // Verified bonus — guards confirmed the data
    const verifiedSignal = snapshot.signals.find(s => s.type === PheromoneType.VERIFIED);
    const verifiedBonus = verifiedSignal ? verifiedSignal.strength * 0.1 : 0;

    return Math.min(1.0, agreement * 0.6 + diversityBonus + clusterBonus + verifiedBonus + (total > 1 ? 0.1 : 0));
  }

  // ─── DATA QUALITY ASSESSMENT ──────────────────

  private assessQuality(snapshot: LocationSnapshot): DataQualityAssessment {
    const quarantine = snapshot.signals.find(s => s.type === PheromoneType.QUARANTINE);
    const verified = snapshot.signals.find(s => s.type === PheromoneType.VERIFIED);
    const echoChamber = snapshot.signals.find(s => s.type === PheromoneType.ECHO_CHAMBER);
    const stale = snapshot.signals.find(s => s.type === PheromoneType.STALE);
    const saturated = snapshot.signals.find(s => s.type === PheromoneType.SATURATED);

    const isQuarantined = (quarantine?.strength ?? 0) > 0.3;
    const isVerified = (verified?.strength ?? 0) > 0.3;
    const isEchoChamber = (echoChamber?.strength ?? 0) > 0.3;
    const isStale = (stale?.strength ?? 0) > 0.3;
    const isSaturated = (saturated?.strength ?? 0) > 0.3;

    // Quality score: start at 0.5, add/subtract based on flags
    let qualityScore = 0.5;
    if (isVerified) qualityScore += 0.3;
    if (isQuarantined) qualityScore -= 0.4;
    if (isEchoChamber) qualityScore -= 0.2;
    if (isStale) qualityScore -= 0.15;
    if (isSaturated) qualityScore -= 0.1;

    return {
      isQuarantined,
      isVerified,
      isEchoChamber,
      isStale,
      isSaturated,
      qualityScore: Math.max(0, Math.min(1, qualityScore)),
    };
  }

  // ─── CONFIDENCE TIER ──────────────────────────

  private computeConfidence(snapshot: LocationSnapshot, quality: DataQualityAssessment): ConfidenceTier {
    if (quality.isQuarantined) return 'unverified';

    const sourceCount = this.countSources(snapshot);
    const hasCluster = snapshot.signals.some(s => s.type === PheromoneType.CLUSTER_DETECTED && s.strength > 0.2);

    if (quality.isVerified && sourceCount >= 3 && hasCluster) return 'high';
    if (sourceCount >= 2 && quality.qualityScore >= 0.5) return 'medium';
    if (sourceCount >= 1) return 'low';

    return 'unverified';
  }

  // ─── CORRELATIONS ─────────────────────────────

  private async findCorrelations(snapshot: LocationSnapshot, space: IPheromoneSpace): Promise<IntelligenceCorrelation[]> {
    const correlations: IntelligenceCorrelation[] = [];

    // Look for correlation signals (CONVERGENCE, DIVERGENCE, DECOUPLING)
    // These are deposited at parent locations by correlator ants.
    // We need to check parent locations for correlations that mention us.
    const parents = await space.getParents(this.config.locationId);

    for (const parentId of parents) {
      const parentSnap = await space.read(parentId);

      const convergence = parentSnap.signals.find(s => s.type === PheromoneType.CONVERGENCE);
      if (convergence && convergence.strength > 0.1) {
        correlations.push({
          withLocationId: parentId,
          type: 'convergence',
          strength: convergence.strength,
        });
      }

      const divergence = parentSnap.signals.find(s => s.type === PheromoneType.DIVERGENCE);
      if (divergence && divergence.strength > 0.1) {
        correlations.push({
          withLocationId: parentId,
          type: 'divergence',
          strength: divergence.strength,
        });
      }

      const decoupling = parentSnap.signals.find(s => s.type === PheromoneType.DECOUPLING);
      if (decoupling && decoupling.strength > 0.1) {
        correlations.push({
          withLocationId: parentId,
          type: 'decoupling',
          strength: decoupling.strength,
        });
      }
    }

    return correlations.sort((a, b) => b.strength - a.strength);
  }

  // ─── FRESHNESS ────────────────────────────────

  private computeFreshness(snapshot: LocationSnapshot): number {
    if (snapshot.signals.length === 0) return Infinity;
    // Return the age of the freshest signal
    return Math.min(...snapshot.signals.map(s => s.peakAge));
  }

  // ─── SOURCE COUNT ─────────────────────────────

  private countSources(snapshot: LocationSnapshot): number {
    // Count unique contributor colonies (not individual ants)
    // We approximate by counting distinct signal types from discovery/reader sources
    // (exclude processor/guard/nurse meta-signals)
    return snapshot.signals.filter(
      s => !META_SIGNALS.has(s.type) && !QUALITY_SIGNALS.has(s.type)
        && s.type !== PheromoneType.HARVEST_READY
        && s.type !== PheromoneType.REBALANCE
    ).length;
  }

  // ─── SUMMARY GENERATION ───────────────────────

  private generateSummary(
    snapshot: LocationSnapshot,
    polarity: SignalPolarity,
    conviction: number,
    confidence: ConfidenceTier,
    correlations: IntelligenceCorrelation[],
  ): string {
    const loc = this.config.locationId;
    const parts: string[] = [];

    // Polarity + conviction
    const convictionWord = conviction > 0.7 ? 'strong' : conviction > 0.4 ? 'moderate' : 'weak';
    parts.push(`${loc}: ${convictionWord} ${polarity} signal`);

    // Active signal types
    const activeTypes = snapshot.signals
      .filter(s => s.strength > 0.2 && !QUALITY_SIGNALS.has(s.type) && !META_SIGNALS.has(s.type)
        && s.type !== PheromoneType.HARVEST_READY)
      .map(s => s.type)
      .slice(0, 5);

    if (activeTypes.length > 0) {
      parts.push(`Active signals: ${activeTypes.join(', ')}`);
    }

    // Meta-signals
    const metaActive = snapshot.signals
      .filter(s => META_SIGNALS.has(s.type) && s.strength > 0.2)
      .map(s => s.type);

    if (metaActive.length > 0) {
      parts.push(`Patterns: ${metaActive.join(', ')}`);
    }

    // Correlations
    if (correlations.length > 0) {
      const corr = correlations.slice(0, 3)
        .map(c => `${c.type} with ${c.withLocationId}`)
        .join('; ');
      parts.push(`Correlations: ${corr}`);
    }

    // Confidence
    parts.push(`Confidence: ${confidence}`);

    // Diversity
    parts.push(`${snapshot.signalDiversity} signal types, concentration ${snapshot.totalConcentration.toFixed(2)}`);

    return parts.join('. ') + '.';
  }

  // ─── DEDUP HASH ───────────────────────────────

  private computeSnapshotHash(snapshot: LocationSnapshot): string {
    // Simple hash: concat signal types + rounded strengths
    return snapshot.signals
      .map(s => `${s.type}:${(s.strength * 10).toFixed(0)}`)
      .sort()
      .join('|');
  }

  // ─── STATE ────────────────────────────────────

  getId(): string { return this.config.id; }
  getLocationId(): string { return this.config.locationId; }
  getLastReport(): IntelligenceReport | null { return this.lastReport; }
}

// ─────────────────────────────────────────────
// HARVESTER COLONY — manages harvesters across locations
// ─────────────────────────────────────────────

export interface HarvesterColonyConfig {
  /** Min concentration at a location before a harvester is assigned. Default: 0.2 */
  minConcentrationToHarvest: number;
}

const DEFAULT_HARVESTER_CONFIG: HarvesterColonyConfig = {
  minConcentrationToHarvest: 0.2,
};

export class HarvesterColony {
  private harvesters: Map<string, HarvesterAnt> = new Map();
  private reports: Map<string, IntelligenceReport> = new Map();
  private config: HarvesterColonyConfig;
  private space: IPheromoneSpace;
  private antCounter = 0;
  private totalTicks = 0;
  private totalReports = 0;

  constructor(config: Partial<HarvesterColonyConfig>, space: IPheromoneSpace) {
    this.config = { ...DEFAULT_HARVESTER_CONFIG, ...config };
    this.space = space;
  }

  /**
   * Ensure harvesters exist at all active locations.
   * Call this periodically as the adaptive runtime refreshes promoted state.
   */
  async populate(): Promise<void> {
    const allLocations = await this.space.getLocationIds();

    for (const locId of allLocations) {
      // Skip if we already have a harvester here
      if (this.harvesters.has(locId)) continue;

      // Skip meta-locations
      if (locId.includes(':')) continue;

      // Check if location has enough activity
      const conc = await this.space.concentration(locId);
      if (conc >= this.config.minConcentrationToHarvest) {
        this.harvesters.set(locId, new HarvesterAnt({
          id: `harvest:${locId}:${++this.antCounter}`,
          locationId: locId,
        }));
      }
    }

    // Remove harvesters at dead locations
    for (const [locId, _harvester] of this.harvesters) {
      const conc = await this.space.concentration(locId);
      if (conc < this.config.minConcentrationToHarvest * 0.5) {
        this.harvesters.delete(locId);
        this.reports.delete(locId);
      }
    }
  }

  /**
   * Run ONE tick for all harvesters. Returns all fresh reports.
   */
  async tick(): Promise<IntelligenceReport[]> {
    const freshReports: IntelligenceReport[] = [];

    const results = await Promise.all(
      [...this.harvesters.values()].map(h => h.tick(this.space))
    );

    for (const result of results) {
      if (result.report) {
        this.reports.set(result.report.locationId, result.report);
        freshReports.push(result.report);
        this.totalReports++;
      }
      if (result.deposit) {
        await this.space.deposit(result.deposit);
      }
    }

    this.totalTicks++;
    return freshReports;
  }

  /**
   * Get the latest report for a specific location.
   */
  getReport(locationId: string): IntelligenceReport | null {
    return this.reports.get(locationId) ?? null;
  }

  /**
   * Get ALL current reports, sorted by conviction descending.
   */
  getAllReports(): IntelligenceReport[] {
    return [...this.reports.values()]
      .sort((a, b) => b.conviction - a.conviction);
  }

  /**
   * Get reports filtered by polarity.
   */
  getReportsByPolarity(polarity: SignalPolarity): IntelligenceReport[] {
    return this.getAllReports().filter(r => r.polarity === polarity);
  }

  /**
   * Get the top N reports by conviction.
   */
  getTopReports(n: number): IntelligenceReport[] {
    return this.getAllReports().slice(0, n);
  }

  getStats(): {
    harvesters: number;
    reports: number;
    totalTicks: number;
    totalReports: number;
  } {
    return {
      harvesters: this.harvesters.size,
      reports: this.reports.size,
      totalTicks: this.totalTicks,
      totalReports: this.totalReports,
    };
  }
}
