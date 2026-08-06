/**
 * Traders.
 *
 * Three of them, and they are deliberately not interchangeable. A single shop
 * that buys everything at one rate turns loot into an undifferentiated pile of
 * credits; three buyers with opinions turn the same pile into a question -
 * *who* wants this, and what will they give me for it?
 *
 *   Quartiermeister  the baseline. Fair, boring, always there.
 *   Feldärztin       pays far above value for medical supplies, refuses guns.
 *   Schwarzmarkt     buys anything at a premium, sells rare goods at a markup.
 *
 * Reputation is earned by trading and by finishing contracts. It raises the
 * price a trader pays and unlocks deeper stock - which means the way to a
 * better weapon runs through *using* a trader, not through grinding credits
 * somewhere else.
 */

import type { TraderDef } from './types';

export const TRADERS = {
  trd_quartermaster: {
    id: 'trd_quartermaster',
    name: 'Quartiermeister',
    blurb: 'Führt Buch. Über alles. Auch über dich.',
    icon: 'icon.ui.trader',
    requires: { moduleId: 'base_trader', level: 1 },
    baseSellFactor: 0.55,
    baseBuyFactor: 1.35,
    premiumCategories: [
      { category: 'material', factor: 1.15 },
      { category: 'ammo', factor: 1.1 },
    ],
    refuses: [],
    stock: [
      { itemId: 'itm_ammo_9mm', quantity: 240, tier: 0 },
      { itemId: 'itm_ammo_12', quantity: 90, tier: 0 },
      { itemId: 'itm_bandage', quantity: 12, tier: 0 },
      { itemId: 'itm_bag_small', quantity: 2, tier: 0 },
      { itemId: 'itm_armor_fiber', quantity: 2, tier: 0 },
      { itemId: 'itm_ammo_9mm_hp', quantity: 90, tier: 1 },
      { itemId: 'itm_ammo_74', quantity: 120, tier: 1 },
      { itemId: 'itm_bag_medium', quantity: 1, tier: 1 },
      { itemId: 'itm_thr_frag', quantity: 4, tier: 1 },
      { itemId: 'itm_ammo_12_slug', quantity: 30, tier: 2 },
      { itemId: 'itm_att_sight_reflex', quantity: 1, tier: 2 },
      { itemId: 'itm_wpn_bruch', quantity: 1, tier: 2 },
      { itemId: 'itm_bag_large', quantity: 1, tier: 3 },
    ],
  },

  trd_medic: {
    id: 'trd_medic',
    name: 'Feldärztin',
    blurb: 'Näht dich zusammen. Über den Preis redet sie nicht zweimal.',
    icon: 'icon.ui.medical',
    requires: { moduleId: 'base_trader', level: 2 },
    baseSellFactor: 0.5,
    baseBuyFactor: 1.2,
    // She pays nearly full value for medical stock, because that is what she
    // needs and because it gives bandages a second, better market.
    premiumCategories: [{ category: 'medical', factor: 1.75 }],
    refuses: ['weapon', 'attachment', 'throwable'],
    stock: [
      { itemId: 'itm_bandage', quantity: 20, tier: 0 },
      { itemId: 'itm_medkit', quantity: 4, tier: 0 },
      { itemId: 'itm_stim', quantity: 3, tier: 1 },
      { itemId: 'itm_armor_plate', quantity: 1, tier: 2 },
    ],
  },

  trd_blackmarket: {
    id: 'trd_blackmarket',
    name: 'Schwarzmarkt',
    blurb: 'Keine Namen, keine Quittungen, keine zweite Chance.',
    icon: 'icon.ui.blackmarket',
    requires: { moduleId: 'base_blackmarket', level: 1 },
    // Buys high and sells high: the black market is where you turn a good raid
    // into money quickly, and where you overpay for the thing you need now.
    baseSellFactor: 0.78,
    baseBuyFactor: 1.85,
    premiumCategories: [
      { category: 'valuable', factor: 1.3 },
      { category: 'key', factor: 1.5 },
    ],
    refuses: [],
    stock: [
      { itemId: 'itm_ammo_9mm_ap', quantity: 60, tier: 0 },
      { itemId: 'itm_key_vault', quantity: 1, tier: 0 },
      { itemId: 'itm_att_mag_extended', quantity: 1, tier: 1 },
      { itemId: 'itm_att_muzzle_suppressor', quantity: 1, tier: 1 },
      { itemId: 'itm_wpn_nadel', quantity: 1, tier: 2 },
      { itemId: 'itm_case_small', quantity: 1, tier: 3 },
    ],
  },
} as const satisfies Record<string, TraderDef>;

export type TraderId = keyof typeof TRADERS;

export const ALL_TRADER_IDS = Object.keys(TRADERS) as TraderId[];

export function getTrader(id: TraderId): TraderDef {
  return TRADERS[id];
}

export function findTrader(id: string): TraderDef | undefined {
  return (TRADERS as Record<string, TraderDef>)[id];
}
