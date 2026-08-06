import { describe, expect, it } from 'vitest';
import { addItem, countItem } from '@/game/inventory/inventory';
import { createDefaultProfile } from '@/game/base/profile';
import { CURRENT_SAVE_VERSION, createSave, deserialize, serialize } from './saveSystem';

const NOW = 1_700_000_000_000;

describe('save round trip', () => {
  it('restores an identical profile', () => {
    const profile = createDefaultProfile();
    profile.credits = 4242;
    profile.xp = 999;
    addItem(profile.stash, 'itm_echoshard', 7);

    const { save, recovered } = deserialize(serialize(createSave(profile, NOW)), NOW);

    expect(recovered).toBe(false);
    expect(save.version).toBe(CURRENT_SAVE_VERSION);
    expect(save.profile.credits).toBe(4242);
    expect(save.profile.xp).toBe(999);
    expect(countItem(save.profile.stash, 'itm_echoshard')).toBe(7);
    expect(save.profile.loadout.weaponItemId).toBe(profile.loadout.weaponItemId);
  });

  it('creates a fresh profile when there is no save', () => {
    const { save, recovered } = deserialize(null, NOW);
    expect(recovered).toBe(false);
    expect(save.profile.credits).toBeGreaterThan(0);
    expect(save.profile.stash.slots.length).toBeGreaterThan(0);
  });
});

describe('resilience', () => {
  it('recovers from unparseable data instead of crashing', () => {
    const { save, recovered, notes } = deserialize('{not json', NOW);
    expect(recovered).toBe(true);
    expect(notes.length).toBeGreaterThan(0);
    expect(save.profile.credits).toBeGreaterThan(0);
  });

  it('migrates an unversioned save', () => {
    const { save, recovered, notes } = deserialize(JSON.stringify({ credits: 5 }), NOW);
    expect(recovered).toBe(true);
    expect(save.version).toBe(CURRENT_SAVE_VERSION);
    expect(notes.some((note) => note.includes('Version'))).toBe(true);
  });

  it('resets a save from a future version', () => {
    const raw = JSON.stringify({ version: 99, savedAt: NOW, profile: createDefaultProfile() });
    const { save, recovered } = deserialize(raw, NOW);
    expect(recovered).toBe(true);
    expect(save.version).toBe(CURRENT_SAVE_VERSION);
  });

  it('drops unknown items but keeps the rest of the profile', () => {
    const profile = createDefaultProfile();
    profile.credits = 1234;
    profile.stash.slots.push({ itemId: 'itm_removed_in_patch_7', quantity: 3 });

    const { save, recovered, notes } = deserialize(serialize(createSave(profile, NOW)), NOW);

    expect(recovered).toBe(true);
    expect(notes.some((note) => note.includes('unbekannte'))).toBe(true);
    expect(save.profile.credits).toBe(1234);
    expect(countItem(save.profile.stash, 'itm_removed_in_patch_7')).toBe(0);
    // Everything valid survived the repair.
    expect(countItem(save.profile.stash, 'itm_ammo_9mm')).toBeGreaterThan(0);
  });

  it('repairs malformed slot entries', () => {
    const raw = JSON.stringify({
      version: 1,
      savedAt: NOW,
      profile: {
        ...createDefaultProfile(),
        stash: { capacityKg: 100, slots: [null, { itemId: 42 }, { itemId: 'itm_bandage' }, { itemId: 'itm_bandage', quantity: 2 }] },
      },
    });

    const { save } = deserialize(raw, NOW);
    expect(countItem(save.profile.stash, 'itm_bandage')).toBe(2);
  });

  it('falls back to a sane loadout when the saved one references missing items', () => {
    const profile = createDefaultProfile();
    profile.loadout.weaponItemId = 'itm_ghost_gun';
    const { save } = deserialize(serialize(createSave(profile, NOW)), NOW);
    expect(save.profile.loadout.weaponItemId).toBeNull();
  });
});

/**
 * M5 raised the save version. The rule that outranks everything else in this
 * file: a save is never invalidated by an update, so a v1 profile must load
 * with its stash, credits and progress intact and simply gain empty meta state.
 */
describe('migration v1 -> v2', () => {
  it('keeps everything and adds the meta layer', () => {
    const v1 = {
      version: 1,
      savedAt: 1_600_000_000_000,
      profile: {
        credits: 4321,
        xp: 900,
        level: 3,
        echoShards: 7,
        modules: { base_stash: 2, base_workbench: 2 },
        weaponRepairs: 1,
        stash: { capacityKg: 220, slots: [{ itemId: 'itm_echoshard', quantity: 5 }] },
        loadout: {
          weaponItemId: 'itm_wpn_splitter',
          armorItemId: null,
          helmetItemId: null,
          backpackItemId: 'itm_bag_small',
          attachments: {},
          preferredAmmoItemId: 'itm_ammo_9mm',
          weaponCondition: 0.5,
          carried: [{ itemId: 'itm_ammo_9mm', quantity: 30 }],
        },
        stats: {
          raidsStarted: 12,
          extractions: 5,
          deaths: 6,
          timeouts: 1,
          kills: 40,
          bestHaul: 8000,
          totalLootValue: 21000,
        },
      },
    };

    const result = deserialize(JSON.stringify(v1), 1_700_000_000_000);
    const profile = result.save.profile;

    expect(result.save.version).toBe(2);
    expect(profile.credits).toBe(4321);
    expect(profile.xp).toBe(900);
    expect(profile.echoShards).toBe(7);
    expect(profile.modules['base_stash']).toBe(2);
    expect(profile.stats.kills).toBe(40);
    expect(countItem(profile.stash, 'itm_echoshard')).toBe(5);
    expect(profile.loadout.weaponCondition).toBe(0.5);

    // New state starts empty, which is exactly what a base that has never used
    // it looks like.
    expect(profile.builds).toEqual([]);
    expect(profile.crafts).toEqual([]);
    expect(profile.reputation).toEqual({});
    expect(profile.contracts).toEqual([]);
    expect(profile.insuranceReturns).toEqual([]);
    expect(profile.quest).toEqual({ stage: 0, progress: 0 });
    expect(profile.loadout.secureContainerItemId).toBeNull();
    expect(profile.loadout.insured).toBe(false);
  });

  it('drops queued work whose content no longer exists', () => {
    const raw = {
      version: 2,
      savedAt: 0,
      profile: {
        ...createDefaultProfile(),
        builds: [
          { moduleId: 'base_gone', targetLevel: 2, readyAt: 1 },
          { moduleId: 'base_stash', targetLevel: 2, readyAt: 1 },
        ],
        crafts: [
          { id: 1, recipeId: 'rcp_gone', readyAt: 1, failed: false },
          { id: 2, recipeId: 'rcp_bandage', readyAt: 1, failed: true },
        ],
        reputation: { trd_gone: 500, trd_quartermaster: 120 },
        contracts: [{ templateId: 'ct_gone', completed: false }],
      },
    };

    const profile = deserialize(JSON.stringify(raw), 0).save.profile;

    expect(profile.builds.map((job) => job.moduleId)).toEqual(['base_stash']);
    expect(profile.crafts.map((job) => job.recipeId)).toEqual(['rcp_bandage']);
    expect(profile.crafts[0]?.failed).toBe(true);
    expect(Object.keys(profile.reputation)).toEqual(['trd_quartermaster']);
    expect(profile.contracts).toEqual([]);
  });
});
