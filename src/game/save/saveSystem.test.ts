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
