/**
 * The player's raid loadout.
 *
 * Everything listed here enters the raid and is lost on death. This is the
 * screen where the tension starts: the player decides how much value to put at
 * risk before a single shot is fired (Pillar P1).
 *
 * Since M2 a loadout is more than "which gun": which round is chambered, which
 * attachments are fitted and how worn the weapon is all change how it plays.
 */

import { PLAYER } from '@/content/balance';
import { findItem } from '@/content/items';
import { findAttachment } from '@/content/attachments';
import type { AttachmentLoadout } from '@/content/types';
import type { InventorySlot } from '@/game/inventory/inventory';

export interface Loadout {
  weaponItemId: string | null;
  armorItemId: string | null;
  helmetItemId: string | null;
  backpackItemId: string | null;
  /** Attachments fitted to the equipped weapon, keyed by slot. */
  attachments: AttachmentLoadout;
  /** Which round to chamber. Falls back to the weapon's default. */
  preferredAmmoItemId: string | null;
  /** 0..1 durability the weapon enters the raid with. */
  weaponCondition: number;
  /** Items packed for the raid: ammunition, medical supplies, throwables. */
  carried: InventorySlot[];

  /**
   * Secure container carried into the raid, or null.
   *
   * Whatever is inside comes home whether the player does or not. It is
   * deliberately tiny - a container that swallowed a whole raid's loot would
   * delete the decision it exists to create (Pillar P1).
   */
  secureContainerItemId: string | null;
  /** Contents of the secure container at the start of the raid. */
  secureItems: InventorySlot[];
  /** Insurance bought for this raid; the premium is charged on commit. */
  insured: boolean;
}

export function createEmptyLoadout(): Loadout {
  return {
    weaponItemId: null,
    armorItemId: null,
    helmetItemId: null,
    backpackItemId: null,
    attachments: {},
    preferredAmmoItemId: null,
    weaponCondition: 1,
    carried: [],
    secureContainerItemId: null,
    secureItems: [],
    insured: false,
  };
}

export function cloneLoadout(loadout: Readonly<Loadout>): Loadout {
  return {
    weaponItemId: loadout.weaponItemId,
    armorItemId: loadout.armorItemId,
    helmetItemId: loadout.helmetItemId,
    backpackItemId: loadout.backpackItemId,
    attachments: { ...loadout.attachments },
    preferredAmmoItemId: loadout.preferredAmmoItemId,
    weaponCondition: loadout.weaponCondition,
    carried: loadout.carried.map((slot) => ({ ...slot })),
    secureContainerItemId: loadout.secureContainerItemId,
    secureItems: loadout.secureItems.map((slot) => ({ ...slot })),
    insured: loadout.insured,
  };
}

/** Capacity of the carried secure container, in kilograms. 0 when none. */
export function secureCapacityKg(loadout: Readonly<Loadout>): number {
  if (!loadout.secureContainerItemId) return 0;
  return findItem(loadout.secureContainerItemId)?.capacityKg ?? 0;
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
  for (const id of equippedItemIds(loadout)) {
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

/**
 * Weight of everything worn or held.
 *
 * Attachments count too - an over-modified weapon is genuinely heavier, which
 * is the counterweight that keeps "fit everything" from being free.
 */
export function equippedWeightKg(loadout: Readonly<Loadout>): number {
  let weight = 0;
  for (const id of [loadout.weaponItemId, loadout.armorItemId, loadout.helmetItemId, loadout.backpackItemId]) {
    if (id) weight += findItem(id)?.weight ?? 0;
  }
  for (const attachmentItemId of Object.values(loadout.attachments)) {
    if (!attachmentItemId) continue;
    weight += findAttachment(attachmentItemId)?.modifiers.weightAdd ?? 0;
  }
  return weight;
}

/** Every item id the loadout occupies in the stash, attachments included. */
export function equippedItemIds(loadout: Readonly<Loadout>): string[] {
  const ids: string[] = [];
  for (const id of [
    loadout.weaponItemId,
    loadout.armorItemId,
    loadout.helmetItemId,
    loadout.backpackItemId,
    loadout.secureContainerItemId,
  ]) {
    if (id) ids.push(id);
  }
  for (const attachmentId of Object.values(loadout.attachments)) {
    if (!attachmentId) continue;
    const def = findAttachment(attachmentId);
    if (def) ids.push(def.itemId);
  }
  return ids;
}
