/**
 * Deterministic pseudo-random number generation (ADR-009).
 *
 * `Math.random()` is banned inside `src/game/**` and the boundary checker
 * enforces it. Everything random in the simulation flows through here.
 *
 * Named streams matter: map generation, loot rolls, AI decisions and combat
 * each get their own generator seeded from the raid seed. That way a change to
 * combat rolls cannot shift the layout of the map - which keeps balance tests
 * and bug reports reproducible.
 */

/** mulberry32 - small, fast, good distribution, trivially reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string into a 32-bit seed (FNV-1a). Lets us seed streams by name. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export class SeededRandom {
  private next: () => number;
  private callCount = 0;

  constructor(public readonly seed: number) {
    this.next = mulberry32(seed);
  }

  /** How many numbers have been drawn. Useful for determinism assertions. */
  get draws(): number {
    return this.callCount;
  }

  /** Uniform float in [0, 1). */
  float(): number {
    this.callCount++;
    return this.next();
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.float() * (max - min);
  }

  /** Uniform integer in [min, max] - inclusive on both ends. */
  int(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(this.float() * (max - min + 1));
  }

  /** True with the given probability (0..1). */
  chance(probability: number): boolean {
    return this.float() < probability;
  }

  /** Random sign, -1 or 1. */
  sign(): number {
    return this.float() < 0.5 ? -1 : 1;
  }

  /** Random angle in radians, [0, 2*PI). */
  angle(): number {
    return this.float() * Math.PI * 2;
  }

  /** Uniformly distributed point inside the unit circle, written into `out`. */
  insideUnitCircle(out: { x: number; y: number }): { x: number; y: number } {
    const angle = this.angle();
    const radius = Math.sqrt(this.float());
    out.x = Math.cos(angle) * radius;
    out.y = Math.sin(angle) * radius;
    return out;
  }

  /**
   * Approximately normal distribution via the polar Box-Muller transform.
   * Used for weapon spread, where a bell curve feels far better than uniform.
   */
  gaussian(mean = 0, stdDev = 1): number {
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = this.float() * 2 - 1;
      v = this.float() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    return mean + stdDev * u * Math.sqrt((-2 * Math.log(s)) / s);
  }

  /** Pick one element. Returns undefined only for an empty array. */
  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[this.int(0, items.length - 1)];
  }

  /**
   * Weighted pick. `weightOf` must return a non-negative number.
   * Entries with weight 0 are never selected.
   */
  pickWeighted<T>(items: readonly T[], weightOf: (item: T) => number): T | undefined {
    let total = 0;
    for (const item of items) {
      const w = weightOf(item);
      if (w > 0) total += w;
    }
    if (total <= 0) return undefined;

    let roll = this.float() * total;
    for (const item of items) {
      const w = weightOf(item);
      if (w <= 0) continue;
      roll -= w;
      if (roll < 0) return item;
    }
    return items[items.length - 1];
  }

  /** Fisher-Yates shuffle, in place. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const a = items[i] as T;
      const b = items[j] as T;
      items[i] = b;
      items[j] = a;
    }
    return items;
  }

  /** Snapshot the internal counter so a save can restore an identical stream. */
  getState(): RandomState {
    return { seed: this.seed, draws: this.callCount };
  }

  /** Restore a stream by replaying its draw count. */
  restore(state: RandomState): void {
    this.next = mulberry32(state.seed);
    this.callCount = 0;
    for (let i = 0; i < state.draws; i++) this.float();
  }
}

export interface RandomState {
  seed: number;
  draws: number;
}

export type RandomStreamName = 'map' | 'loot' | 'ai' | 'combat' | 'misc';

/**
 * A bundle of independent, named generators derived from one raid seed.
 */
export class RandomStreams {
  readonly map: SeededRandom;
  readonly loot: SeededRandom;
  readonly ai: SeededRandom;
  readonly combat: SeededRandom;
  readonly misc: SeededRandom;

  constructor(public readonly rootSeed: number) {
    this.map = new SeededRandom(rootSeed ^ hashString('map'));
    this.loot = new SeededRandom(rootSeed ^ hashString('loot'));
    this.ai = new SeededRandom(rootSeed ^ hashString('ai'));
    this.combat = new SeededRandom(rootSeed ^ hashString('combat'));
    this.misc = new SeededRandom(rootSeed ^ hashString('misc'));
  }

  get(name: RandomStreamName): SeededRandom {
    return this[name];
  }
}

/**
 * Turn a raid seed into a short, readable signature for the briefing screen.
 * "Riss-Signatur 8F3A" reads far better than a nine digit number.
 */
export function seedSignature(seed: number): string {
  return (seed >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(-4);
}
