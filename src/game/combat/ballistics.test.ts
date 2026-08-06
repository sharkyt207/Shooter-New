import { describe, expect, it } from 'vitest';
import { ARMOR, HIT_ZONES } from '@/content/balance';
import { getItem } from '@/content/items';
import { SeededRandom } from '@/core/math/random';
import type { HitZone } from '@/content/types';
import { effectiveArmorClass, penetrationChance, rollHitZone, zoneMultiplier } from './ballistics';

const NEUTRAL_BIAS = { head: 6, torso: 62, limbs: 32 };

describe('hit zones', () => {
  it('produces a distribution that follows the weapon bias', () => {
    const rng = new SeededRandom(4242);
    const counts: Record<HitZone, number> = { head: 0, torso: 0, limbs: 0 };
    const runs = 40000;

    for (let i = 0; i < runs; i++) counts[rollHitZone(rng, NEUTRAL_BIAS, false)]++;

    const total = NEUTRAL_BIAS.head + NEUTRAL_BIAS.torso + NEUTRAL_BIAS.limbs;
    expect(counts.head / runs).toBeCloseTo(NEUTRAL_BIAS.head / total, 1);
    expect(counts.torso / runs).toBeCloseTo(NEUTRAL_BIAS.torso / total, 1);
    expect(counts.limbs / runs).toBeCloseTo(NEUTRAL_BIAS.limbs / total, 1);
  });

  it('finds the head more often on a marksman weapon than a shotgun', () => {
    const headShare = (bias: typeof NEUTRAL_BIAS): number => {
      const rng = new SeededRandom(99);
      let head = 0;
      for (let i = 0; i < 20000; i++) {
        if (rollHitZone(rng, bias, false) === 'head') head++;
      }
      return head / 20000;
    };

    const marksman = headShare({ head: 14, torso: 62, limbs: 24 });
    const shotgun = headShare({ head: 4, torso: 58, limbs: 38 });
    expect(marksman).toBeGreaterThan(shotgun * 2);
  });

  it('rewards shooting an unaware target with better placement', () => {
    const rng = new SeededRandom(7);
    let aware = 0;
    let unaware = 0;
    for (let i = 0; i < 20000; i++) {
      if (rollHitZone(rng, NEUTRAL_BIAS, false) === 'head') aware++;
      if (rollHitZone(rng, NEUTRAL_BIAS, true) === 'head') unaware++;
    }
    expect(unaware).toBeGreaterThan(aware);
  });

  it('is deterministic for the same seed', () => {
    const roll = (): HitZone[] => {
      const rng = new SeededRandom(1234);
      return Array.from({ length: 50 }, () => rollHitZone(rng, NEUTRAL_BIAS, false));
    };
    expect(roll()).toEqual(roll());
  });

  it('falls back to the torso when every weight is zero', () => {
    const rng = new SeededRandom(1);
    expect(rollHitZone(rng, { head: 0, torso: 0, limbs: 0 }, false)).toBe('torso');
  });

  it('scales damage by zone', () => {
    expect(zoneMultiplier('head')).toBe(HIT_ZONES.headMultiplier);
    expect(zoneMultiplier('torso')).toBe(1);
    expect(zoneMultiplier('limbs')).toBeLessThan(1);
  });
});

describe('armour', () => {
  it('degrades with durability but never to nothing', () => {
    const stats = getItem('itm_armor_plate').armor;
    expect(stats).toBeDefined();
    const armor = stats as NonNullable<typeof stats>;

    const pristine = effectiveArmorClass(armor, armor.durability);
    const ruined = effectiveArmorClass(armor, 0);

    expect(pristine).toBe(armor.armorClass);
    expect(ruined).toBeLessThan(pristine);
    expect(ruined).toBeCloseTo(armor.armorClass * ARMOR.ruinedClassFactor, 5);
  });

  it('rises monotonically with penetration', () => {
    let previous = -1;
    for (let pen = 0; pen <= 80; pen += 5) {
      const chance = penetrationChance(pen, 3);
      expect(chance).toBeGreaterThanOrEqual(previous);
      previous = chance;
    }
  });

  it('is a coin flip at the break-even point', () => {
    const armorClass = 3;
    const breakEven = armorClass * ARMOR.penetrationPerClass;
    expect(penetrationChance(breakEven, armorClass)).toBeCloseTo(0.5, 5);
  });

  it('stays inside 0..1', () => {
    expect(penetrationChance(0, 6)).toBe(0);
    expect(penetrationChance(500, 1)).toBe(1);
  });

  it('makes ammunition choice matter against real armour', () => {
    // A plate carrier (class 4) is what separates the three 9 mm loads.
    const plate = getItem('itm_armor_plate').armor as NonNullable<
      ReturnType<typeof getItem>['armor']
    >;
    const armorClass = plate.armorClass;

    const hollow = penetrationChance(getItem('itm_ammo_9mm_hp').ammo?.penetration ?? 0, armorClass);
    const standard = penetrationChance(getItem('itm_ammo_9mm').ammo?.penetration ?? 0, armorClass);
    const piercing = penetrationChance(getItem('itm_ammo_9mm_ap').ammo?.penetration ?? 0, armorClass);

    expect(hollow).toBe(0);
    expect(standard).toBeLessThan(0.35);
    expect(piercing).toBeGreaterThan(standard);
  });
});
