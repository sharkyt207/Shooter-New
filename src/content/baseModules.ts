/**
 * Base modules and their upgrade levels.
 *
 * The operations base is the reason a raid matters beyond the raid itself
 * (Pillar P5).
 *
 * Two rules shape the numbers below.
 *
 * **Build times are measured against a raid, not against a coffee break.** A
 * raid runs ten minutes, so a build that takes fifteen is one raid's worth of
 * waiting - the timer sends the player *into* the rift instead of out of the
 * app. Nothing here is ever purchasable with money, and nothing beyond level 1
 * is instant.
 *
 * **Dependencies express fiction, not padding.** The gunsmith needs a workbench
 * because you cannot build weapons on a folding table; the black market needs a
 * well-connected trader because that is who knows the people.
 */

import type { BaseModuleDef, RecipeDef } from './types';

export const BASE_MODULES = {
  base_stash: {
    id: 'base_stash',
    name: 'Lager',
    description: 'Sicherer Bestand. Was hier liegt, überlebt jeden Tod.',
    icon: 'icon.ui.stash',
    levels: [
      { level: 1, costCredits: 0, unlocks: 'Grundlager', stashCapacityKg: 120 },
      {
        level: 2,
        costCredits: 2500,
        unlocks: 'Erweiterte Regale',
        stashCapacityKg: 220,
        buildSeconds: 600,
      },
      {
        level: 3,
        costCredits: 9000,
        unlocks: 'Klimatisiertes Depot',
        stashCapacityKg: 400,
        buildSeconds: 1800,
      },
    ],
  },

  base_workbench: {
    id: 'base_workbench',
    name: 'Werkbank',
    description: 'Aus Schrott wird Ausrüstung. Aus Ausrüstung wird ein Rückweg.',
    icon: 'icon.ui.workbench',
    levels: [
      { level: 1, costCredits: 0, unlocks: 'Munition und Verbandsmaterial' },
      {
        level: 2,
        costCredits: 4200,
        unlocks: 'Rüstungsbau, Präzisionsmunition',
        buildSeconds: 900,
      },
      {
        level: 3,
        costCredits: 15000,
        unlocks: 'Schwere Munition, geringere Fehlschlagquote',
        buildSeconds: 2700,
      },
    ],
  },

  base_trader: {
    id: 'base_trader',
    name: 'Händler',
    description: 'Kauft, was du findest. Fragt nicht, woher.',
    icon: 'icon.ui.trader',
    levels: [
      { level: 1, costCredits: 0, unlocks: 'Quartiermeister, Aufträge' },
      {
        level: 2,
        costCredits: 3200,
        unlocks: 'Feldärztin, besserer Ankaufswert',
        buildSeconds: 720,
      },
      {
        level: 3,
        costCredits: 11000,
        unlocks: 'Kontakt zum Schwarzmarkt',
        buildSeconds: 2400,
      },
    ],
  },

  base_medical: {
    id: 'base_medical',
    name: 'Medizin',
    description: 'Behandelt, was aus den Rissen zurückkommt.',
    icon: 'icon.ui.medical',
    levels: [
      {
        level: 1,
        costCredits: 1800,
        unlocks: 'Herstellung von Feldverbänden, Versicherung',
        buildSeconds: 480,
      },
      {
        level: 2,
        costCredits: 6500,
        unlocks: 'Trauma-Kits, günstigere Prämien, schnellere Rückgabe',
        buildSeconds: 1500,
      },
    ],
  },

  base_research: {
    id: 'base_research',
    name: 'Forschung',
    description: 'Analysiert Echo-Material. Versteht es nicht, aber nutzt es.',
    icon: 'icon.ui.research',
    levels: [
      {
        level: 1,
        costCredits: 5000,
        unlocks: 'Auswertung von Forschungsdaten',
        buildSeconds: 1200,
        requires: [{ moduleId: 'base_workbench', level: 2 }],
      },
      {
        level: 2,
        costCredits: 18000,
        unlocks: 'Riss-Signaturen vorab lesbar, sichere Behälter',
        buildSeconds: 3600,
      },
    ],
  },

  base_gunsmith: {
    id: 'base_gunsmith',
    name: 'Waffenwerkstatt',
    description: 'Repariert, was aus dem Riss zurückkommt. Baut, was noch hineinsoll.',
    icon: 'icon.ui.gunsmith',
    levels: [
      {
        level: 1,
        costCredits: 7500,
        unlocks: 'Waffenreparatur, Anbauteile fertigen',
        buildSeconds: 1500,
        requires: [{ moduleId: 'base_workbench', level: 2 }],
      },
      {
        level: 2,
        costCredits: 24000,
        unlocks: 'Waffenbau, bessere Reparaturobergrenze',
        buildSeconds: 3600,
        requires: [{ moduleId: 'base_workbench', level: 3 }],
      },
    ],
  },

  base_blackmarket: {
    id: 'base_blackmarket',
    name: 'Schwarzmarkt',
    description: 'Kauft alles. Fragt nie. Nimmt sich seinen Anteil.',
    icon: 'icon.ui.blackmarket',
    levels: [
      {
        level: 1,
        costCredits: 12000,
        unlocks: 'Ankauf ohne Fragen, seltene Ware',
        buildSeconds: 2400,
        requires: [{ moduleId: 'base_trader', level: 3 }],
      },
    ],
  },
} as const satisfies Record<string, BaseModuleDef>;

export type BaseModuleId = keyof typeof BASE_MODULES;

export const ALL_BASE_MODULE_IDS = Object.keys(BASE_MODULES) as BaseModuleId[];

