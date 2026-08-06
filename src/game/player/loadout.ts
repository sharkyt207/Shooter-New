/**
 * The player's raid loadout.
 *
 * Everything listed here enters the raid and is lost on death. This is the
 * screen where the tension starts: the player decides how much value to put at
 * risk before a single shot is fired (Pillar P1).
 */

import { PLAYER } from '@/content/balance';
import { findItem } from '@/content/items';
import type { InventorySlot } from '@/game/inventory/inventory';

export interface Loadout {
  weaponItemId: string | null;
  armorItemId: string | null;
  backpackItemId: string | null;
  /** Items packed for the raid: ammunition, medical supplies, tools. */
  carried: InventorySlot[];
}

export function createEmptyLoadout(): Loadout {
  return { weaponItemId: null, armorItemId: null, backpackItemId: null, carried: [] };
}

export function cloneLoadout(loadout: Readonly<Loadout>): Loadout {
  return {
    weaponItemId: loadout.weaponItemId,
    armorItemId: loadout.armorItemId,
    backpackItemId: loadout.backpackItemId,
    carried: loadout.carried.map((slot) => ({ ...slot })),
  };
}

/** Carry capacity granted by the equipped backpack, or the bare minimum. */
export function loadoutCapacityKg(loadout: Readonly<Loadout>): number {
  if (!loadout.backpackItemId) return PLAYER.baseCapacityKg;
  const def = findItem(loadout.backpackItemId);
  return def?.capacityKg ?? PLAYER.baseCapacityKg;
}

/**
 * Total credit value the player is risking.
 * Shown prominently on the loadout screen - it is the number that should make
 * the player hesitate.
 */
export function loadoutValue(loadout: Readonly<Loadout>): number {
  let value = 0;
  for (const id of [loadout.weaponItemId, loadout.armorItemId, loadout.backpackItemId]) {
    if (!id) continue;
    value += findItem(id)?.value ?? 0;
  }
  for (const slot of loadout.carried) {
    value += (findItem(slot.itemId)?.value ?? 0) * slot.quantity;
  }
  return value;
}

export function loadoutWeightKg(loadout: Readonly<Loadout>): number {
  let weight = 0;
  for (const slot of loadout.carried) {
    weight += (findItem(slot.itemId)?.weight ?? 0) * slot.quantity;
  }
  return weight;
}
