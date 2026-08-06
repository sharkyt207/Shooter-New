/**
 * The persistent player profile - everything that survives a raid.
 *
 * This is the counterweight to the raid's brutality: the stash, the base and
 * the credits are untouchable, so a death costs the run but never the account
 * (Pillar P5).
 */

import { ECONOMY } from '@/content/balance';
import { ALL_BASE_MODULE_IDS, findBaseModule, STARTING_MODULES } from '@/content/baseModules';
import { createInventory, type InventoryState } from '@/game/inventory/inventory';
import type { Loadout } from '@/game/player/loadout';

export interface RaidStats {
  raidsStarted: number;
  extractions: number;
  deaths: number;
  timeouts: number;
  kills: number;
  /** Highest single-raid loot value extracted, in credits. */
  bestHaul: number;
  totalLootValue: number;
}

export interface PlayerProfile {
  credits: number;
  xp: number;
  level: number;
  /** Echo shards are the meta currency; they survive death partially. */
  echoShards: number;
  stash: InventoryState;
  loadout: Loadout;
  /** Base module id -> current level. A missing key means "not built". */
  modules: Record<string, number>;
  /** How often the equipped weapon has been serviced; each repair lowers its ceiling. */
  weaponRepairs: number;
  stats: RaidStats;
}

/** Stash capacity granted by the current level of the stash module. */
export function stashCapacityFor(modules: Readonly<Record<string, number>>): number {
  const def = findBaseModule('base_stash');
  const level = modules['base_stash'] ?? 1;
  const entry = def?.levels.find((l) => l.level === level);
  return entry?.stashCapacityKg ?? 120;
}

export function createDefaultProfile(): PlayerProfile {
  const modules: Record<string, number> = {};
  for (const id of STARTING_MODULES) modules[id] = 1;

  const stash = createInventory(stashCapacityFor(modules), [
    { itemId: 'itm_wpn_splitter', quantity: 1 },
    { itemId: 'itm_ammo_9mm', quantity: 90 },
    { itemId: 'itm_bandage', quantity: 3 },
    { itemId: 'itm_bag_small', quantity: 1 },
    { itemId: 'itm_armor_fiber', quantity: 1 },
  ]);

  const loadout: Loadout = {
    weaponItemId: 'itm_wpn_splitter',
    armorItemId: 'itm_armor_fiber',
    helmetItemId: null,
    backpackItemId: 'itm_bag_small',
    attachments: {},
    preferredAmmoItemId: 'itm_ammo_9mm',
    weaponCondition: 1,
    carried: [
      { itemId: 'itm_ammo_9mm', quantity: 60 },
      { itemId: 'itm_bandage', quantity: 2 },
    ],
  };

  return {
    credits: ECONOMY.startingCredits,
    xp: 0,
    level: 1,
    echoShards: 0,
    stash,
    loadout,
    modules,
    weaponRepairs: 0,
    stats: {
      raidsStarted: 0,
      extractions: 0,
      deaths: 0,
      timeouts: 0,
      kills: 0,
      bestHaul: 0,
      totalLootValue: 0,
    },
  };
}

/** Total experience required to reach `level`. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let l = 1; l < level; l++) {
    total += Math.round(ECONOMY.xpCurveBase * Math.pow(l, ECONOMY.xpCurveExponent));
  }
  return total;
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < 100 && xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** Progress towards the next level, as 0..1. */
export function levelProgress(xp: number): number {
  const level = levelFromXp(xp);
  const current = xpForLevel(level);
  const next = xpForLevel(level + 1);
  if (next <= current) return 1;
  return (xp - current) / (next - current);
}

export function addXp(profile: PlayerProfile, amount: number): boolean {
  if (amount <= 0) return false;
  const before = profile.level;
  profile.xp += amount;
  profile.level = levelFromXp(profile.xp);
  return profile.level > before;
}

export function moduleLevel(profile: Readonly<PlayerProfile>, moduleId: string): number {
  return profile.modules[moduleId] ?? 0;
}

export interface UpgradeResult {
  ok: boolean;
  reason?: 'maxLevel' | 'notEnoughCredits' | 'unknownModule';
  newLevel?: number;
}

/** Cost of the next level of a module, or null when it is already maxed. */
export function nextUpgradeCost(profile: Readonly<PlayerProfile>, moduleId: string): number | null {
  const def = findBaseModule(moduleId);
  if (!def) return null;
  const current = moduleLevel(profile, moduleId);
  const next = def.levels.find((l) => l.level === current + 1);
  return next ? next.costCredits : null;
}

export function upgradeModule(profile: PlayerProfile, moduleId: string): UpgradeResult {
  const def = findBaseModule(moduleId);
  if (!def) return { ok: false, reason: 'unknownModule' };

  const current = moduleLevel(profile, moduleId);
  const next = def.levels.find((l) => l.level === current + 1);
  if (!next) return { ok: false, reason: 'maxLevel' };
  if (profile.credits < next.costCredits) return { ok: false, reason: 'notEnoughCredits' };

  profile.credits -= next.costCredits;
  profile.modules[moduleId] = next.level;

  // Upgrading the stash immediately widens the capacity limit.
  if (moduleId === 'base_stash') {
    profile.stash.capacityKg = stashCapacityFor(profile.modules);
  }

  return { ok: true, newLevel: next.level };
}

/** Every module the player could interact with, built or not. */
export function allModuleIds(): readonly string[] {
  return ALL_BASE_MODULE_IDS;
}