export function getBaseModule(id: BaseModuleId): BaseModuleDef {
  return BASE_MODULES[id];
}

export function findBaseModule(id: string): BaseModuleDef | undefined {
  return (BASE_MODULES as Record<string, BaseModuleDef>)[id];
}

/** Modules that exist from the very first launch, at level 1. */
export const STARTING_MODULES: readonly BaseModuleId[] = ['base_stash', 'base_workbench', 'base_trader'];

/**
 * Recipes.
 *
 * `craftSeconds` runs in real time and keeps running during a raid, so the
 * workbench is something you *set going* before leaving rather than something
 * you sit and watch. The cheap consumables stay instant: nobody should have to
 * schedule a bandage.
 *
 * `failureChance` is the price of building the good things yourself. It falls
 * with every module level above the requirement (see `craftQueue.ts`), so
 * investing in the base is what turns a gamble into a supply chain.
 */
export const RECIPES = {
  rcp_bandage: {
    id: 'rcp_bandage',
    name: 'Feldverband',
    requires: { moduleId: 'base_workbench', level: 1 },
    inputs: [{ itemId: 'itm_polymer', quantity: 1 }],
    output: { itemId: 'itm_bandage', quantity: 2 },
    craftSeconds: 0,
  },
  rcp_ammo_9mm: {
    id: 'rcp_ammo_9mm',
    name: '9 mm Kern (30)',
    requires: { moduleId: 'base_workbench', level: 1 },
    inputs: [
      { itemId: 'itm_scrap', quantity: 2 },
      { itemId: 'itm_copper', quantity: 1 },
    ],
    output: { itemId: 'itm_ammo_9mm', quantity: 30 },
    craftSeconds: 60,
  },
  rcp_ammo_74: {
    id: 'rcp_ammo_74',
    name: '7,4 Riss (20)',
    requires: { moduleId: 'base_workbench', level: 2 },
    inputs: [
      { itemId: 'itm_scrap', quantity: 3 },
      { itemId: 'itm_copper', quantity: 2 },
      { itemId: 'itm_circuit', quantity: 1 },
    ],
    output: { itemId: 'itm_ammo_74', quantity: 20 },
    craftSeconds: 180,
    failureChance: 0.1,
  },
  rcp_armor_fiber: {
    id: 'rcp_armor_fiber',
    name: 'Faserweste',
    requires: { moduleId: 'base_workbench', level: 2 },
    inputs: [
      { itemId: 'itm_polymer', quantity: 4 },
      { itemId: 'itm_scrap', quantity: 3 },
    ],
    output: { itemId: 'itm_armor_fiber', quantity: 1 },
    craftSeconds: 300,
    failureChance: 0.12,
  },

  rcp_medkit: {
    id: 'rcp_medkit',
    name: 'Trauma-Kit',
    requires: { moduleId: 'base_medical', level: 2 },
    inputs: [
      { itemId: 'itm_bandage', quantity: 3 },
      { itemId: 'itm_polymer', quantity: 2 },
      { itemId: 'itm_circuit', quantity: 1 },
    ],
    output: { itemId: 'itm_medkit', quantity: 1 },
    craftSeconds: 420,
    failureChance: 0.1,
  },

  rcp_ammo_9mm_ap: {
    id: 'rcp_ammo_9mm_ap',
    name: '9 mm Stahlkern (20)',
    requires: { moduleId: 'base_gunsmith', level: 1 },
    inputs: [
      { itemId: 'itm_scrap', quantity: 4 },
      { itemId: 'itm_copper', quantity: 3 },
      { itemId: 'itm_circuit', quantity: 1 },
    ],
    output: { itemId: 'itm_ammo_9mm_ap', quantity: 20 },
    craftSeconds: 480,
    failureChance: 0.18,
  },

  rcp_sight_reflex: {
    id: 'rcp_sight_reflex',
    name: 'Reflexvisier',
    requires: { moduleId: 'base_gunsmith', level: 1 },
    inputs: [
      { itemId: 'itm_circuit', quantity: 2 },
      { itemId: 'itm_polymer', quantity: 2 },
    ],
    output: { itemId: 'itm_att_sight_reflex', quantity: 1 },
    craftSeconds: 600,
    failureChance: 0.2,
  },

  rcp_case_small: {
    id: 'rcp_case_small',
    name: 'Sicherer Behälter',
    requires: { moduleId: 'base_research', level: 2 },
    inputs: [
      { itemId: 'itm_circuit', quantity: 4 },
      { itemId: 'itm_polymer', quantity: 6 },
      { itemId: 'itm_echoshard', quantity: 3 },
    ],
    output: { itemId: 'itm_case_small', quantity: 1 },
    craftSeconds: 1800,
    failureChance: 0.15,
  },

  rcp_wpn_bruch: {
    id: 'rcp_wpn_bruch',
    name: 'Bruch M9',
    requires: { moduleId: 'base_gunsmith', level: 2 },
    inputs: [
      { itemId: 'itm_scrap', quantity: 10 },
      { itemId: 'itm_copper', quantity: 6 },
      { itemId: 'itm_circuit', quantity: 3 },
    ],
    output: { itemId: 'itm_wpn_bruch', quantity: 1 },
    craftSeconds: 2400,
    failureChance: 0.22,
  },
} as const satisfies Record<string, RecipeDef>;

export type RecipeId = keyof typeof RECIPES;

export const ALL_RECIPE_IDS = Object.keys(RECIPES) as RecipeId[];

export function getRecipe(id: RecipeId): RecipeDef {
  return RECIPES[id];
}

export function findRecipe(id: string): RecipeDef | undefined {
  return (RECIPES as Record<string, RecipeDef>)[id];
}
