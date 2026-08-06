import { describe, expect, it } from 'vitest';
import { RandomStreams, SeededRandom, hashString, seedSignature } from './random';

describe('SeededRandom', () => {
  it('is fully reproducible for the same seed', () => {
    const a = new SeededRandom(12345);
    const b = new SeededRandom(12345);
    const seqA = Array.from({ length: 50 }, () => a.float());
    const seqB = Array.from({ length: 50 }, () => b.float());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new SeededRandom(1);
    const b = new SeededRandom(2);
    expect(a.float()).not.toBe(b.float());
  });

  it('stays inside [0, 1)', () => {
    const rng = new SeededRandom(99);
    for (let i = 0; i < 5000; i++) {
      const value = rng.float();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('produces integers inclusive on both ends', () => {
    const rng = new SeededRandom(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(rng.int(1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('respects weights when picking', () => {
    const rng = new SeededRandom(4242);
    const items = [
      { id: 'common', weight: 90 },
      { id: 'rare', weight: 10 },
      { id: 'never', weight: 0 },
    ];

    const counts: Record<string, number> = { common: 0, rare: 0, never: 0 };
    for (let i = 0; i < 10000; i++) {
      const pick = rng.pickWeighted(items, (item) => item.weight);
      if (pick) counts[pick.id] = (counts[pick.id] ?? 0) + 1;
    }

    expect(counts['never']).toBe(0);
    // 90/10 split, generous tolerance so the test is not flaky by design.
    expect(counts['common'] as number).toBeGreaterThan(8600);
    expect(counts['common'] as number).toBeLessThan(9400);
  });

  it('restores an identical stream from a saved state', () => {
    const rng = new SeededRandom(555);
    for (let i = 0; i < 17; i++) rng.float();
    const state = rng.getState();
    const expected = Array.from({ length: 10 }, () => rng.float());

    const restored = new SeededRandom(555);
    restored.restore(state);
    const actual = Array.from({ length: 10 }, () => restored.float());

    expect(actual).toEqual(expected);
  });

  it('keeps gaussian draws centred on the mean', () => {
    const rng = new SeededRandom(31337);
    let sum = 0;
    const samples = 20000;
    for (let i = 0; i < samples; i++) sum += rng.gaussian(0, 1);
    expect(Math.abs(sum / samples)).toBeLessThan(0.05);
  });
});

describe('RandomStreams', () => {
  it('gives each stream an independent sequence', () => {
    const streams = new RandomStreams(2024);
    expect(streams.map.float()).not.toBe(streams.loot.float());
  });

  it('keeps map generation stable when other streams are consumed', () => {
    // This is the whole point of named streams (ADR-009): a change in combat
    // rolls must never shift the layout of the map.
    const a = new RandomStreams(777);
    const b = new RandomStreams(777);

    for (let i = 0; i < 100; i++) b.combat.float();

    const mapA = Array.from({ length: 20 }, () => a.map.float());
    const mapB = Array.from({ length: 20 }, () => b.map.float());
    expect(mapA).toEqual(mapB);
  });
});

describe('hashString / seedSignature', () => {
  it('hashes deterministically', () => {
    expect(hashString('map')).toBe(hashString('map'));
    expect(hashString('map')).not.toBe(hashString('loot'));
  });

  it('formats a four character signature', () => {
    expect(seedSignature(0x12348f3a)).toBe('8F3A');
    expect(seedSignature(0)).toHaveLength(4);
  });
});
