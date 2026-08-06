/**
 * M5: the economy.
 *
 * Traders, reputation, contracts, insurance and the secure container.
 *
 * The invariant that outranks everything else here: **no trader ever buys
 * higher than they sell.** The moment that flips, the game has an infinite
 * money loop and every other number stops mattering - so it is checked for
 * every trader at every reputation tier and every base level.
 */

import { describe, expect, it } from 'vitest';
import { META } from '@/content/balance';
import { ALL_TRADER_IDS, getTrader } from '@/content/traders';
import { addItem, countItem } from '@/game/inventory/inventory';
import { createDefaultProfile, type PlayerProfile } from '@/game/base/profile';
import type { RaidOutcome } from '@/game/gameEvents';
import {
  canComplete,
  completeContract,
  offeredContracts,
  refreshContracts,
} from './contracts';
import {
  chargePremium,
  claimInsurance,
  collectInsurance,
  insuranceAvailable,
  premiumFor,
  returnMinutes,
} from './insurance';
import {
  addReputation,
  pointsToNextTier,
  tierOf,
  traderUnlocked,
  unlockedTraderIds,
} from './reputation';
import {
  buyPriceOf,
  buyItem,
  commitLoadout,
  refusesItem,
  sellItem,
  sellPriceOf,
  settleRaid,
  stockFor,
} from './trader';

const NOW = 1_700_000_000_000;

function fullBase(): PlayerProfile {
  const profile = createDefaultProfile();
  profile.credits = 500_000;
  profile.modules['base_trader'] = 3;
  profile.modules['base_medical'] = 2;
  profile.modules['base_blackmarket'] = 1;
  return profile;
}

function outcome(partial: Partial<RaidOutcome> = {}): RaidOutcome {
  return {
    kind: 'extracted',
    durationSeconds: 300,
    kills: 0,
    xp: 0,
    lootValue: 0,
    loot: [],
    securedLoot: [],
    securedValue: 0,
    vaultsOpened: 0,
    anomaliesSurvived: 0,
    retainedShards: 0,
    zoneName: null,
    weaponCondition: 1,
    ...partial,
  };
}

describe('trader pricing', () => {
  it('never pays more than it charges, at any tier or base level', () => {
    const items = ['itm_bandage', 'itm_ammo_9mm', 'itm_echoshard', 'itm_medkit', 'itm_scrap'];

    for (const traderId of ALL_TRADER_IDS) {
      for (const traderLevel of [1, 2, 3]) {
        for (const reputation of [0, 500, 1500, 5000]) {
          const profile = fullBase();
          profile.modules['base_trader'] = traderLevel;
          profile.reputation[traderId] = reputation;

          for (const itemId of items) {
            if (refusesItem(traderId, itemId)) continue;
            const sell = sellPriceOf(profile, itemId, traderId);
            const buy = buyPriceOf(profile, itemId, traderId);
            expect(
              buy,
              `${traderId} L${traderLevel} rep ${reputation} ${itemId}: buy ${buy} <= sell ${sell}`,
            ).toBeGreaterThan(sell);
          }
        }
      }
    }
  });

  it('pays a premium for what a trader actually wants', () => {
    const profile = fullBase();
    const quartermaster = sellPriceOf(profile, 'itm_bandage', 'trd_quartermaster');
    const medic = sellPriceOf(profile, 'itm_bandage', 'trd_medic');
    // The medic needs bandages; the quartermaster is indifferent to them.
    expect(medic).toBeGreaterThan(quartermaster);
  });

  it('refuses categories a trader will not touch', () => {
    const profile = fullBase();
    addItem(profile.stash, 'itm_wpn_bruch', 1);

    expect(refusesItem('trd_medic', 'itm_wpn_bruch')).toBe(true);
    expect(sellItem(profile, 'itm_wpn_bruch', 1, 'trd_medic').reason).toBe('refused');
    // And nothing was taken.
    expect(countItem(profile.stash, 'itm_wpn_bruch')).toBe(1);
  });

  it('locks a trader behind the base module that introduces them', () => {
    const profile = createDefaultProfile();
    expect(traderUnlocked(profile, 'trd_quartermaster')).toBe(true);
    expect(traderUnlocked(profile, 'trd_medic')).toBe(false);
    expect(unlockedTraderIds(profile)).toEqual(['trd_quartermaster']);

    expect(sellItem(profile, 'itm_ammo_9mm', 1, 'trd_blackmarket').reason).toBe('locked');
  });
});

