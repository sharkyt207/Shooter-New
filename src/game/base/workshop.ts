/**
 * The weapon workshop: attachments and repair.
 *
 * Fitting an attachment consumes it from the stash and returns whatever was
 * previously in that slot, so a part is never silently destroyed by a swap.
 * That symmetry matters more than it sounds - losing a suppressor to a misclick
 * is the kind of thing players do not forgive.
 *
 * Repair deliberately does not restore full durability: every service
 * permanently shaves a slice off the maximum. A weapon is a consumable on a
 * long timescale, which keeps the workbench relevant beyond the first hour.
 */

import { WEAPON } from '@/content/balance';
import { attachmentForItem, findAttachment, fitsWeapon } from '@/content/attachments';
import { findWeapon, weaponForItem } from '@/content/weapons';
import type { AttachmentSlot } from '@/content/types';
import { addItem, countItem, removeItem } from '@/game/inventory/inventory';
import { moduleLevel, type PlayerProfile } from './profile';

export type WorkshopFailure =
  | 'noWeapon'
  | 'unknownAttachment'
  | 'incompatible'
  | 'notInStash'
  | 'moduleTooLow'
  | 'notEnoughCredits'
  | 'nothingToRepair';

export interface WorkshopResult {
  ok: boolean;
  reason?: WorkshopFailure;
  /** Item returned to the stash, when a swap displaced something. */
  returnedItemId?: string;
  cost?: number;
}

/** Base workbench level required to change attachments. */
const FITTING_MODULE = 'base_workbench';
const FITTING_LEVEL = 1;
const REPAIR_LEVEL = 2;

/**
 * Fit an attachment into a slot, or clear the slot with `attachmentId = null`.
 */
export function fitAttachment(
  profile: PlayerProfile,
  slot: AttachmentSlot,
  attachmentId: string | null,
): WorkshopResult {
  const weaponItemId = profile.loadout.weaponItemId;
  if (!weaponItemId) return { ok: false, reason: 'noWeapon' };

  const weapon = weaponForItem(weaponItemId);
  if (!weapon) return { ok: false, reason: 'noWeapon' };
  if (!weapon.slots.includes(slot)) return { ok: false, reason: 'incompatible' };
  if (moduleLevel(profile, FITTING_MODULE) < FITTING_LEVEL) {
    return { ok: false, reason: 'moduleTooLow' };
  }

  const previousId = profile.loadout.attachments[slot];

  // Removing: return the old part and leave the slot empty.
  if (attachmentId === null) {
    if (!previousId) return { ok: true };
    delete profile.loadout.attachments[slot];
    const previous = findAttachment(previousId);
    if (previous) addItem(profile.stash, previous.itemId, 1);
    return { ok: true, returnedItemId: previous?.itemId };
  }

  const attachment = findAttachment(attachmentId);
  if (!attachment) return { ok: false, reason: 'unknownAttachment' };
  if (attachment.slot !== slot || !fitsWeapon(attachment, weapon.id)) {
    return { ok: false, reason: 'incompatible' };
  }
  if (countItem(profile.stash, attachment.itemId) <= 0) {
    return { ok: false, reason: 'notInStash' };
  }

  removeItem(profile.stash, attachment.itemId, 1);
  profile.loadout.attachments[slot] = attachmentId;

  // Swapping returns the displaced part rather than destroying it.
  let returnedItemId: string | undefined;
  if (previousId && previousId !== attachmentId) {
    const previous = findAttachment(previousId);
    if (previous) {
      addItem(profile.stash, previous.itemId, 1);
      returnedItemId = previous.itemId;
    }
  }

  return { ok: true, returnedItemId };
}

/** Credits to restore the equipped weapon to full condition. */
export function repairCost(profile: Readonly<PlayerProfile>): number {
  const weapon = currentWeapon(profile);
  if (!weapon) return 0;
  const missing = (1 - profile.loadout.weaponCondition) * weapon.durabilityMax;
  return Math.ceil(missing * WEAPON.repairCostPerPoint);
}

/**
 * Repair the equipped weapon.
 *
 * Restores condition up to a ceiling that drops with every service, so a
 * weapon slowly becomes unrepairable and has to be replaced.
 */
export function repairWeapon(profile: PlayerProfile): WorkshopResult {
  const weapon = currentWeapon(profile);
  if (!weapon) return { ok: false, reason: 'noWeapon' };
  if (moduleLevel(profile, FITTING_MODULE) < REPAIR_LEVEL) {
    return { ok: false, reason: 'moduleTooLow' };
  }

  const ceiling = repairCeiling(profile);
  if (profile.loadout.weaponCondition >= ceiling - 0.001) {
    return { ok: false, reason: 'nothingToRepair' };
  }

  const cost = repairCost(profile);
  if (profile.credits < cost) return { ok: false, reason: 'notEnoughCredits' };

  profile.credits -= cost;
  profile.loadout.weaponCondition = ceiling;
  profile.weaponRepairs = (profile.weaponRepairs ?? 0) + 1;

  return { ok: true, cost };
}

/** Highest condition this weapon can still reach, given past repairs. */
export function repairCeiling(profile: Readonly<PlayerProfile>): number {
  const repairs = profile.weaponRepairs ?? 0;
  return Math.max(0.35, 1 - repairs * WEAPON.repairWearPenalty);
}

function currentWeapon(profile: Readonly<PlayerProfile>) {
  const itemId = profile.loadout.weaponItemId;
  if (!itemId) return undefined;
  const weapon = weaponForItem(itemId);
  return weapon ? findWeapon(weapon.id) : undefined;
}

/** Attachments in the stash that fit the equipped weapon's given slot. */
export function availableAttachments(
  profile: Readonly<PlayerProfile>,
  slot: AttachmentSlot,
): Array<{ attachmentId: string; itemId: string; name: string }> {
  const weaponItemId = profile.loadout.weaponItemId;
  if (!weaponItemId) return [];

  const weapon = weaponForItem(weaponItemId);
  if (!weapon) return [];

  const result: Array<{ attachmentId: string; itemId: string; name: string }> = [];
  for (const slotItem of profile.stash.slots) {
    const attachment = attachmentForItem(slotItem.itemId);
    if (!attachment || attachment.slot !== slot) continue;
    if (!fitsWeapon(attachment, weapon.id)) continue;
    if (result.some((entry) => entry.attachmentId === attachment.id)) continue;
    result.push({ attachmentId: attachment.id, itemId: attachment.itemId, name: attachment.name });
  }
  return result;
}
