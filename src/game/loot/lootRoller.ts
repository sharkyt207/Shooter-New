/**
 * Loot table rolling.
 *
 * Weighted draws with an explicit empty chance. The empty chance matters more
 * than it looks: a container that always pays out makes looting a chore rather
 * than a gamble, and the gamble is the point.
 */

import { findLootTable } from '@/content/lootTables';
import { findItem } from '@/content/items';
import type { SeededRandom } from '@/core/math/random';

export interface RolledItem {
  itemId: string;
  quantity: number;
}

export function rollLootTable(rng: SeededRandom, tableId: string): RolledItem[] {
  const table = findLootTable(tableId);
  if (!table) return [];

  const rolls = rng.int(table.rolls.min, table.rolls.max);
  const results = new Map<string, number>();

  for (let i = 0; i < rolls; i++) {
    if (rng.chance(table.emptyChance)) continue;

    const entry = rng.pickWeighted(table.entries, (e) => e.weight);
    if (!entry || !findItem(entry.itemId)) continue;

    const quantity = rng.int(entry.minQuantity, entry.maxQuantity);
    if (quantity <= 0) continue;

    results.set(entry.itemId, (results.get(entry.itemId) ?? 0) + quantity);
  }

  return [...results].map(([itemId, quantity]) => ({ itemId, quantity }));
}

/** Total trader value of a roll. Used by tests and balance tooling. */
export function rolledValue(items: readonly RolledItem[]): number {
  let value = 0;
  for (const item of items) {
    value += (findItem(item.itemId)?.value ?? 0) * item.quantity;
  }
  return value;
}
