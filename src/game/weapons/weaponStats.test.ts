import { describe, expect, it } from 'vitest';
import { WEAPON } from '@/content/balance';
import { getWeapon } from '@/content/weapons';
import { bloomRecoveryPerSecond, jamChanceFor, resolveWeapon } from './weaponStats';

const BASE = getWeapon('wpn_splitter');

describe('resolveWeapon: base and ammunition', () => {
  it('returns the base definition when nothing is fitted or loaded', () => {
    const resolved = resolveWeapon('wpn_splitter');
    expect(resolved).toBeDefined();
    expect(resolved?.magazineSize).toBe(BASE.magazineSize);
    expect(resolved?.noiseRadius).toBe(BASE.noiseRadius);
  });

  it('returns undefined for an unknown weapon rather than throwing', () => {
    expect(resolveWeapon('wpn_does_not_exist')).toBeUndefined();
  });

  it('applies the ammunition damage multiplier', () => {
    const standard = resolveWeapon('wpn_splitter', {}, 'itm_ammo_9mm');
    const hollow = resolveWeapon('wpn_splitter', {}, 'itm_ammo_9mm_hp');
    const piercing = resolveWeapon('wpn_splitter', {}, 'itm_ammo_9mm_ap');

    expect(hollow?.damage as number).toBeGreaterThan(standard?.damage as number);
    expect(piercing?.damage as number).toBeLessThan(standard?.damage as number);
    // ...and the trade-off runs the other way for penetration.
    expect(piercing?.penetration as number).toBeGreaterThan(hollow?.penetration as number);
  });

  it('lets a slug turn the shotgun into a single-projectile weapon', () => {
    const buck = resolveWeapon('wpn_bruch', {}, 'itm_ammo_12');
    const slug = resolveWeapon('wpn_bruch', {}, 'itm_ammo_12_slug');

    expect(buck?.pellets).toBe(7);
    expect(slug?.pellets).toBe(1);
    expect(slug?.spreadDeg as number).toBeLessThan(buck?.spreadDeg as number);
    // One slug should hit roughly as hard as a full buckshot pattern.
    expect(slug?.damage as number).toBeGreaterThan((buck?.damage as number) * 4);
  });

  it('falls back to the default load when the chambered round is unknown', () => {
    const resolved = resolveWeapon('wpn_splitter', {}, 'itm_not_ammo');
    const standard = resolveWeapon('wpn_splitter', {}, 'itm_ammo_9mm');
    expect(resolved?.penetration).toBe(standard?.penetration);
  });
});

describe('resolveWeapon: attachments', () => {
  it('applies modifiers and their costs together', () => {
    const plain = resolveWeapon('wpn_splitter');
    const modded = resolveWeapon('wpn_splitter', { barrel: 'att_barrel_long' });

    expect(modded?.effectiveRange as number).toBeGreaterThan(plain?.effectiveRange as number);
    expect(modded?.spreadDeg as number).toBeLessThan(plain?.spreadDeg as number);
    // Nothing is a free upgrade: the long barrel costs handling and weight.
    expect(modded?.ergonomics as number).toBeLessThan(plain?.ergonomics as number);
    expect(modded?.attachmentWeight as number).toBeGreaterThan(0);
  });

  it('makes a suppressor quiet at the cost of damage', () => {
    const plain = resolveWeapon('wpn_splitter');
    const quiet = resolveWeapon('wpn_splitter', { muzzle: 'att_muzzle_suppressor' });

    expect(quiet?.noiseRadius as number).toBeLessThan((plain?.noiseRadius as number) * 0.6);
    expect(quiet?.damage as number).toBeLessThan(plain?.damage as number);
  });

  it('stacks several slots', () => {
    const modded = resolveWeapon('wpn_splitter', {
      barrel: 'att_barrel_long',
      sight: 'att_sight_reflex',
      magazine: 'att_mag_extended',
    });
    const plain = resolveWeapon('wpn_splitter');

    expect(modded?.magazineSize as number).toBe((plain?.magazineSize as number) + 12);
    expect(modded?.spreadDeg as number).toBeLessThan((plain?.spreadDeg as number) * 0.8);
    expect(modded?.reloadSeconds as number).toBeGreaterThan(plain?.reloadSeconds as number);
  });

  it('ignores an attachment in the wrong slot', () => {
    const plain = resolveWeapon('wpn_splitter');
    // A barrel declared as a sight must be rejected, not silently applied.
    const bogus = resolveWeapon('wpn_splitter', { sight: 'att_barrel_long' });
    expect(bogus?.effectiveRange).toBe(plain?.effectiveRange);
  });

  it('ignores an attachment the weapon does not accept', () => {
    // The extended magazine does not fit the shotgun.
    const plain = resolveWeapon('wpn_bruch');
    const bogus = resolveWeapon('wpn_bruch', { magazine: 'att_mag_extended' });
    expect(bogus?.magazineSize).toBe(plain?.magazineSize);
  });

  it('ignores an attachment that no longer exists', () => {
    const plain = resolveWeapon('wpn_splitter');
    const stale = resolveWeapon('wpn_splitter', { barrel: 'att_removed_in_patch' });
    expect(stale?.effectiveRange).toBe(plain?.effectiveRange);
  });
});

