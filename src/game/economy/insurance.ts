/**
 * Insurance.
 *
 * Pay a premium before the raid; if the raid goes wrong, most of the insured
 * gear finds its way back to the base after a delay.
 *
 * Three deliberate limits keep it from cancelling the genre:
 *
 * 1. **It is not certain.** `META.insuranceReturnChance` is well under 1. A
 *    raid you cannot lose has no tension left (Pillar P1); insurance is meant
 *    to soften a bad night, not to make gear free.
 * 2. **It is not instant.** Gear comes back after twenty minutes — long enough
 *    that the next raid has to be run with something else.
 * 3. **It only covers what you wore.** Loot found in the rift is never insured.
 *    What the player *risked* can come back; what they *won* cannot.
 *
 * The premium is charged when the raid begins, alongside `commitLoadout`, so
 * insuring is a decision made at the same moment as the rest of the risk.
 */

import { META } from '@/content/balance';
import { findItem } from '@/content/items';
import { addItem } from '@/game/inventory/inventory';
import {
  moduleLevel,
  nextMetaRandom,
  type InsuranceReturn,
  type PlayerProfile,
} from '@/game/base/profile';
import { equippedItemIds, type Loadout } from '@/game/player/loadout';

/** Is the insurance desk staffed? The medical module runs it. */
export function insuranceAvailable(profile: Readonly<PlayerProfile>): boolean {
  return moduleLevel(profile, 'base_medical') >= 1;
}

/** Value of the gear insurance would cover: worn equipment only, never loot. */
export function insurableValue(loadout: Readonly<Loadout>): number {
  let value = 0;
  for (const id of equippedItemIds(loadout)) value += findItem(id)?.value ?? 0;
  return value;
}

export function premiumFor(profile: Readonly<PlayerProfile>, loadout: Readonly<Loadout>): number {
  const discount = Math.max(
    0,
    1 - moduleLevel(profile, 'base_medical') * META.insuranceDiscountPerMedicalLevel,
  );
  return Math.ceil(insurableValue(loadout) * META.insurancePremiumFactor * discount);
}

/** Minutes until insured gear arrives back, shortened by the medical module. */
export function returnMinutes(profile: Readonly<PlayerProfile>): number {
  const minutes =
    META.insuranceReturnMinutes -
    moduleLevel(profile, 'base_medical') * META.insuranceMinutesPerMedicalLevel;
  return Math.max(5, minutes);
}

export interface PremiumResult {
  ok: boolean;
  reason?: 'unavailable' | 'notEnoughCredits' | 'notInsured';
  premium?: number;
}

/**
 * Charge the premium as the raid starts.
 * Returns `notInsured` (not an error) when the player did not buy cover.
 */
export function chargePremium(profile: PlayerProfile): PremiumResult {
  if (!profile.loadout.insured) return { ok: false, reason: 'notInsured' };
  if (!insuranceAvailable(profile)) return { ok: false, reason: 'unavailable' };

  const premium = premiumFor(profile, profile.loadout);
  if (profile.credits < premium) return { ok: false, reason: 'notEnoughCredits' };

  profile.credits -= premium;
  return { ok: true, premium };
}

/**
 * Roll which insured items come home after a failed raid.
 *
 * Uses the profile's advancing meta cursor, so the outcome cannot be re-rolled
 * by reloading the save - the same rule the crafting queue follows.
 */
export function claimInsurance(
  profile: PlayerProfile,
  lostItemIds: readonly string[],
  now: number,
): InsuranceReturn[] {
  if (!profile.loadout.insured || lostItemIds.length === 0) return [];

  const readyAt = now + returnMinutes(profile) * 60 * 1000;
  const returned: InsuranceReturn[] = [];

  for (const itemId of lostItemIds) {
    if (!findItem(itemId)) continue;
    if (nextMetaRandom(profile) > META.insuranceReturnChance) continue;

    const existing = returned.find((entry) => entry.itemId === itemId);
    if (existing) existing.quantity++;
    else returned.push({ itemId, quantity: 1, readyAt });
  }

  profile.insuranceReturns.push(...returned);
  return returned;
}

export interface CollectedReturn {
  itemId: string;
  quantity: number;
  /** Items that did not fit into the stash. */
  overflow: number;
}

/** Move everything that has arrived into the stash. */
export function collectInsurance(profile: PlayerProfile, now: number): CollectedReturn[] {
  if (profile.insuranceReturns.length === 0) return [];

  const collected: CollectedReturn[] = [];
  const pending: InsuranceReturn[] = [];

  for (const entry of profile.insuranceReturns) {
    if (entry.readyAt > now) {
      pending.push(entry);
      continue;
    }
    const added = addItem(profile.stash, entry.itemId, entry.quantity);
    collected.push({
      itemId: entry.itemId,
      quantity: added,
      overflow: entry.quantity - added,
    });
  }

  profile.insuranceReturns = pending;
  return collected;
}
