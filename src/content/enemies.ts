/**
 * Enemy archetypes.
 *
 * Two archetypes in the prototype, built as a contrast pair:
 *
 *   Streuner    - many, weak, cowardly. Teaches the player that noise attracts
 *                 attention and that not every fight is worth the ammunition.
 *   Ordenslaeufer - few, disciplined, deadly at range. Teaches positioning and
 *                 the value of leaving before you are found.
 *
 * Squads, flanking and bosses arrive in M3.
 */

import type { EnemyDef } from './types';

export const ENEMIES = {
  enm_scavenger: {
    id: 'enm_scavenger',
    name: 'Streuner',
    faction: 'scavengers',
    health: 58,
    moveSpeed: 2.5,
    chaseSpeedFactor: 1.25,
    radius: 0.4,
    armorClass: 0,
    perception: {
      visionRange: 12,
      visionConeDeg: 105,
      hearingRange: 15,
      awarenessSeconds: 0.55,
      memorySeconds: 5,
    },
    weaponId: 'wpn_scav_pipe',
    accuracy: 0.45,
    attackCooldownSeconds: 1.5,
    burstCount: 3,
    preferredRange: 6.5,
    fleeHealthFraction: 0.3,
    lootTableId: 'loot_drop_scavenger',
    xp: 35,
    visual: 'actor.scavenger',
  },

  enm_order_runner: {
    id: 'enm_order_runner',
    name: 'Ordensläufer',
    faction: 'order',
    health: 105,
    moveSpeed: 3.1,
    chaseSpeedFactor: 1.15,
    radius: 0.44,
    armorClass: 2,
    perception: {
      visionRange: 17,
      visionConeDeg: 85,
      hearingRange: 18,
      awarenessSeconds: 0.3,
      memorySeconds: 9,
    },
    weaponId: 'wpn_order_carbine',
    accuracy: 0.78,
    attackCooldownSeconds: 1.05,
    burstCount: 4,
    preferredRange: 11,
    fleeHealthFraction: 0,
    lootTableId: 'loot_drop_order',
    xp: 110,
    visual: 'actor.order_runner',
  },
} as const satisfies Record<string, EnemyDef>;

export type EnemyId = keyof typeof ENEMIES;

export function getEnemy(id: EnemyId): EnemyDef {
  return ENEMIES[id];
}

export function findEnemy(id: string): EnemyDef | undefined {
  return (ENEMIES as Record<string, EnemyDef>)[id];
}
