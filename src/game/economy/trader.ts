/**
 * Trading and post-raid settlement.
 *
 * Since M5 there are three traders with different opinions, and a price is a
 * function of four things: the item, who is buying, how well they know you, and
 * how good your trader contact is. A single shop with one rate turns loot into
 * an undifferentiated pile of credits; three buyers turn the same pile into a
 * question worth asking.
 *
 * The one invariant the whole economy rests on, enforced by a test: **no trader
 * ever buys higher than they sell.** The moment that flips, the game has an
 * infinite money loop and every other number stops mattering.
 */

import { ECONOMY, META } from '@/content/balance';
import { findItem } from '@/content/items';
import { findTrader, type TraderId } from '@/content/traders';
import type { ItemCategory } from '@/content/types';
import { addItem, countItem, removeItem, type InventoryState } from '@/game/inventory/inventory';
import { addXp, moduleLevel, type PlayerProfile } from '@/game/base/profile';
import { addReputation, reputationForTrade, tierOf, traderUnlocked } from './reputation';
import { advanceQuest, type QuestCompletion } from '@/game/base/questLine';
import { chargePremium, claimInsurance, returnMinutes } from './insurance';
import { equippedItemIds } from '@/game/player/loadout';
import type { RaidOutcome } from '@/game/gameEvents';

export const DEFAULT_TRADER: TraderId = 'trd_quartermaster';

/** Premium this trader pays for a category, or 1 when they are indifferent. */
function premiumFor(traderId: string, category: ItemCategory | undefined): number {
  const def = findTrader(traderId);
  if (!def || !category) return 1;
  return def.premiumCategories.find((entry) => entry.category === category)?.factor ?? 1;
}

export function refusesItem(traderId: string, itemId: string): boolean {
  const def = findTrader(traderId);
  const item = findItem(itemId);
  if (!def || !item) return true;
  return (def.refuses as readonly string[]).includes(item.category);
}

/** Fraction of value this trader pays right now. */
export function sellFactorFor(profile: Readonly<PlayerProfile>, traderId: string): number {
  const def = findTrader(traderId);
  const base = def?.baseSellFactor ?? ECONOMY.sellFactor;
  // The trader module represents your standing with the whole network; the
  // reputation tier represents your standing with this one person.
  const moduleBonus = Math.max(0, moduleLevel(profile, 'base_trader') - 1) * 0.05;
  const tierBonus = tierOf(profile, traderId) * META.sellBonusPerTier;
  return base + moduleBonus + tierBonus;
}

export function buyFactorFor(profile: Readonly<PlayerProfile>, traderId: string): number {
  const def = findTrader(traderId);
  const base = def?.baseBuyFactor ?? ECONOMY.buyFactor;
  const moduleBonus = Math.max(0, moduleLevel(profile, 'base_trader') - 1) * 0.05;
  const tierBonus = tierOf(profile, traderId) * META.buyDiscountPerTier;
  return Math.max(sellFactorFor(profile, traderId) + 0.1, base - moduleBonus - tierBonus);
}

export function sellPriceOf(
  profile: Readonly<PlayerProfile>,
  itemId: string,
  traderId: string = DEFAULT_TRADER,
): number {
  const def = findItem(itemId);
  if (!def || refusesItem(traderId, itemId)) return 0;
  const factor = sellFactorFor(profile, traderId) * premiumFor(traderId, def.category);
  return Math.max(1, Math.floor(def.value * factor));
}

/**
 * What the trader charges.
 *
 * The category premium applies to **both** sides. That is not just symmetry for
 * its own sake: a trader who pays over the odds for bandages is a trader who
 * values bandages, and would hardly then sell them cheap. Applying it only to
 * the buying side opened a genuine infinite-money loop - at high reputation the
 * medic paid 51 for a bandage she sold at 48 - which is why the price direction
 * is asserted for every trader, tier and base level in `economy.test.ts`.
 *
 * The final `Math.max` is the belt to that braces: whatever the factors do, a
 * trader never sells an item for less than they would pay for it.
 */
export function buyPriceOf(
  profile: Readonly<PlayerProfile>,
  itemId: string,
  traderId: string = DEFAULT_TRADER,
): number {
  const def = findItem(itemId);
  if (!def) return 0;

  const factor = buyFactorFor(profile, traderId) * premiumFor(traderId, def.category);
  const price = Math.max(1, Math.ceil(def.value * factor));
  return Math.max(price, sellPriceOf(profile, itemId, traderId) + 1);
}

