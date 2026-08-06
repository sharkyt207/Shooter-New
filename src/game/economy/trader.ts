/**
 * Trading and post-raid settlement.
 *
 * Prices scale with the trader module level: upgrading the base is what turns
 * the same loot into more credits. Reputation, dynamic pricing and the black
 * market follow in M5.
 */

import { ECONOMY } from '@/content/balance';
import { findItem } from '@/content/items';
import { addItem, countItem, removeItem, type InventoryState } from '@/game/inventory/inventory';
import { addXp, moduleLevel, type PlayerProfile } from '@/game/base/profile';
import type { RaidOutcome } from '@/game/gameEvents';

/** Sell multiplier for the trader's current level. */
export function sellFactorFor(profile: Readonly<PlayerProfile>): number {
  const level = moduleLevel(profile, 'base_trader');
  return ECONOMY.sellFactor + Math.max(0, level - 1) * 0.08;
}

export function buyFactorFor(profile: Readonly<PlayerProfile>): number {
  const level = moduleLevel(profile, 'base_trader');
  return Math.max(1.05, ECONOMY.buyFactor - Math.max(0, level - 1) * 0.07);
}

export function sellPriceOf(profile: Readonly<PlayerProfile>, itemId: string): number {
  const def = findItem(itemId);
  if (!def) return 0;
  return Math.max(1, Math.floor(def.value * sellFactorFor(profile)));
}

export function buyPriceOf(profile: Readonly<PlayerProfile>, itemId: string): number {
  const def = findItem(itemId);
  if (!def) return 0;
  return Math.max(1, Math.ceil(def.value * buyFactorFor(profile)));
}

export interface TradeResult {
  ok: boolean;
  reason?: 'notEnoughItems' | 'notEnoughCredits' | 'noSpace' | 'unknownItem';
  credits?: number;
  quantity?: number;
}

export function sellItem(profile: PlayerProfile, itemId: string, quantity: number): TradeResult {
  if (!findItem(itemId)) return { ok: false, reason: 'unknownItem' };

  const available = countItem(profile.stash, itemId);
  if (available < quantity || quantity <= 0) return { ok: false, reason: 'notEnoughItems' };

  const removed = removeItem(profile.stash, itemId, quantity);
  const credits = sellPriceOf(profile, itemId) * removed;
  profile.credits += credits;

  return { ok: true, credits, quantity: removed };
}

export function buyItem(profile: PlayerProfile, itemId: string, quantity: number): TradeResult {
  if (!findItem(itemId)) return { ok: false, reason: 'unknownItem' };
  if (quantity <= 0) return { ok: false, reason: 'notEnoughItems' };

  const cost = buyPriceOf(profile, itemId) * quantity;
  if (profile.credits < cost) return { ok: false, reason: 'notEnoughCredits' };

  const added = addItem(profile.stash, itemId, quantity);
  if (added <= 0) return { ok: false, reason: 'noSpace' };

  // Charge only for what actually fit, so a full stash never eats credits.
  const actualCost = buyPriceOf(profile, itemId) * added;
  profile.credits -= actualCost;

  return { ok: true, credits: -actualCost, quantity: added };
}

/** What the trader currently offers. Deliberately small and useful for M1. */
export const TRADER_STOCK: ReadonlyArray<{ itemId: string; quantity: number }> = [
  { itemId: 'itm_ammo_9mm', quantity: 240 },
  { itemId: 'itm_ammo_12', quantity: 90 },
  { itemId: 'itm_ammo_74', quantity: 120 },
  { itemId: 'itm_bandage', quantity: 12 },
  { itemId: 'itm_medkit', quantity: 4 },
  { itemId: 'itm_armor_fiber', quantity: 2 },
  { itemId: 'itm_bag_medium', quantity: 1 },
  { itemId: 'itm_wpn_bruch', quantity: 1 },
];

export interface SettlementReport {
  outcome: RaidOutcome;
  /** Items that did not fit into the stash and were lost. */
  overflow: Array<{ itemId: string; quantity: number }>;
  leveledUp: boolean;
  newLevel: number;
}

/**
 * Apply a raid result to the profile: move loot into the stash, award XP,
 * update statistics, and on death remove everything that went into the raid.
 */
export function settleRaid(profile: PlayerProfile, outcome: RaidOutcome): SettlementReport {
  const overflow: Array<{ itemId: string; quantity: number }> = [];

  if (outcome.kind === 'extracted') {
    for (const entry of outcome.loot) {
      const added = addItem(profile.stash, entry.itemId, entry.quantity);
      if (added < entry.quantity) {
        overflow.push({ itemId: entry.itemId, quantity: entry.quantity - added });
      }
    }
    profile.stats.extractions++;
    profile.stats.totalLootValue += outcome.lootValue;
    profile.stats.bestHaul = Math.max(profile.stats.bestHaul, outcome.lootValue);
  } else {
    // Gear loss. The loadout items are already gone - they were consumed when
    // the raid started (see `commitLoadout`).
    if (outcome.kind === 'died') profile.stats.deaths++;
    else profile.stats.timeouts++;
    profile.echoShards += outcome.retainedShards;
  }

  profile.stats.kills += outcome.kills;
  const leveledUp = addXp(profile, outcome.xp);

  return { outcome, overflow, leveledUp, newLevel: profile.level };
}

/**
 * Remove the loadout from the stash as the raid begins.
 *
 * Doing this up front rather than on death is what makes the risk real and
 * unambiguous: the moment you enter the rift, that gear has left your stash.
 */
export function commitLoadout(profile: PlayerProfile): boolean {
  const { loadout, stash } = profile;
  const required: Array<{ itemId: string; quantity: number }> = [];

  for (const id of [loadout.weaponItemId, loadout.armorItemId, loadout.backpackItemId]) {
    if (id) required.push({ itemId: id, quantity: 1 });
  }
  for (const slot of loadout.carried) {
    required.push({ itemId: slot.itemId, quantity: slot.quantity });
  }

  // Verify everything is present before removing anything - a partial commit
  // would silently destroy items.
  for (const entry of required) {
    if (countItem(stash, entry.itemId) < entry.quantity) return false;
  }
  for (const entry of required) {
    removeItem(stash, entry.itemId, entry.quantity);
  }

  profile.stats.raidsStarted++;
  return true;
}

/** Put the loadout back, e.g. when the player backs out of the briefing. */
export function refundLoadout(stash: InventoryState, profile: Readonly<PlayerProfile>): void {
  const { loadout } = profile;
  for (const id of [loadout.weaponItemId, loadout.armorItemId, loadout.backpackItemId]) {
    if (id) addItem(stash, id, 1);
  }
  for (const slot of loadout.carried) addItem(stash, slot.itemId, slot.quantity);
}
