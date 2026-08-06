/**
 * Weapon catalogue.
 *
 * Three weapons in the prototype, deliberately covering three distinct answers
 * to the same question ("how do I win this fight?"): volume of fire, precision,
 * and raw close-range stopping power. Mods, ammo types and durability follow in
 * milestone M2.
 */

import type { WeaponDef } from './types';

export const WEAPONS = {
  wpn_splitter: {
    id: 'wpn_splitter',
    itemId: 'itm_wpn_splitter',
    name: 'Splitter VK-2',
    weaponClass: 'smg',
    tier: 1,
    damage: 17,
    pellets: 1,
    roundsPerMinute: 540,
    magazineSize: 24,
    spreadDeg: 2.6,
    spreadPerShotDeg: 0.75,
    maxSpreadDeg: 9,
    reloadSeconds: 2.1,
    projectileSpeed: 78,
    effectiveRange: 11,
    maxRange: 26,
    minDamageFactor: 0.42,
    ammoItemId: 'itm_ammo_9mm',
    noiseRadius: 24,
    visual: 'weapon.splitter',
  },
  wpn_nadel: {
    id: 'wpn_nadel',
    itemId: 'itm_wpn_nadel',
    name: 'Nadel PR-9',
    weaponClass: 'marksman',
    tier: 3,
    damage: 52,
    pellets: 1,
    roundsPerMinute: 145,
    magazineSize: 10,
    spreadDeg: 0.7,
    spreadPerShotDeg: 1.6,
    maxSpreadDeg: 7,
    reloadSeconds: 2.9,
    projectileSpeed: 132,
    effectiveRange: 26,
    maxRange: 46,
    minDamageFactor: 0.75,
    ammoItemId: 'itm_ammo_74',
    noiseRadius: 38,
    visual: 'weapon.nadel',
  },
  wpn_bruch: {
    id: 'wpn_bruch',
    itemId: 'itm_wpn_bruch',
    name: 'Bruch SG-40',
    weaponClass: 'shotgun',
    tier: 2,
    damage: 13,
    pellets: 7,
    roundsPerMinute: 95,
    magazineSize: 6,
    spreadDeg: 7.5,
    spreadPerShotDeg: 1.2,
    maxSpreadDeg: 13,
    reloadSeconds: 3.4,
    projectileSpeed: 62,
    effectiveRange: 6,
    maxRange: 15,
    minDamageFactor: 0.18,
    ammoItemId: 'itm_ammo_12',
    noiseRadius: 32,
    visual: 'weapon.bruch',
  },

  // Enemy-only weapons. Kept in the same table so the firing system has exactly
  // one code path for players and AI - the difference is only in the data.
  wpn_scav_pipe: {
    id: 'wpn_scav_pipe',
    itemId: 'itm_wpn_splitter',
    name: 'Rohrwaffe',
    weaponClass: 'smg',
    tier: 0,
    damage: 9,
    pellets: 1,
    roundsPerMinute: 300,
    magazineSize: 12,
    spreadDeg: 5.5,
    spreadPerShotDeg: 1.1,
    maxSpreadDeg: 12,
    reloadSeconds: 3.2,
    projectileSpeed: 58,
    effectiveRange: 8,
    maxRange: 18,
    minDamageFactor: 0.35,
    ammoItemId: 'itm_ammo_9mm',
    noiseRadius: 20,
    visual: 'weapon.pipe',
  },
  wpn_order_carbine: {
    id: 'wpn_order_carbine',
    itemId: 'itm_wpn_nadel',
    name: 'Ordenskarabiner',
    weaponClass: 'marksman',
    tier: 2,
    damage: 16,
    pellets: 1,
    roundsPerMinute: 380,
    magazineSize: 20,
    spreadDeg: 2.2,
    spreadPerShotDeg: 0.9,
    maxSpreadDeg: 8,
    reloadSeconds: 2.6,
    projectileSpeed: 92,
    effectiveRange: 16,
    maxRange: 32,
    minDamageFactor: 0.5,
    ammoItemId: 'itm_ammo_74',
    noiseRadius: 30,
    visual: 'weapon.carbine',
  },
} as const satisfies Record<string, WeaponDef>;

export type WeaponId = keyof typeof WEAPONS;

export function getWeapon(id: WeaponId): WeaponDef {
  return WEAPONS[id];
}

export function findWeapon(id: string): WeaponDef | undefined {
  return (WEAPONS as Record<string, WeaponDef>)[id];
}

/** Weapons the player can equip. Enemy-only weapons are excluded. */
export const PLAYER_WEAPON_IDS = ['wpn_splitter', 'wpn_bruch', 'wpn_nadel'] as const;

/** Reverse lookup: which weapon does this inventory item represent? */
export function weaponForItem(itemId: string): WeaponDef | undefined {
  for (const id of PLAYER_WEAPON_IDS) {
    if (WEAPONS[id].itemId === itemId) return WEAPONS[id];
  }
  return undefined;
}

/** Seconds between shots, derived from RPM. */
export function shotIntervalSeconds(weapon: WeaponDef): number {
  return 60 / weapon.roundsPerMinute;
}
