import { TerrainType } from '../adaptive-types';

export interface FrontierItem {
  url: string;
  domain: string;
  terrainHint?: TerrainType;
  sourceProviderId: string;
  discoveredFrom?: string;
  depth: number;
  priority: number;
  title?: string;
  snippet?: string;
}

export class QueryFrontier {
  private items: FrontierItem[] = [];
  private seen = new Set<string>();

  push(item: FrontierItem): boolean {
    if (this.seen.has(item.url)) return false;
    this.seen.add(item.url);
    this.items.push(item);
    return true;
  }

  pushMany(items: FrontierItem[]): number {
    let added = 0;
    for (const item of items) {
      if (this.push(item)) added += 1;
    }
    return added;
  }

  pop(preferredTerrains: TerrainType[] = []): FrontierItem | null {
    if (this.items.length === 0) return null;
    this.items.sort((a, b) => {
      const aPref = a.terrainHint && preferredTerrains.includes(a.terrainHint) ? 0.15 : 0;
      const bPref = b.terrainHint && preferredTerrains.includes(b.terrainHint) ? 0.15 : 0;
      return (b.priority + bPref) - (a.priority + aPref);
    });
    return this.items.shift() || null;
  }

  size(): number {
    return this.items.length;
  }

  snapshot(limit: number = 20): FrontierItem[] {
    return this.items.slice(0, limit);
  }

  terrainHistogram(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of this.items) {
      const terrain = item.terrainHint || 'unknown';
      counts[terrain] = (counts[terrain] || 0) + 1;
    }
    return counts;
  }
}