export interface TradeResult {
  ok: boolean;
  reason?: 'notEnoughItems' | 'notEnoughCredits' | 'noSpace' | 'unknownItem' | 'refused' | 'locked';
  credits?: number;
  quantity?: number;
  /** New reputation tier, when the trade pushed the player into one. */
  newTier?: number;
}

export function sellItem(
  profile: PlayerProfile,
  itemId: string,
  quantity: number,
  traderId: string = DEFAULT_TRADER,
): TradeResult {
  if (!findItem(itemId)) return { ok: false, reason: 'unknownItem' };
  if (!traderUnlocked(profile, traderId)) return { ok: false, reason: 'locked' };
  if (refusesItem(traderId, itemId)) return { ok: false, reason: 'refused' };

  const available = countItem(profile.stash, itemId);
  if (available < quantity || quantity <= 0) return { ok: false, reason: 'notEnoughItems' };

  const removed = removeItem(profile.stash, itemId, quantity);
  const credits = sellPriceOf(profile, itemId, traderId) * removed;
  profile.credits += credits;

  const before = tierOf(profile, traderId);
  const tier = addReputation(profile, traderId, reputationForTrade(credits));

  return { ok: true, credits, quantity: removed, ...(tier > before ? { newTier: tier } : {}) };
}

export function buyItem(
  profile: PlayerProfile,
  itemId: string,
  quantity: number,
  traderId: string = DEFAULT_TRADER,
): TradeResult {
  if (!findItem(itemId)) return { ok: false, reason: 'unknownItem' };
  if (!traderUnlocked(profile, traderId)) return { ok: false, reason: 'locked' };
  if (quantity <= 0) return { ok: false, reason: 'notEnoughItems' };

  const price = buyPriceOf(profile, itemId, traderId);
  if (profile.credits < price * quantity) return { ok: false, reason: 'notEnoughCredits' };

  const added = addItem(profile.stash, itemId, quantity);
  if (added <= 0) return { ok: false, reason: 'noSpace' };

  // Charge only for what actually fit, so a full stash never eats credits.
  const actualCost = price * added;
  profile.credits -= actualCost;

  const before = tierOf(profile, traderId);
  const tier = addReputation(profile, traderId, reputationForTrade(actualCost));

  return {
    ok: true,
    credits: -actualCost,
    quantity: added,
    ...(tier > before ? { newTier: tier } : {}),
  };
}

/** Stock this trader shows at the player's current reputation tier. */
export function stockFor(
  profile: Readonly<PlayerProfile>,
  traderId: string,
): Array<{ itemId: string; quantity: number }> {
  const def = findTrader(traderId);
  if (!def) return [];
  const tier = tierOf(profile, traderId);
  return def.stock
    .filter((entry) => entry.tier <= tier)
    .map((entry) => ({ itemId: entry.itemId, quantity: entry.quantity }));
}

/** Stock still locked behind reputation - shown greyed out, so the tier has a purpose. */
export function lockedStockFor(
  profile: Readonly<PlayerProfile>,
  traderId: string,
): Array<{ itemId: string; tier: number }> {
  const def = findTrader(traderId);
  if (!def) return [];
  const tier = tierOf(profile, traderId);
  return def.stock
    .filter((entry) => entry.tier > tier)
    .map((entry) => ({ itemId: entry.itemId, tier: entry.tier }));
}

export interface SettlementReport {
  outcome: RaidOutcome;
  /** Items that did not fit into the stash and were lost. */
  overflow: Array<{ itemId: string; quantity: number }>;
  leveledUp: boolean;
  newLevel: number;
  /** Insured gear on its way back after a failed raid. */
  insuranceReturns: Array<{ itemId: string; quantity: number }>;
  /** Minutes until it arrives. Zero when nothing was insured. */
  insuranceMinutes: number;
  /** Quest stages this raid completed. */
  questCompletions: QuestCompletion[];
}

/**
 * Apply a raid result to the profile.
 *
 * The order matters and is the whole shape of the meta loop: what came home
 * lands in the stash, insurance is claimed on what did not, the quest line is
 * told what happened, and only then is XP awarded - so a level-up banner is
 * never shown before the reason for it.
 */
