/**
 * Throwables.
 *
 * Three answers to three different problems, and none of them is "more damage":
 *
 *   Splitterladung  - solves a room you cannot enter
 *   Blender         - solves a fight you do not want to have
 *   Echo-Köder      - solves a patrol you would rather walk around
 *
 * The lure is the one that carries the game's identity: it does no damage at
 * all, it just makes a noise somewhere you are not. In a game built on
 * avoidance rather than kills, that is the strongest item in the list.
 */

import type { ThrowableDef } from './types';

export const THROWABLES = {
  thr_frag: {
    id: 'thr_frag',
    itemId: 'itm_thr_frag',
    name: 'Splitterladung',
    kind: 'frag',
    fuseSeconds: 2.6,
    throwSpeed: 14,
    throwRange: 12,
    radius: 4.2,
    damage: 95,
    disorientSeconds: 0,
    noiseRadius: 30,
    visual: 'fx.throwable.frag',
  },

  thr_flash: {
    id: 'thr_flash',
    itemId: 'itm_thr_flash',
    name: 'Blender',
    kind: 'flash',
    fuseSeconds: 1.7,
    throwSpeed: 15,
    throwRange: 13,
    radius: 6.5,
    damage: 0,
    disorientSeconds: 4.5,
    noiseRadius: 22,
    visual: 'fx.throwable.flash',
  },

  thr_lure: {
    id: 'thr_lure',
    itemId: 'itm_thr_lure',
    name: 'Echo-Köder',
    kind: 'lure',
    fuseSeconds: 1.2,
    throwSpeed: 13,
    throwRange: 16,
    radius: 1,
    damage: 0,
    disorientSeconds: 0,
    // Deliberately larger than a gunshot: the whole point is to pull a patrol
    // somewhere the player is not.
    noiseRadius: 34,
    visual: 'fx.throwable.lure',
  },
} as const satisfies Record<string, ThrowableDef>;

export type ThrowableId = keyof typeof THROWABLES;

export const ALL_THROWABLE_IDS = Object.keys(THROWABLES) as ThrowableId[];

export function getThrowable(id: ThrowableId): ThrowableDef {
  return THROWABLES[id];
}

export function findThrowable(id: string): ThrowableDef | undefined {
  return (THROWABLES as Record<string, ThrowableDef>)[id];
}

/** Reverse lookup: which throwable does this inventory item represent? */
export function throwableForItem(itemId: string): ThrowableDef | undefined {
  for (const id of ALL_THROWABLE_IDS) {
    if (THROWABLES[id].itemId === itemId) return THROWABLES[id];
  }
  return undefined;
}