describe('reputation', () => {
  it('rises with trade volume and unlocks deeper stock', () => {
    const profile = fullBase();
    addItem(profile.stash, 'itm_risscore', 4);

    const stockBefore = stockFor(profile, 'trd_quartermaster').length;
    expect(tierOf(profile, 'trd_quartermaster')).toBe(0);

    for (let i = 0; i < 4; i++) sellItem(profile, 'itm_risscore', 1, 'trd_quartermaster');

    expect(tierOf(profile, 'trd_quartermaster')).toBeGreaterThan(0);
    expect(stockFor(profile, 'trd_quartermaster').length).toBeGreaterThan(stockBefore);
  });

  it('is earned per trader, not shared', () => {
    const profile = fullBase();
    addItem(profile.stash, 'itm_risscore', 2);
    sellItem(profile, 'itm_risscore', 2, 'trd_quartermaster');

    expect(tierOf(profile, 'trd_quartermaster')).toBeGreaterThan(0);
    expect(tierOf(profile, 'trd_medic')).toBe(0);
  });

  it('improves the price the player gets', () => {
    const low = fullBase();
    const high = fullBase();
    addReputation(high, 'trd_quartermaster', 5000);

    expect(sellPriceOf(high, 'itm_echoshard', 'trd_quartermaster')).toBeGreaterThan(
      sellPriceOf(low, 'itm_echoshard', 'trd_quartermaster'),
    );
    expect(buyPriceOf(high, 'itm_echoshard', 'trd_quartermaster')).toBeLessThan(
      buyPriceOf(low, 'itm_echoshard', 'trd_quartermaster'),
    );
  });

  it('reports the distance to the next tier, and nothing at the top', () => {
    const profile = fullBase();
    expect(pointsToNextTier(profile, 'trd_quartermaster')).toBeGreaterThan(0);
    addReputation(profile, 'trd_quartermaster', 100_000);
    expect(pointsToNextTier(profile, 'trd_quartermaster')).toBeNull();
  });

  it('only ever offers stock the trader actually defines', () => {
    const profile = fullBase();
    for (const traderId of ALL_TRADER_IDS) {
      addReputation(profile, traderId, 100_000);
      const ids = getTrader(traderId).stock.map((entry) => entry.itemId);
      for (const entry of stockFor(profile, traderId)) {
        expect(ids).toContain(entry.itemId);
      }
    }
  });
});

describe('contracts', () => {
  it('offers a stable set that survives a reload', () => {
    const profile = fullBase();
    profile.level = 10;

    expect(refreshContracts(profile, NOW)).toBe(true);
    const first = offeredContracts(profile).map((entry) => entry.template.id);
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThanOrEqual(META.contractSlots);

    // Same window: no re-roll, so a player cannot fish for better offers.
    expect(refreshContracts(profile, NOW + 60_000)).toBe(false);
    expect(offeredContracts(profile).map((entry) => entry.template.id)).toEqual(first);
  });

  it('re-rolls once the window has passed', () => {
    const profile = fullBase();
    profile.level = 10;
    refreshContracts(profile, NOW);
    const later = NOW + (META.contractRefreshHours + 1) * 3_600_000;
    expect(refreshContracts(profile, later)).toBe(true);
  });

  it('takes the goods and pays credits, xp and reputation', () => {
    const profile = fullBase();
    profile.level = 10;
    refreshContracts(profile, NOW);

    const offer = offeredContracts(profile)[0];
    expect(offer).toBeDefined();
    if (!offer) return;

    for (const entry of offer.template.deliver) {
      addItem(profile.stash, entry.itemId, entry.quantity);
    }

    const creditsBefore = profile.credits;
    const repBefore = profile.reputation[offer.template.traderId] ?? 0;

    expect(canComplete(profile, offer.template)).toBe(true);
    const result = completeContract(profile, offer.template.id);

    expect(result.ok).toBe(true);
    expect(profile.credits).toBe(creditsBefore + offer.template.rewardCredits);
    expect(profile.reputation[offer.template.traderId] ?? 0).toBeGreaterThan(repBefore);
    for (const entry of offer.template.deliver) {
      expect(countItem(profile.stash, entry.itemId)).toBe(0);
    }
  });

  it('cannot be handed in twice or without the goods', () => {
    const profile = fullBase();
    profile.level = 10;
    refreshContracts(profile, NOW);
    const offer = offeredContracts(profile)[0];
    if (!offer) return;

    expect(completeContract(profile, offer.template.id).reason).toBe('missingItems');

    for (const entry of offer.template.deliver) {
      addItem(profile.stash, entry.itemId, entry.quantity);
    }
    expect(completeContract(profile, offer.template.id).ok).toBe(true);
    expect(completeContract(profile, offer.template.id).reason).toBe('alreadyCompleted');
  });

  it('never offers a contract above the player level', () => {
    const profile = fullBase();
    profile.level = 1;
    refreshContracts(profile, NOW);
    for (const { template } of offeredContracts(profile)) {
      expect(template.minLevel).toBeLessThanOrEqual(1);
    }
  });
});

