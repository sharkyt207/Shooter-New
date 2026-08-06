/**
 * Base modules and their upgrade levels.
 *
 * The operations base is the reason a raid matters beyond the raid itself
 * (Pillar P5). The prototype ships the data model and three functioning
 * modules; build times, module interdependencies and the full upgrade tree
 * follow in M5.
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
      { level: 2, costCredits: 2500, unlocks: 'Erweiterte Regale', stashCapacityKg: 220 },
      { level: 3, costCredits: 9000, unlocks: 'Klimatisiertes Depot', stashCapacityKg: 400 },
    ],
  },

  base_workbench: {
    id: 'base_workbench',
    name: 'Werkbank',
    description: 'Aus Schrott wird Ausrüstung. Aus Ausrüstung wird ein Rückweg.',
    icon: 'icon.ui.workbench',
    levels: [
      { level: 1, costCredits: 0, unlocks: 'Munition und Verbandsmaterial' },
      { level: 2, costCredits: 4200, unlocks: 'Rüstungsreparatur, Präzisionsmunition' },
      { level: 3, costCredits: 15000, unlocks: 'Waffenbau' },
    ],
  },

  base_trader: {
    id: 'base_trader',
    name: 'Händler',
    description: 'Kauft, was du findest. Fragt nicht, woher.',
    icon: 'icon.ui.trader',
    levels: [
      { level: 1, costCredits: 0, unlocks: 'Grundsortiment, 55 % Ankaufswert' },
      { level: 2, costCredits: 3200, unlocks: 'Besserer Ankaufswert, Rüstungshandel' },
      { level: 3, costCredits: 11000, unlocks: 'Schwarzmarkt-Zugang' },
    ],
  },

  base_medical: {
    id: 'base_medical',
    name: 'Medizin',
    description: 'Behandelt, was aus den Rissen zurückkommt.',
    icon: 'icon.ui.medical',
    levels: [
      { level: 1, costCredits: 1800, unlocks: 'Herstellung von Feldverbänden' },
      { level: 2, costCredits: 6500, unlocks: 'Trauma-Kits, Startbonus auf Lebenspunkte' },
    ],
  },

  base_research: {
    id: 'base_research',
    name: 'Forschung',
    description: 'Analysiert Echo-Material. Versteht es nicht, aber nutzt es.',
    icon: 'icon.ui.research',
    levels: [
      { level: 1, costCredits: 5000, unlocks: 'Auswertung von Forschungsdaten' },
      { level: 2, costCredits: 18000, unlocks: 'Riss-Signaturen vorab lesbar' },
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
    craftSeconds: 0,
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
    craftSeconds: 0,
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
    craftSeconds: 0,
  },
} as const satisfies Record<string, RecipeDef>;

export type RecipeId = keyof typeof RECIPES;

export const ALL_RECIPE_IDS = Object.keys(RECIPES) as RecipeId[];

export function getRecipe(id: RecipeId): RecipeDef {
  return RECIPES[id];
}
