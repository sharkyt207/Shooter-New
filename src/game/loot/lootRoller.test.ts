import { describe, expect, it } from 'vitest';
import { LOOT_TABLES } from '@/content/lootTables';
import { findItem } from '@/content/items';
import { SeededRandom } from '@/core/math/random';
import { rollLootTable, rolledValue } from './lootRoller';

describe('loot rolling', () => {
  it('is deterministic for the same seed', () => {
    const a = rollLootTable(new SeededRandom(2468), 'loot_crate_common');
    const b = rollLootTable(new SeededRandom(2468), 'loot_crate_common');
    expect(a).toEqual(b);
  });

  it('returns nothing for an unknown table instead of throwing', () => {
    expect(rollLootTable(new SeededRandom(1), 'loot_nope')).toEqual([]);
  });

  it('only ever yields items that exist in the catalogue', () => {
    const rng = new SeededRandom(13579);
    for (const tableId of Object.keys(LOOT_TABLES)) {
      for (let i = 0; i < 200; i++) {
        for (const entry of rollLootTable(rng, tableId)) {
          expect(findItem(entry.itemId)).toBeDefined();
          expect(entry.quantity).toBeGreaterThan(0);
        }
      }
    }
  });

  it('respects the configured quantity bounds', () => {
    const rng = new SeededRandom(864);
    const table = LOOT_TABLES.loot_medcase;
    const bounds = new Map(table.entries.map((e) => [e.itemId as string, e]));

    for (let i = 0; i < 500; i++) {
      for (const entry of rollLootTable(rng, 'loot_medcase')) {
        const def = bounds.get(entry.itemId);
        expect(def).toBeDefined();
        // A single roll can produce at most maxQuantity, but the same item can
        // come up in several rolls of the same open, so scale by the roll cap.
        expect(entry.quantity).toBeLessThanOrEqual(
          (def as { maxQuantity: number }).maxQuantity * table.rolls.max,
        );
      }
    }
  });

  it('produces an empty result sometimes, but not usually', () => {
    const rng = new SeededRandom(999);
    let empties = 0;
    const runs = 2000;
    for (let i = 0; i < runs; i++) {
      if (rollLootTable(rng, 'loot_crate_common').length === 0) empties++;
    }
    // emptyChance 0.18 across 1-3 rolls: rare, but it has to happen.
    expect(empties).toBeGreaterThan(0);
    expect(empties / runs).toBeLessThan(0.25);
  });

  it('makes echo caches meaningfully more valuable than common crates', () => {
    // This is a balance assertion, not just a code assertion: the whole risk
    // structure depends on anomaly caches being worth the walk.
    const rng = new SeededRandom(3141);
    let crateValue = 0;
    let cacheValue = 0;
    const runs = 1000;

    for (let i = 0; i < runs; i++) {
      crateValue += rolledValue(rollLootTable(rng, 'loot_crate_common'));
      cacheValue += rolledValue(rollLootTable(rng, 'loot_echo_cache'));
    }

    expect(cacheValue).toBeGreaterThan(crateValue * 3);
  });

  it('never returns duplicate entries for the same item', () => {
    const rng = new SeededRandom(777);
    for (let i = 0; i < 500; i++) {
      const roll = rollLootTable(rng, 'loot_locker_military');
      const ids = roll.map((entry) => entry.itemId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
