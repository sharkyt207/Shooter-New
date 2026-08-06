/**
 * The player's input, expressed as intent rather than as device events.
 *
 * The simulation never learns whether a thumb, a keyboard or (one day) a
 * network packet produced this. That indirection is what makes the same
 * simulation runnable headlessly in tests and, later, on a server (ADR-006).
 */

export interface PlayerIntent {
  /** Movement axis, each component in -1..1. */
  moveX: number;
  moveY: number;
  /** Aim direction. A zero vector means "keep facing the movement direction". */
  aimX: number;
  aimY: number;

  fire: boolean;
  sprint: boolean;
  reload: boolean;
  /** Held down to search containers and pick up loot. */
  interact: boolean;

  // One-shot requests. The simulation clears these once consumed, so a UI tap
  // can never be processed twice.
  useItemId: string | null;
  dropItemId: string | null;
  dropQuantity: number;
  /** Throwable to throw this tick, in the current aim direction. */
  throwItemId: string | null;
  melee: boolean;
  /** Flip the flashlight. One shot, so a held button cannot strobe it. */
  toggleLight: boolean;
}

export function createIntent(): PlayerIntent {
  return {
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    fire: false,
    sprint: false,
    reload: false,
    interact: false,
    useItemId: null,
    dropItemId: null,
    dropQuantity: 0,
    throwItemId: null,
    melee: false,
    toggleLight: false,
  };
}

export function copyIntent(target: PlayerIntent, source: Readonly<PlayerIntent>): void {
  target.moveX = source.moveX;
  target.moveY = source.moveY;
  target.aimX = source.aimX;
  target.aimY = source.aimY;
  target.fire = source.fire;
  target.sprint = source.sprint;
  target.reload = source.reload;
  target.interact = source.interact;
  // One-shots latch: they survive until the simulation consumes them, so an
  // input that arrives between two ticks is never dropped.
  if (source.useItemId !== null) target.useItemId = source.useItemId;
  if (source.dropItemId !== null) {
    target.dropItemId = source.dropItemId;
    target.dropQuantity = source.dropQuantity;
  }
  if (source.throwItemId !== null) target.throwItemId = source.throwItemId;
  if (source.melee) target.melee = true;
  if (source.toggleLight) target.toggleLight = true;
}

export function clearOneShots(intent: PlayerIntent): void {
  intent.useItemId = null;
  intent.dropItemId = null;
  intent.dropQuantity = 0;
  intent.throwItemId = null;
  intent.melee = false;
  intent.toggleLight = false;
}
