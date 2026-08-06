import { describe, expect, it } from 'vitest';
import { addItem, countItem } from '@/game/inventory/inventory';
import { createDefaultProfile, levelFromXp, xpForLevel } from '@/game/base/profile';
import { collectBuilds, startUpgrade } from '@/game/base/buildQueue';
import { collectCrafts, startCraft } from '@/game/crafting/craftQueue';
import type { RaidOutcome } from '@/game/gameEvents';
import { buyItem, commitLoadout, sellItem, settleRaid } from './trader';

const NOW = 1_700_000_000_000;

function outcome(partial: Partial<RaidOutcome> = {}): RaidOutcome {
  return {
    kind: 'extracted',
    durationSeconds: 300,
    kills: 2,
    xp: 200,
    lootValue: 1500,
    loot: [{ itemId: 'itm_echoshard', quantity: 2 }],
    securedLoot: [],
    securedValue: 0,
    vaultsOpened: 0,
    anomaliesSurvived: 0,
    retainedShards: 0,
    zoneName: 'Nahtzone Nord',
    weaponCondition: 1,
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
    const report = settleRaid(profile, outcome(), NOW);

    expect(countItem(profile.stash, 'itm_echoshard')).toBe(2);
    expect(profile.stats.extractions).toBe(1);
    expect(profile.stats.bestHaul).toBe(1500);
    expect(report.overflow).toHaveLength(0);

    // The first extraction also finishes the opening quest stage, so the XP is
    // the raid's plus the stage's - checked explicitly rather than hard-coded,
    // because that link is the point of the quest line.
    const stageXp = report.questCompletions.reduce((sum, entry) => sum + entry.xp, 0);
    expect(report.questCompletions).toHaveLength(1);
    expect(profile.xp).toBe(200 + stageXp);
  });

  it('reports overflow instead of silently dropping loot', () => {
    const profile = createDefaultProfile();
    profile.stash.capacityKg = 0.01;

    const report = settleRaid(
      profile,
      outcome({ loot: [{ itemId: 'itm_armor_plate', quantity: 1 }] }),
      NOW,
    );

    expect(report.overflow).toEqual([{ itemId: 'itm_armor_plate', quantity: 1 }]);
  });

  it('keeps retained shards on death and awards no loot', () => {
    const profile = createDefaultProfile();
    settleRaid(
      profile,
      outcome({ kind: 'died', loot: [], lootValue: 0, retainedShards: 3, xp: 40 }),
      NOW,
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

    const result = startUpgrade(profile, 'base_stash', NOW);
    expect(result.ok).toBe(true);
    expect(profile.credits).toBeLessThan(100000);

    // Level 2 of the stash takes time, so the capacity only widens on collect.
    expect(profile.stash.capacityKg).toBe(capacityBefore);
    collectBuilds(profile, NOW + 3_600_000);
    expect(profile.modules['base_stash']).toBe(2);
    expect(profile.stash.capacityKg).toBeGreaterThan(capacityBefore);
  });

  it('refuses an upgrade the player cannot afford', () => {
    const profile = createDefaultProfile();
    profile.credits = 0;
    expect(startUpgrade(profile, 'base_stash', NOW).reason).toBe('notEnoughCredits');
  });
});

describe('crafting', () => {
  it('crafts when inputs and module level are satisfied', () => {
    const profile = createDefaultProfile();
    addItem(profile.stash, 'itm_scrap', 4);
    addItem(profile.stash, 'itm_copper', 2);

    const before = countItem(profile.stash, 'itm_ammo_9mm');
    const result = startCraft(profile, 'rcp_ammo_9mm', NOW);

    expect(result.ok).toBe(true);
    // Inputs go immediately; the output waits for the timer.
    expect(countItem(profile.stash, 'itm_scrap')).toBe(2);
    expect(countItem(profile.stash, 'itm_ammo_9mm')).toBe(before);

    collectCrafts(profile, NOW + 3_600_000);
    expect(countItem(profile.stash, 'itm_ammo_9mm')).toBe(before + 30);
  });

  it('refuses without inputs and consumes nothing', () => {
    const profile = createDefaultProfile();
    const result = startCraft(profile, 'rcp_ammo_9mm', NOW);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missingInputs');
  });

  it('locks recipes behind base module levels', () => {
    const profile = createDefaultProfile();
    addItem(profile.stash, 'itm_scrap', 10);
    addItem(profile.stash, 'itm_copper', 10);
    addItem(profile.stash, 'itm_circuit', 10);

    expect(startCraft(profile, 'rcp_ammo_74', NOW).reason).toBe('moduleTooLow');

    profile.modules['base_workbench'] = 2;
    expect(startCraft(profile, 'rcp_ammo_74', NOW).ok).toBe(true);
  });
});
