/**
 * Biome fragments of the Echo world.
 *
 * A raid map is a chain of fragments joined by seam zones (ADR-011). Each
 * biome sets its own density, lighting and inhabitants, so walking from a
 * forest into a cargo terminal is a genuine change in how the game plays,
 * not just a change of floor texture.
 */

import type { BiomeDef, ContainerDef } from './types';

export const CONTAINERS = {
  cnt_crate: {
    id: 'cnt_crate',
    kind: 'crate',
    name: 'Transportkiste',
    lootTableId: 'loot_crate_common',
    searchSeconds: 1.4,
    visual: 'prop.crate',
  },
  cnt_locker: {
    id: 'cnt_locker',
    kind: 'locker',
    name: 'Ausrüstungsspind',
    lootTableId: 'loot_locker_military',
    searchSeconds: 2.6,
    visual: 'prop.locker',
  },
  cnt_medcase: {
    id: 'cnt_medcase',
    kind: 'medcase',
    name: 'Sanitätskoffer',
    lootTableId: 'loot_medcase',
    searchSeconds: 1.8,
    visual: 'prop.medcase',
  },
  cnt_echo_cache: {
    id: 'cnt_echo_cache',
    kind: 'echo_cache',
    name: 'Echo-Depot',
    lootTableId: 'loot_echo_cache',
    searchSeconds: 3.5,
    visual: 'prop.echo_cache',
  },
} as const satisfies Record<string, ContainerDef>;

export type ContainerId = keyof typeof CONTAINERS;

export function getContainer(id: ContainerId): ContainerDef {
  return CONTAINERS[id];
}

export function findContainer(id: string): ContainerDef | undefined {
  return (CONTAINERS as Record<string, ContainerDef>)[id];
}

export const BIOMES = {
  biome_lab: {
    id: 'biome_lab',
    name: 'Forschungslabor',
    ambientColor: 0x2a3a4a,
    ambientIntensity: 0.34,
    wallDensity: 0.3,
    containerDensity: 3.1,
    enemyDensity: 0.9,
    enemyWeights: [
      { enemyId: 'enm_scavenger', weight: 5 },
      { enemyId: 'enm_order_runner', weight: 5 },
    ],
    containerWeights: [
      { containerId: 'cnt_crate', weight: 8 },
      { containerId: 'cnt_locker', weight: 6 },
      { containerId: 'cnt_medcase', weight: 7 },
      { containerId: 'cnt_echo_cache', weight: 2 },
    ],
    anomalyChance: 0.55,
    tiles: { floor: 'tile.lab.floor', wall: 'tile.lab.wall' },
  },

  biome_forest: {
    id: 'biome_forest',
    name: 'Vergessener Forst',
    ambientColor: 0x1e3326,
    ambientIntensity: 0.46,
    wallDensity: 0.2,
    containerDensity: 1.7,
    enemyDensity: 1.3,
    enemyWeights: [
      { enemyId: 'enm_scavenger', weight: 8 },
      { enemyId: 'enm_order_runner', weight: 2 },
    ],
    containerWeights: [
      { containerId: 'cnt_crate', weight: 10 },
      { containerId: 'cnt_medcase', weight: 3 },
      { containerId: 'cnt_locker', weight: 2 },
      { containerId: 'cnt_echo_cache', weight: 1 },
    ],
    anomalyChance: 0.3,
    tiles: { floor: 'tile.forest.floor', wall: 'tile.forest.wall' },
  },

  biome_terminal: {
    id: 'biome_terminal',
    name: 'Frachtterminal Nord',
    ambientColor: 0x38302a,
    ambientIntensity: 0.4,
    wallDensity: 0.26,
    containerDensity: 3.6,
    enemyDensity: 1.05,
    enemyWeights: [
      { enemyId: 'enm_scavenger', weight: 6 },
      { enemyId: 'enm_order_runner', weight: 4 },
    ],
    containerWeights: [
      { containerId: 'cnt_crate', weight: 12 },
      { containerId: 'cnt_locker', weight: 7 },
      { containerId: 'cnt_medcase', weight: 3 },
      { containerId: 'cnt_echo_cache', weight: 2 },
    ],
    anomalyChance: 0.4,
    tiles: { floor: 'tile.terminal.floor', wall: 'tile.terminal.wall' },
  },
} as const satisfies Record<string, BiomeDef>;

export type BiomeId = keyof typeof BIOMES;

export const ALL_BIOME_IDS = Object.keys(BIOMES) as BiomeId[];

export function getBiome(id: BiomeId): BiomeDef {
  return BIOMES[id];
}

export function findBiome(id: string): BiomeDef | undefined {
  return (BIOMES as Record<string, BiomeDef>)[id];
}
