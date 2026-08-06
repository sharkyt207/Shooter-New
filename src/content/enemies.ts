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
    // The Order fights as a unit: when the player takes cover, they answer it.
    throwableItemId: 'itm_thr_frag',
    xp: 110,
    visual: 'actor.order_runner',
  },

  /**
   * The Warden.
   *
   * Guards a rift core and never leaves it far. Deliberately not a damage
   * sponge: the fight changes shape three times, and each phase asks a
   * different question of the player.
   */
  enm_warden: {
    id: 'enm_warden',
    name: 'Wächter',
    faction: 'wardens',
    health: 620,
    moveSpeed: 2.2,
    chaseSpeedFactor: 1.1,
    radius: 0.62,
    armorClass: 5,
    perception: {
      visionRange: 21,
      visionConeDeg: 120,
      hearingRange: 24,
      awarenessSeconds: 0.25,
      memorySeconds: 14,
    },
    weaponId: 'wpn_warden_lance',
    accuracy: 0.72,
    attackCooldownSeconds: 1.6,
    burstCount: 5,
    preferredRange: 14,
    fleeHealthFraction: 0,
    lootTableId: 'loot_drop_warden',
    throwableItemId: 'itm_thr_frag',
    xp: 900,
    isBoss: true,
    phases: [
      // Holds its ground and punishes anyone in the open.
      { healthAbove: 0.6, speedMult: 0.85, cooldownMult: 1.15, accuracyBonus: 0, label: 'Wache' },
      // Starts advancing: cover stops being permanent.
      { healthAbove: 0.3, speedMult: 1.15, cooldownMult: 0.85, accuracyBonus: 0.08, label: 'Vorstoß' },
      // Nothing held back.
      { healthAbove: 0, speedMult: 1.45, cooldownMult: 0.6, accuracyBonus: 0.15, label: 'Entfesselt' },
    ],
    visual: 'actor.warden',
  },
} as const satisfies Record<string, EnemyDef>;

export type EnemyId = keyof typeof ENEMIES;

export function getEnemy(id: EnemyId): EnemyDef {
  return ENEMIES[id];
}

export function findEnemy(id: string): EnemyDef | undefined {
  return (ENEMIES as Record<string, EnemyDef>)[id];
}