export function settleRaid(
  profile: PlayerProfile,
  outcome: RaidOutcome,
  now: number,
): SettlementReport {
  const overflow: Array<{ itemId: string; quantity: number }> = [];

  const deposit = (entry: { itemId: string; quantity: number }): void => {
    const added = addItem(profile.stash, entry.itemId, entry.quantity);
    if (added < entry.quantity) {
      overflow.push({ itemId: entry.itemId, quantity: entry.quantity - added });
    }
  };

  // The secure container first, and on every outcome. It is the one thing the
  // rift does not get to keep.
  for (const entry of outcome.securedLoot) deposit(entry);

  let insuranceReturns: Array<{ itemId: string; quantity: number }> = [];
  let insuranceMinutes = 0;

  if (outcome.kind === 'extracted') {
    // The weapon came back worn - that wear is now the player's problem.
    profile.loadout.weaponCondition = Math.max(0, Math.min(1, outcome.weaponCondition));

    for (const entry of outcome.loot) deposit(entry);
    profile.stats.extractions++;
    profile.stats.totalLootValue += outcome.lootValue + outcome.securedValue;
    profile.stats.bestHaul = Math.max(profile.stats.bestHaul, outcome.lootValue);
  } else {
    // Gear loss. The loadout items are already gone - they were consumed when
    // the raid started (see `commitLoadout`). Fitted attachments go with the
    // weapon, and a replacement weapon starts fresh.
    if (outcome.kind === 'died') profile.stats.deaths++;
    else profile.stats.timeouts++;
    profile.echoShards += outcome.retainedShards;

    // Insurance covers what was worn, never what was found.
    insuranceReturns = claimInsurance(profile, equippedItemIds(profile.loadout), now);
    if (insuranceReturns.length > 0) insuranceMinutes = returnMinutes(profile);

    profile.loadout.attachments = {};
    profile.loadout.weaponCondition = 1;
    profile.weaponRepairs = 0;
  }

  // Cover lapses after the raid it was bought for; renewing is a decision.
  profile.loadout.insured = false;
  // The secure container survived with its owner's gear, so it stays equipped,
  // but its contents were just banked.
  profile.loadout.secureItems = [];

  profile.stats.kills += outcome.kills;

  const questCompletions = advanceQuest(
    profile,
    {
      extractions: outcome.kind === 'extracted' ? 1 : 0,
      kills: outcome.kills,
      extractedValue: outcome.kind === 'extracted' ? outcome.lootValue : 0,
      vaultsOpened: outcome.vaultsOpened,
      anomaliesSurvived: outcome.anomaliesSurvived,
    },
    now,
  );

  const leveledUp = addXp(profile, outcome.xp);

  return {
    outcome,
    overflow,
    leveledUp: leveledUp || questCompletions.some((entry) => entry.leveledUp),
    newLevel: profile.level,
    insuranceReturns,
    insuranceMinutes,
    questCompletions,
  };
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

  // Attachments are NOT listed here: fitting one already took it out of the
  // stash (see game/base/workshop.ts), so charging for it twice would delete it.
  for (const id of [
    loadout.weaponItemId,
    loadout.armorItemId,
    loadout.helmetItemId,
    loadout.backpackItemId,
    loadout.secureContainerItemId,
  ]) {
    if (id) required.push({ itemId: id, quantity: 1 });
  }
  for (const slot of loadout.carried) {
    required.push({ itemId: slot.itemId, quantity: slot.quantity });
  }

  for (const slot of loadout.secureItems) {
    required.push({ itemId: slot.itemId, quantity: slot.quantity });
  }

  // Verify everything is present before removing anything - a partial commit
  // would silently destroy items.
  for (const entry of required) {
    if (countItem(stash, entry.itemId) < entry.quantity) return false;
  }

  // The premium is charged at the same moment the gear leaves the stash: buying
  // cover is part of the same decision as choosing what to risk.
  if (loadout.insured && chargePremium(profile).ok === false) {
    profile.loadout.insured = false;
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
  // Mirrors exactly what `commitLoadout` takes - attachments are not in that
  // list, because fitting one already removed it from the stash.
  for (const id of [
    loadout.weaponItemId,
    loadout.armorItemId,
    loadout.helmetItemId,
    loadout.backpackItemId,
    loadout.secureContainerItemId,
  ]) {
    if (id) addItem(stash, id, 1);
  }
  for (const slot of loadout.carried) addItem(stash, slot.itemId, slot.quantity);
  for (const slot of loadout.secureItems) addItem(stash, slot.itemId, slot.quantity);
}
