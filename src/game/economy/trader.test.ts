import { describe, expect, it } from 'vitest';
import { addItem, countItem } from '@/game/inventory/inventory';
import { createDefaultProfile, levelFromXp, upgradeModule, xpForLevel } from '@/game/base/profile';
import { craft } from '@/game/crafting/crafting';
import type { RaidOutcome } from '@/game/gameEvents';
import { buyItem, commitLoadout, sellItem, settleRaid } from './trader';

function outcome(partial: Partial<RaidOutcome> = {}): RaidOutcome {
  return {
    kind: 'extracted',
    durationSeconds: 300,
    kills: 2,
    xp: 200,
    lootValue: 1500,
    loot: [{ itemId: 'itm_echoshard', quantity: 2 }],
    retainedShards: 0,
    zoneName: 'Nahtzone Nord',
    ...partial,
  };
}

describe('trading', () => {
  it('sells items for credits', () => {
    const profile = createDefaultProfile();
    addItem(profile.stash, 'itm_echoshard', 2);
    const before = profile.credits;

    const result = sellItem(profile, 'itm_echoshard', 2);

    expect(result.ok).toBe(true);
    expect(profile.credits).toBeGreaterThan(before);
    expect(countItem(profile.stash, 'itm_echoshard')).toBe(0);
  });

  it('refuses to sell what the player does not have', () => {
    const profile = createDefaultProfile();
    const result = sellItem(profile, 'itm_risscore', 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('notEnoughItems');
  });

  it('buys items and charges credits', () => {
    const profile = createDefaultProfile();
    profile.credits = 10000;
    const before = profile.credits;

    const result = buyItem(profile, 'itm_ammo_9mm', 30);

    expect(result.ok).toBe(true);
    expect(profile.credits).toBeLessThan(before);
    expect(countItem(profile.stash, 'itm_ammo_9mm')).toBeGreaterThan(30);
  });

  it('refuses to buy without enough credits', () => {
    const profile = createDefaultProfile();
    profile.credits = 1;
    const result = buyItem(profile, 'itm_armor_plate', 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('notEnoughCredits');
  });

  it('buys low and sells high, never the other way round', () => {
    // A trader that pays more than it charges is an infinite money machine.
    const profile = createDefaultProfile();
    const buy = buyItem(profile, 'itm_bandage', 1);
    const sell = sellItem(profile, 'itm_bandage', 1);
    expect(Math.abs(buy.credits as number)).toBeGreaterThan(sell.credits as number);
  });
});

describe('loadout commitment', () => {
  it('removes the loadout from the stash when the raid starts', () => {
    const profile = createDefaultProfile();
    const ammoBefore = countItem(profile.stash, 'itm_ammo_9mm');

    expect(commitLoadout(profile)).toBe(true);
    expect(countItem(profile.stash, 'itm_wpn_splitter')).toBe(0);
    expect(countItem(profile.stash, 'itm_ammo_9mm')).toBe(ammoBefore - 60);
    expect(profile.stats.raidsStarted).toBe(1);
  });

  it('fails without destroying anything when items are missing', () => {
    const profile = createDefaultProfile();
    profile.loadout.carried.push({ itemId: 'itm_risscore', quantity: 1 });
    const before = countItem(profile.stash, 'itm_ammo_9mm');

    expect(commitLoadout(profile)).toBe(false);
    expect(countItem(profile.stash, 'itm_ammo_9mm')).toBe(before);
    expect(profile.stats.raidsStarted).toBe(0);
  });
});

describe('raid settlement', () => {
  it('moves loot into the stash and awards xp on extraction', () => {
    const profile = createDefaultProfile();
    const report = settleRaid(profile, outcome());

    expect(countItem(profile.stash, 'itm_echoshard')).toBe(2);
    expect(profile.xp).toBe(200);
    expect(profile.stats.extractions).toBe(1);
    expect(profile.stats.bestHaul).toBe(1500);
    expect(report.overflow).toHaveLength(0);
  });

  it('reports overflow instead of silently dropping loot', () => {
    const profile = createDefaultProfile();
    profile.stash.capacityKg = 0.01;

    const report = settleRaid(profile, outcome({ loot: [{ itemId: 'itm_armor_plate', quantity: 1 }] }));

    expect(report.overflow).toEqual([{ itemId: 'itm_armor_plate', quantity: 1 }]);
  });

  it('keeps retained shards on death and awards no loot', () => {
    const profile = createDefaultProfile();
    settleRaid(
      profile,
      outcome({ kind: 'died', loot: [], lootValue: 0, retainedShards: 3, xp: 40 }),
    );

    expect(profile.echoShards).toBe(3);
    expect(profile.stats.deaths).toBe(1);
    expect(profile.xp).toBe(40);
    expect(countItem(profile.stash, 'itm_echoshard')).toBe(0);
  });
});

describe('progression', () => {
  it('has a monotonically rising xp curve', () => {
    for (let level = 1; level < 20; level++) {
      expect(xpForLevel(level + 1)).toBeGreaterThan(xpForLevel(level));
    }
  });

  it('derives level from xp consistently', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(xpForLevel(5))).toBe(5);
    expect(levelFromXp(xpForLevel(5) - 1)).toBe(4);
  });

  it('upgrades base modules and charges credits', () => {
    const profile = createDefaultProfile();
    profile.credits = 100000;
    const capacityBefore = profile.stash.capacityKg;

    const result = upgradeModule(profile, 'base_stash');

    expect(result.ok).toBe(true);
    expect(result.newLevel).toBe(2);
    expect(profile.credits).toBeLessThan(100000);
    expect(profile.stash.capacityKg).toBeGreaterThan(capacityBefore);
  });

  it('refuses an upgrade the player cannot afford', () => {
    const profile = createDefaultProfile();
    profile.credits = 0;
    expect(upgradeModule(profile, 'base_stash').reason).toBe('notEnoughCredits');
  });
});

describe('crafting', () => {
  it('crafts when inputs and module level are satisfied', () => {
    const profile = createDefaultProfile();
    addItem(profile.stash, 'itm_scrap', 4);
    addItem(profile.stash, 'itm_copper', 2);

    const before = countItem(profile.stash, 'itm_ammo_9mm');
    const result = craft(profile, 'rcp_ammo_9mm');

    expect(result.ok).toBe(true);
    expect(countItem(profile.stash, 'itm_ammo_9mm')).toBe(before + 30);
    expect(countItem(profile.stash, 'itm_scrap')).toBe(2);
  });

  it('refuses without inputs and consumes nothing', () => {
    const profile = createDefaultProfile();
    const result = craft(profile, 'rcp_ammo_9mm');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missingInputs');
  });

  it('locks recipes behind base module levels', () => {
    const profile = createDefaultProfile();
    addItem(profile.stash, 'itm_scrap', 10);
    addItem(profile.stash, 'itm_copper', 10);
    addItem(profile.stash, 'itm_circuit', 10);

    expect(craft(profile, 'rcp_ammo_74').reason).toBe('moduleTooLow');

    profile.modules['base_workbench'] = 2;
    expect(craft(profile, 'rcp_ammo_74').ok).toBe(true);
  });
});
