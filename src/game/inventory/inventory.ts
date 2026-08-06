/**
 * Weight- and slot-based inventory (ADR-005).
 *
 * Deliberately not a Tetris grid: on a phone, dragging 1x2 items with a thumb
 * is a usability disaster. The tension we actually want - "what do I leave
 * behind?" - comes from the weight budget, and that works far better on touch.
 *
 * Plain data plus free functions, so an inventory survives a JSON round-trip
 * without needing to be rehydrated into a class.
 */

import { findItem } from '@/content/items';
import { ECONOMY } from '@/content/balance';

export interface InventorySlot {
  itemId: string;
  quantity: number;
}

export interface InventoryState {
  slots: InventorySlot[];
  /** Maximum carried weight in kilograms. */
  capacityKg: number;
}

export function createInventory(capacityKg: number, slots: InventorySlot[] = []): InventoryState {
  return { slots, capacityKg };
}

export function cloneInventory(inv: Readonly<InventoryState>): InventoryState {
  return {
    capacityKg: inv.capacityKg,
    slots: inv.slots.map((s) => ({ itemId: s.itemId, quantity: s.quantity })),
  };
}

export function totalWeight(inv: Readonly<InventoryState>): number {
  let weight = 0;
  for (const slot of inv.slots) {
    const def = findItem(slot.itemId);
    if (def) weight += def.weight * slot.quantity;
  }
  return weight;
}

export function totalValue(inv: Readonly<InventoryState>): number {
  let value = 0;
  for (const slot of inv.slots) {
    const def = findItem(slot.itemId);
    if (def) value += def.value * slot.quantity;
  }
  return value;
}

export function remainingCapacity(inv: Readonly<InventoryState>): number {
  return Math.max(0, inv.capacityKg - totalWeight(inv));
}

/** 0..1+, where values above 1 mean overloaded. */
export function loadFraction(inv: Readonly<InventoryState>): number {
  if (inv.capacityKg <= 0) return 0;
  return totalWeight(inv) / inv.capacityKg;
}

export function countItem(inv: Readonly<InventoryState>, itemId: string): number {
  let count = 0;
  for (const slot of inv.slots) {
    if (slot.itemId === itemId) count += slot.quantity;
  }
  return count;
}

export function hasItem(inv: Readonly<InventoryState>, itemId: string, quantity = 1): boolean {
  return countItem(inv, itemId) >= quantity;
}

/**
 * How many of `itemId` still fit, limited by remaining weight.
 * Returns `quantity` when everything fits.
 */
export function fittableQuantity(
  inv: Readonly<InventoryState>,
  itemId: string,
  quantity: number,
): number {
  const def = findItem(itemId);
  if (!def) return 0;
  if (def.weight <= 0) return quantity;
  const free = remainingCapacity(inv);
  return Math.max(0, Math.min(quantity, Math.floor(free / def.weight)));
}

/**
 * Add items, respecting stack sizes and the weight budget.
 * Returns how many were actually added - the caller decides what to do with
 * the remainder (usually: leave it on the ground).
 */
export function addItem(inv: InventoryState, itemId: string, quantity: number): number {
  const def = findItem(itemId);
  if (!def || quantity <= 0) return 0;

  let toAdd = fittableQuantity(inv, itemId, quantity);
  if (toAdd <= 0) return 0;
  const added = toAdd;

  // Top up existing stacks first, then open new ones.
  for (const slot of inv.slots) {
    if (toAdd <= 0) break;
    if (slot.itemId !== itemId) continue;
    const space = def.stackSize - slot.quantity;
    if (space <= 0) continue;
    const move = Math.min(space, toAdd);
    slot.quantity += move;
    toAdd -= move;
  }

  while (toAdd > 0) {
    const move = Math.min(def.stackSize, toAdd);
    inv.slots.push({ itemId, quantity: move });
    toAdd -= move;
  }

  return added;
}

/**
 * Remove items. Returns how many were actually removed.
 * Empties the smallest stacks first so partial stacks get consolidated.
 */
export function removeItem(inv: InventoryState, itemId: string, quantity: number): number {
  if (quantity <= 0) return 0;

  let toRemove = quantity;
  let removed = 0;

  const indices = inv.slots
    .map((slot, index) => ({ slot, index }))
    .filter((e) => e.slot.itemId === itemId)
    .sort((a, b) => a.slot.quantity - b.slot.quantity);

  for (const { slot } of indices) {
    if (toRemove <= 0) break;
    const move = Math.min(slot.quantity, toRemove);
    slot.quantity -= move;
    toRemove -= move;
    removed += move;
  }

  compact(inv);
  return removed;
}

/** Drop empty slots and merge partial stacks of the same item. */
export function compact(inv: InventoryState): void {
  const merged = new Map<string, number>();
  for (const slot of inv.slots) {
    if (slot.quantity <= 0) continue;
    merged.set(slot.itemId, (merged.get(slot.itemId) ?? 0) + slot.quantity);
  }

  inv.slots.length = 0;
  for (const [itemId, total] of merged) {
    const def = findItem(itemId);
    const stackSize = def?.stackSize ?? 1;
    let left = total;
    while (left > 0) {
      const move = Math.min(stackSize, left);
      inv.slots.push({ itemId, quantity: move });
      left -= move;
    }
  }
}

/** Move as much as possible from one inventory into another. Returns the moved count. */
export function transferItem(
  from: InventoryState,
  to: InventoryState,
  itemId: string,
  quantity: number,
): number {
  const available = Math.min(quantity, countItem(from, itemId));
  if (available <= 0) return 0;
  const moved = addItem(to, itemId, available);
  if (moved > 0) removeItem(from, itemId, moved);
  return moved;
}

/**
 * Move everything possible. Returns what could not be moved, consolidated per
 * item - callers want "3 bandages did not fit", not one entry per source stack.
 */
export function transferAll(from: InventoryState, to: InventoryState): InventorySlot[] {
  const leftovers = new Map<string, number>();
  // Snapshot first: transferItem mutates `from` while we iterate.
  const snapshot = from.slots.map((s) => ({ ...s }));
  for (const slot of snapshot) {
    const moved = transferItem(from, to, slot.itemId, slot.quantity);
    if (moved < slot.quantity) {
      leftovers.set(slot.itemId, (leftovers.get(slot.itemId) ?? 0) + (slot.quantity - moved));
    }
  }
  return [...leftovers].map(([itemId, quantity]) => ({ itemId, quantity }));
}

export type SortMode = 'value' | 'weight' | 'category' | 'name';

export function sortInventory(inv: InventoryState, mode: SortMode): void {
  compact(inv);
  inv.slots.sort((a, b) => {
    const da = findItem(a.itemId);
    const db = findItem(b.itemId);
    if (!da || !db) return 0;
    switch (mode) {
      case 'value':
        return db.value * b.quantity - da.value * a.quantity;
      case 'weight':
        return db.weight * b.quantity - da.weight * a.quantity;
      case 'category':
        return da.category === db.category
          ? da.name.localeCompare(db.name)
          : da.category.localeCompare(db.category);
      case 'name':
        return da.name.localeCompare(db.name);
    }
  });
}

/** What a trader pays for the whole inventory. */
export function sellValue(inv: Readonly<InventoryState>): number {
  return Math.floor(totalValue(inv) * ECONOMY.sellFactor);
}
