/**
 * Weighted loot tables.
 *
 * Design intent: common containers should mostly produce *useful* things
 * (ammo, bandages, scrap) so a raid always pays for itself, while high-value
 * items stay rare enough that finding one changes the player's plan for the
 * rest of the raid - which is exactly the "do I leave now?" moment we are
 * designing for (Pillar P1).
 */

import type { LootTableDef } from './types';

export const LOOT_TABLES = {
  loot_crate_common: {
    id: 'loot_crate_common',
    rolls: { min: 1, max: 3 },
    emptyChance: 0.18,
    entries: [
      { itemId: 'itm_ammo_9mm', weight: 26, minQuantity: 12, maxQuantity: 34 },
      { itemId: 'itm_scrap', weight: 22, minQuantity: 1, maxQuantity: 4 },
      { itemId: 'itm_copper', weight: 16, minQuantity: 1, maxQuantity: 3 },
      { itemId: 'itm_bandage', weight: 14, minQuantity: 1, maxQuantity: 2 },
      { itemId: 'itm_ammo_12', weight: 8, minQuantity: 4, maxQuantity: 10 },
      { itemId: 'itm_polymer', weight: 6, minQuantity: 1, maxQuantity: 2 },
      { itemId: 'itm_circuit', weight: 5, minQuantity: 1, maxQuantity: 2 },
      { itemId: 'itm_echoshard', weight: 3, minQuantity: 1, maxQuantity: 1 },
    ],
  },

  loot_locker_military: {
    id: 'loot_locker_military',
    rolls: { min: 1, max: 3 },
    emptyChance: 0.12,
    entries: [
      { itemId: 'itm_ammo_74', weight: 22, minQuantity: 8, maxQuantity: 22 },
      { itemId: 'itm_ammo_9mm', weight: 18, minQuantity: 15, maxQuantity: 40 },
      { itemId: 'itm_armor_fiber', weight: 10, minQuantity: 1, maxQuantity: 1 },
      { itemId: 'itm_medkit', weight: 10, minQuantity: 1, maxQuantity: 1 },
      { itemId: 'itm_circuit', weight: 9, minQuantity: 1, maxQuantity: 3 },
      { itemId: 'itm_wpn_bruch', weight: 6, minQuantity: 1, maxQuantity: 1 },
      { itemId: 'itm_polymer', weight: 8, minQuantity: 1, maxQuantity: 3 },
      { itemId: 'itm_bag_medium', weight: 5, minQuantity: 1, maxQuantity: 1 },
      { itemId: 'itm_wpn_nadel', weight: 2, minQuantity: 1, maxQuantity: 1 },
      { itemId: 'itm_armor_plate', weight: 1, minQuantity: 1, maxQuantity: 1 },
    ],
  },

  loot_medcase: {
    id: 'loot_medcase',
    rolls: { min: 1, max: 2 },
    emptyChance: 0.1,
    entries: [
      { itemId: 'itm_bandage', weight: 40, minQuantity: 1, maxQuantity: 3 },
      { itemId: 'itm_medkit', weight: 24, minQuantity: 1, maxQuantity: 2 },
      { itemId: 'itm_stim', weight: 10, minQuantity: 1, maxQuantity: 1 },
      { itemId: 'itm_polymer', weight: 12, minQuantity: 1, maxQuantity: 2 },
      { itemId: 'itm_datacore', weight: 3, minQuantity: 1, maxQuantity: 1 },
    ],
  },

  /**
   * Echo caches sit next to anomalies. High reward, and reaching one usually
   * means walking through something that wants you dead.
   */
  loot_echo_cache: {
    id: 'loot_echo_cache',
    rolls: { min: 2, max: 3 },
    emptyChance: 0.0,
    entries: [
      { itemId: 'itm_echoshard', weight: 34, minQuantity: 1, maxQuantity: 4 },
      { itemId: 'itm_circuit', weight: 16, minQuantity: 2, maxQuantity: 5 },
      { itemId: 'itm_datacore', weight: 14, minQuantity: 1, maxQuantity: 2 },
      { itemId: 'itm_stim', weight: 12, minQuantity: 1, maxQuantity: 2 },
      { itemId: 'itm_polymer', weight: 12, minQuantity: 2, maxQuantity: 4 },
      { itemId: 'itm_armor_plate', weight: 6, minQuantity: 1, maxQuantity: 1 },
      { itemId: 'itm_risscore', weight: 3, minQuantity: 1, maxQuantity: 1 },
    ],
  },

  // ── Enemy drops ──────────────────────────────────────────────────────────
  loot_drop_scavenger: {
    id: 'loot_drop_scavenger',
    rolls: { min: 1, max: 2 },
    emptyChance: 0.25,
    entries: [
      { itemId: 'itm_ammo_9mm', weight: 34, minQuantity: 6, maxQuantity: 18 },
      { itemId: 'itm_scrap', weight: 24, minQuantity: 1, maxQuantity: 3 },
      { itemId: 'itm_bandage', weight: 18, minQuantity: 1, maxQuantity: 1 },
      { itemId: 'itm_copper', weight: 14, minQuantity: 1, maxQuantity: 2 },
      { itemId: 'itm_echoshard', weight: 4, minQuantity: 1, maxQuantity: 1 },
      { itemId: 'itm_bag_small', weight: 6, minQuantity: 1, maxQuantity: 1 },
    ],
  },

  loot_drop_order: {
    id: 'loot_drop_order',
    rolls: { min: 1, max: 3 },
    emptyChance: 0.08,
    entries: [
      { itemId: 'itm_ammo_74', weight: 30, minQuantity: 8, maxQuantity: 20 },
      { itemId: 'itm_medkit', weight: 14, minQuantity: 1, maxQuantity: 1 },
      { itemId: 'itm_circuit', weight: 14, minQuantity: 1, maxQuantity: 2 },
      { itemId: 'itm_armor_fiber', weight: 12, minQuantity: 1, maxQuantity: 1 },
      { itemId: 'itm_polymer', weight: 12, minQuantity: 1, maxQuantity: 2 },
      { itemId: 'itm_echoshard', weight: 10, minQuantity: 1, maxQuantity: 2 },
      { itemId: 'itm_datacore', weight: 5, minQuantity: 1, maxQuantity: 1 },
      { itemId: 'itm_wpn_nadel', weight: 3, minQuantity: 1, maxQuantity: 1 },
    ],
  },
  /**
   * Warden drop.
   *
   * The only reliable source of rift cores. Killing one has to be worth the
   * ammunition, the risk and the noise it makes.
   */
  loot_drop_warden: {
    id: 'loot_drop_warden',
    rolls: { min: 4, max: 6 },
    emptyChance: 0,
    entries: [
      { itemId: 'itm_echoshard', weight: 24, minQuantity: 3, maxQuantity: 7 },
      { itemId: 'itm_ammo_74_ap', weight: 20, minQuantity: 15, maxQuantity: 40 },
      { itemId: 'itm_datacore', weight: 16, minQuantity: 1, maxQuantity: 3 },
      { itemId: 'itm_risscore', weight: 12, minQuantity: 1, maxQuantity: 1 },
      { itemId: 'itm_armor_plate', weight: 10, minQuantity: 1, maxQuantity: 1 },
      { itemId: 'itm_helmet_shell', weight: 9, minQuantity: 1, maxQuantity: 1 },
      { itemId: 'itm_att_muzzle_suppressor', weight: 5, minQuantity: 1, maxQuantity: 1 },
      { itemId: 'itm_wpn_nadel', weight: 4, minQuantity: 1, maxQuantity: 1 },
    ],
  },
} as const satisfies Record<string, LootTableDef>;

export type LootTableId = keyof typeof LOOT_TABLES;

export function getLootTable(id: LootTableId): LootTableDef {
  return LOOT_TABLES[id];
}

export function findLootTable(id: string): LootTableDef | undefined {
  return (LOOT_TABLES as Record<string, LootTableDef>)[id];
}
