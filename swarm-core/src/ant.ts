/**
 * ANT — The Atomic Computational Unit
 * 
 * ~15 lines of logic. No thinking. No processing. No intent.
 * Just: sense → rule → signal.
 * 
 * An ant:
 * - Has ONE input (sensor)
 * - Has 3-5 hardcoded rules
 * - Deposits pheromones into the shared space
 * - Is stateless — no memory of past ticks
 * - Is disposable — dies, gets replaced, nobody notices
 */

import {
  AntConfig,
  AntState,
  PheromoneDeposit,
  IPheromoneSpace,
} from './types';

export class Ant {
  private config: AntConfig;
  private state: AntState;
  private space: IPheromoneSpace;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(config: AntConfig, space: IPheromoneSpace) {
    this.config = config;
    this.space = space;
    this.state = {
      id: config.id,
      status: 'idle',
      tickCount: 0,
      lastTickAt: 0,
      depositsCount: 0,
    };
  }

  // ─── THE LOOP ───────────────────────────────
  // This is the entire ant. Everything it does.

  async tick(): Promise<PheromoneDeposit[]> {
    const deposits: PheromoneDeposit[] = [];

    try {
      this.state.status = 'sensing';

      // 1. SENSE — read my one input
      const input = await this.config.sensorFn();

      // 2. READ NEARBY — what other ants deposited at my location
      const nearby = await this.space.read(this.config.locationId);

      this.state.status = 'depositing';

      // 3. EVALUATE RULES — pure IF-THEN, no intelligence
      for (const rule of this.config.rules) {
        const deposit = rule.evaluate(input, nearby);
        if (deposit) {
          // Stamp with this ant's identity
          const stamped: PheromoneDeposit = {
            ...deposit,
            locationId: this.config.locationId,
            sourceAntId: this.config.id,
            sourceColony: this.config.colonyType,
            timestamp: Date.now(),
          };
          await this.space.deposit(stamped);
          deposits.push(stamped);
          this.state.depositsCount++;
        }
      }

      this.state.status = 'idle';
      this.state.tickCount++;
      this.state.lastTickAt = Date.now();

    } catch (err) {
      // Ant errors are silent. One ant failing changes nothing.
      // In a colony of thousands, individual failure is noise.
      this.state.status = 'idle';
    }

    return deposits;
  }

  // ─── LIFECYCLE ──────────────────────────────

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.config.intervalMs);
    // Run first tick immediately
    this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.state.status = 'dead';
  }

  // ─── READ STATE ─────────────────────────────

  getId(): string {
    return this.config.id;
  }

  getState(): Readonly<AntState> {
    return { ...this.state };
  }

  getColonyType(): string {
    return this.config.colonyType;
  }

  getLocationId(): string {
    return this.config.locationId;
  }

  isAlive(): boolean {
    return this.state.status !== 'dead';
  }
}