describe('wear and jamming', () => {
  it('widens spread as the weapon wears out', () => {
    const fresh = resolveWeapon('wpn_splitter', {}, null, 1);
    const ruined = resolveWeapon('wpn_splitter', {}, null, 0);
    expect(ruined?.spreadDeg as number).toBeGreaterThan(fresh?.spreadDeg as number);
  });

  it('never jams above the wear threshold', () => {
    expect(jamChanceFor(0, 50)).toBe(0);
    expect(jamChanceFor(WEAPON.jamWearThreshold, 50)).toBe(0);
    expect(jamChanceFor(WEAPON.jamWearThreshold + 0.2, 50)).toBeGreaterThan(0);
  });

  it('rewards good ergonomics with fewer jams', () => {
    const clumsy = jamChanceFor(0.9, 10);
    const handy = jamChanceFor(0.9, 100);
    expect(handy).toBeLessThan(clumsy);
    expect(handy).toBeGreaterThan(0);
  });

  it('keeps the jam chance inside 0..1 at any input', () => {
    for (const wear of [0, 0.5, 1, 2, -1]) {
      for (const ergo of [-50, 0, 50, 100, 500]) {
        const chance = jamChanceFor(wear, ergo);
        expect(chance).toBeGreaterThanOrEqual(0);
        expect(chance).toBeLessThanOrEqual(1);
      }
    }
  });

  it('recovers spread faster with better ergonomics', () => {
    expect(bloomRecoveryPerSecond(100)).toBeGreaterThan(bloomRecoveryPerSecond(0));
    expect(bloomRecoveryPerSecond(0)).toBe(WEAPON.bloomRecoveryMin);
    expect(bloomRecoveryPerSecond(100)).toBe(WEAPON.bloomRecoveryMax);
  });
});

describe('invariants', () => {
  it('never produces degenerate values, whatever is fitted', () => {
    const combos = [
      {},
      { barrel: 'att_barrel_long' },
      { muzzle: 'att_muzzle_suppressor', sight: 'att_sight_reflex' },
      { barrel: 'att_barrel_long', magazine: 'att_mag_extended', muzzle: 'att_muzzle_comp' },
    ];

    for (const attachments of combos) {
      for (const durability of [1, 0.5, 0]) {
        const resolved = resolveWeapon('wpn_splitter', attachments, 'itm_ammo_9mm', durability);
        expect(resolved).toBeDefined();
        expect(resolved?.magazineSize as number).toBeGreaterThan(0);
        expect(resolved?.spreadDeg as number).toBeGreaterThanOrEqual(0);
        expect(resolved?.maxSpreadDeg as number).toBeGreaterThanOrEqual(resolved?.spreadDeg as number);
        expect(resolved?.maxRange as number).toBeGreaterThan(resolved?.effectiveRange as number);
        expect(resolved?.projectileSpeed as number).toBeGreaterThan(0);
        expect(resolved?.reloadSeconds as number).toBeGreaterThan(0);
      }
    }
  });
});