describe('insurance', () => {
  it('needs the medical module', () => {
    const bare = createDefaultProfile();
    expect(insuranceAvailable(bare)).toBe(false);
    bare.loadout.insured = true;
    expect(chargePremium(bare).reason).toBe('unavailable');
  });

  it('charges a premium that scales with what is at risk', () => {
    const profile = fullBase();
    const cheap = premiumFor(profile, profile.loadout);

    profile.loadout.backpackItemId = 'itm_bag_large';
    const dear = premiumFor(profile, profile.loadout);

    expect(dear).toBeGreaterThan(cheap);
    expect(cheap).toBeGreaterThan(0);
  });

  it('gets cheaper and faster as the medical module grows', () => {
    const low = fullBase();
    low.modules['base_medical'] = 1;
    const high = fullBase();
    high.modules['base_medical'] = 2;

    expect(premiumFor(high, high.loadout)).toBeLessThan(premiumFor(low, low.loadout));
    expect(returnMinutes(high)).toBeLessThan(returnMinutes(low));
  });

  it('brings some gear back after a delay, and never all of it for free', () => {
    const profile = fullBase();
    profile.loadout.insured = true;

    // Many items so the probabilistic return is measurable.
    const lost = Array.from({ length: 60 }, () => 'itm_armor_fiber');
    const returns = claimInsurance(profile, lost, NOW);

    expect(returns.length).toBeGreaterThan(0);
    const total = returns.reduce((sum, entry) => sum + entry.quantity, 0);
    expect(total).toBeLessThan(lost.length);

    // Nothing arrives early.
    expect(collectInsurance(profile, NOW)).toHaveLength(0);
    const collected = collectInsurance(profile, NOW + returnMinutes(profile) * 60_000);
    expect(collected.length).toBeGreaterThan(0);
    expect(profile.insuranceReturns).toHaveLength(0);
  });

  it('covers what was worn and never what was looted', () => {
    const profile = fullBase();
    profile.loadout.insured = true;
    profile.stash.capacityKg = 9999;

    settleRaid(
      profile,
      outcome({ kind: 'died', loot: [{ itemId: 'itm_risscore', quantity: 1 }] }),
      NOW,
    );

    for (const entry of profile.insuranceReturns) {
      expect(entry.itemId).not.toBe('itm_risscore');
    }
    // Cover lapses with the raid it was bought for.
    expect(profile.loadout.insured).toBe(false);
  });

  it('is charged when the raid begins, not when it ends', () => {
    const profile = fullBase();
    profile.loadout.insured = true;
    const before = profile.credits;

    expect(commitLoadout(profile)).toBe(true);
    expect(profile.credits).toBeLessThan(before);
  });
});

describe('the secure container', () => {
  it('comes home on a death, unlike everything else', () => {
    const profile = fullBase();
    profile.stash.capacityKg = 9999;

    settleRaid(
      profile,
      outcome({
        kind: 'died',
        loot: [{ itemId: 'itm_risscore', quantity: 1 }],
        securedLoot: [{ itemId: 'itm_echoshard', quantity: 3 }],
      }),
      NOW,
    );

    expect(countItem(profile.stash, 'itm_echoshard')).toBe(3);
    // Ordinary loot did not survive.
    expect(countItem(profile.stash, 'itm_risscore')).toBe(0);
  });

  it('is emptied into the stash after the raid, ready to be repacked', () => {
    const profile = fullBase();
    profile.loadout.secureContainerItemId = 'itm_case_small';
    profile.loadout.secureItems = [{ itemId: 'itm_echoshard', quantity: 2 }];

    settleRaid(
      profile,
      outcome({ securedLoot: [{ itemId: 'itm_echoshard', quantity: 2 }] }),
      NOW,
    );

    expect(profile.loadout.secureItems).toHaveLength(0);
    expect(profile.loadout.secureContainerItemId).toBe('itm_case_small');
  });

  it('is taken out of the stash when the raid starts', () => {
    const profile = fullBase();
    addItem(profile.stash, 'itm_case_small', 1);
    addItem(profile.stash, 'itm_echoshard', 2);
    profile.loadout.secureContainerItemId = 'itm_case_small';
    profile.loadout.secureItems = [{ itemId: 'itm_echoshard', quantity: 2 }];

    expect(commitLoadout(profile)).toBe(true);
    expect(countItem(profile.stash, 'itm_case_small')).toBe(0);
    expect(countItem(profile.stash, 'itm_echoshard')).toBe(0);
  });
});

describe('buying and selling stay sane', () => {
  it('charges only for what fits into the stash', () => {
    const profile = fullBase();
    profile.stash.capacityKg = 0.02;
    const before = profile.credits;

    const result = buyItem(profile, 'itm_ammo_9mm', 200, 'trd_quartermaster');
    if (result.ok) {
      const spent = before - profile.credits;
      expect(spent).toBe(buyPriceOf(profile, 'itm_ammo_9mm', 'trd_quartermaster') * (result.quantity ?? 0));
    } else {
      expect(profile.credits).toBe(before);
    }
  });
});
