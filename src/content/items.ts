/**
 * Item catalogue.
 *
 * All names follow the naming school in docs/06-ART-DIRECTION.md: functional,
 * matter-of-fact German with an invented technical suffix. Nothing here is
 * borrowed from an existing game (see docs/00-VISION.md, section 8).
 */

import type { ItemDef } from './types';

export const ITEMS = {
  // ── Weapons (the inventory representation; stats live in weapons.ts) ──────
  itm_wpn_splitter: {
    id: 'itm_wpn_splitter',
    name: 'Splitter VK-2',
    description: 'Kompakte Maschinenpistole. Hohe Feuerrate, geringe Reichweite.',
    category: 'weapon',
    rarity: 'common',
    weight: 2.8,
    value: 640,
    stackSize: 1,
    icon: 'icon.item.wpn_splitter',
  },
  itm_wpn_nadel: {
    id: 'itm_wpn_nadel',
    name: 'Nadel PR-9',
    description: 'Präzisionsgewehr aus Bestand des Kartograph-Ordens. Belohnt ruhige Hände.',
    category: 'weapon',
    rarity: 'rare',
    weight: 4.1,
    value: 2150,
    stackSize: 1,
    icon: 'icon.item.wpn_nadel',
  },
  itm_wpn_bruch: {
    id: 'itm_wpn_bruch',
    name: 'Bruch SG-40',
    description: 'Grobe Schrotwaffe. Auf zwei Meter gibt es keine Diskussion.',
    category: 'weapon',
    rarity: 'uncommon',
    weight: 3.6,
    value: 1280,
    stackSize: 1,
    icon: 'icon.item.wpn_bruch',
  },

  // ── Ammunition ───────────────────────────────────────────────────────────
  itm_ammo_9mm: {
    id: 'itm_ammo_9mm',
    name: '9 mm Kern',
    description: 'Standardmunition. Überall zu finden, selten genug wenn es zählt.',
    category: 'ammo',
    rarity: 'common',
    weight: 0.012,
    value: 3,
    stackSize: 180,
    icon: 'icon.item.ammo_9mm',
  },
  itm_ammo_74: {
    id: 'itm_ammo_74',
    name: '7,4 Riss',
    description: 'Gehärtete Präzisionsmunition. Durchschlägt leichte Panzerung.',
    category: 'ammo',
    rarity: 'rare',
    weight: 0.019,
    value: 11,
    stackSize: 120,
    icon: 'icon.item.ammo_74',
  },
  itm_ammo_12: {
    id: 'itm_ammo_12',
    name: '12er Streu',
    description: 'Schrotpatronen. Laut, brutal, kurzreichweitig.',
    category: 'ammo',
    rarity: 'uncommon',
    weight: 0.045,
    value: 8,
    stackSize: 60,
    icon: 'icon.item.ammo_12',
  },

  // ── Medical ──────────────────────────────────────────────────────────────
  itm_bandage: {
    id: 'itm_bandage',
    name: 'Feldverband',
    description: 'Stoppt die Blutung. Mehr nicht.',
    category: 'medical',
    rarity: 'common',
    weight: 0.2,
    value: 45,
    stackSize: 6,
    icon: 'icon.item.bandage',
    consumable: { health: 25, useSeconds: 2.2 },
  },
  itm_medkit: {
    id: 'itm_medkit',
    name: 'Trauma-Kit',
    description: 'Vollständige Wundversorgung. Braucht Zeit, die man selten hat.',
    category: 'medical',
    rarity: 'uncommon',
    weight: 0.9,
    value: 210,
    stackSize: 3,
    icon: 'icon.item.medkit',
    consumable: { health: 65, useSeconds: 4.5 },
  },
  itm_stim: {
    id: 'itm_stim',
    name: 'Echo-Stim',
    description: 'Synthetisiert aus Riss-Rückständen. Der Körper vergisst kurz, dass er müde ist.',
    category: 'medical',
    rarity: 'rare',
    weight: 0.15,
    value: 380,
    stackSize: 4,
    icon: 'icon.item.stim',
    consumable: { health: 15, stamina: 100, useSeconds: 1.2 },
  },

  // ── Armor ────────────────────────────────────────────────────────────────
  itm_armor_fiber: {
    id: 'itm_armor_fiber',
    name: 'Faserweste',
    description: 'Leicht, günstig, hält genau einen Fehler aus.',
    category: 'armor',
    rarity: 'common',
    weight: 3.2,
    value: 420,
    stackSize: 1,
    icon: 'icon.item.armor_fiber',
    armor: { reduction: 0.22, durability: 40 },
  },
  itm_armor_plate: {
    id: 'itm_armor_plate',
    name: 'Plattenträger MK-3',
    description: 'Schwer und teuer. Der Unterschied zwischen Rückweg und Verlustmeldung.',
    category: 'armor',
    rarity: 'epic',
    weight: 8.4,
    value: 3400,
    stackSize: 1,
    icon: 'icon.item.armor_plate',
    armor: { reduction: 0.45, durability: 110 },
  },

  // ── Backpacks ────────────────────────────────────────────────────────────
  itm_bag_small: {
    id: 'itm_bag_small',
    name: 'Umhängetasche',
    description: 'Wenig Platz. Zwingt zu Entscheidungen.',
    category: 'backpack',
    rarity: 'common',
    weight: 0.8,
    value: 180,
    stackSize: 1,
    icon: 'icon.item.bag_small',
    capacityKg: 14,
  },
  itm_bag_medium: {
    id: 'itm_bag_medium',
    name: 'Feldrucksack',
    description: 'Der Standard für ernsthafte Ausflüge in die Risse.',
    category: 'backpack',
    rarity: 'uncommon',
    weight: 1.9,
    value: 760,
    stackSize: 1,
    icon: 'icon.item.bag_medium',
    capacityKg: 24,
  },
  itm_bag_large: {
    id: 'itm_bag_large',
    name: 'Bergungstrage',
    description: 'Nimmt fast alles auf. Macht dich fast unbeweglich.',
    category: 'backpack',
    rarity: 'rare',
    weight: 3.4,
    value: 2400,
    stackSize: 1,
    icon: 'icon.item.bag_large',
    capacityKg: 38,
  },

  // ── Materials ────────────────────────────────────────────────────────────
  itm_scrap: {
    id: 'itm_scrap',
    name: 'Metallschrott',
    description: 'Grundstoff für jede Werkbank.',
    category: 'material',
    rarity: 'common',
    weight: 0.35,
    value: 22,
    stackSize: 40,
    icon: 'icon.item.scrap',
  },
  itm_copper: {
    id: 'itm_copper',
    name: 'Kupferwicklung',
    description: 'Aus ausgeschlachteten Motoren. Leitet, was leiten soll.',
    category: 'material',
    rarity: 'common',
    weight: 0.3,
    value: 38,
    stackSize: 30,
    icon: 'icon.item.copper',
  },
  itm_circuit: {
    id: 'itm_circuit',
    name: 'Platinenmodul',
    description: 'Funktionierende Elektronik ist in den Rissen fast schon Währung.',
    category: 'material',
    rarity: 'uncommon',
    weight: 0.18,
    value: 145,
    stackSize: 20,
    icon: 'icon.item.circuit',
  },
  itm_polymer: {
    id: 'itm_polymer',
    name: 'Verbundpolymer',
    description: 'Zäh, leicht, in dieser Reinheit nicht mehr herstellbar.',
    category: 'material',
    rarity: 'uncommon',
    weight: 0.22,
    value: 165,
    stackSize: 20,
    icon: 'icon.item.polymer',
  },

  // ── Valuables ────────────────────────────────────────────────────────────
  itm_echoshard: {
    id: 'itm_echoshard',
    name: 'Echo-Splitter',
    description: 'Ein Stück gefrorene Riss-Energie. Selbst der Tod nimmt dir nicht alle davon.',
    category: 'valuable',
    rarity: 'rare',
    weight: 0.05,
    value: 500,
    stackSize: 50,
    icon: 'icon.item.echoshard',
  },
  itm_datacore: {
    id: 'itm_datacore',
    name: 'Forschungsdaten',
    description: 'Aufzeichnungen von Menschen, die den Rissen zu nahe kamen.',
    category: 'valuable',
    rarity: 'epic',
    weight: 0.4,
    value: 1750,
    stackSize: 8,
    icon: 'icon.item.datacore',
  },
  itm_risscore: {
    id: 'itm_risscore',
    name: 'Riss-Kern',
    description: 'Der Puls eines Echo-Risses, eingeschlossen. Er ist warm. Er sollte es nicht sein.',
    category: 'valuable',
    rarity: 'legendary',
    weight: 1.6,
    value: 8500,
    stackSize: 3,
    icon: 'icon.item.risscore',
  },
} as const satisfies Record<string, ItemDef>;

export type ItemId = keyof typeof ITEMS;

export function getItem(id: ItemId): ItemDef {
  return ITEMS[id];
}

/** Runtime-safe lookup for data coming from a save file. */
export function findItem(id: string): ItemDef | undefined {
  return (ITEMS as Record<string, ItemDef>)[id];
}

export function isItemId(id: string): id is ItemId {
  return id in ITEMS;
}

export const ALL_ITEM_IDS = Object.keys(ITEMS) as ItemId[];
