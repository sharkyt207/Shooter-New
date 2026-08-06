/**
 * Faction relations.
 *
 * Until M3 the world contained exactly one conflict: everything against the
 * player. That makes the rift feel like a shooting gallery built for one
 * visitor.
 *
 * With real relations the Echo world stops revolving around the player. A
 * scavenger band and an Order patrol will fight each other whether or not
 * anyone is watching - and the most valuable thing the player can do is
 * sometimes to let them, then loot what is left (Pillar P3).
 */

export type FactionId = 'player' | 'scavengers' | 'order' | 'weaved' | 'wardens';

export type Stance = 'hostile' | 'neutral' | 'allied';

export interface FactionDef {
  id: FactionId;
  name: string;
  /** How the faction behaves once it has a target. Drives squad tactics. */
  doctrine: 'opportunist' | 'disciplined' | 'frenzied' | 'territorial';
}

export const FACTIONS = {
  player: { id: 'player', name: 'Operator', doctrine: 'opportunist' },
  scavengers: { id: 'scavengers', name: 'Streuner', doctrine: 'opportunist' },
  order: { id: 'order', name: 'Kartograph-Orden', doctrine: 'disciplined' },
  weaved: { id: 'weaved', name: 'Die Verwobenen', doctrine: 'frenzied' },
  wardens: { id: 'wardens', name: 'Wächter', doctrine: 'territorial' },
} as const satisfies Record<FactionId, FactionDef>;

/**
 * Who fights whom.
 *
 * Symmetric by construction - `stanceBetween` reads the table in both
 * directions, so a one-sided entry is impossible.
 */
const HOSTILITIES: ReadonlyArray<readonly [FactionId, FactionId]> = [
  ['player', 'scavengers'],
  ['player', 'order'],
  ['player', 'weaved'],
  ['player', 'wardens'],

  // The Order is clearing the rifts; the scavengers are looting them. They do
  // not get along.
  ['order', 'scavengers'],

  // The Weaved attack anything that is still recognisably itself.
  ['weaved', 'scavengers'],
  ['weaved', 'order'],
  ['weaved', 'wardens'],

  // Wardens defend rift cores against everyone who comes close.
  ['wardens', 'scavengers'],
  ['wardens', 'order'],
];

const hostileKeys = new Set<string>();
for (const [a, b] of HOSTILITIES) {
  hostileKeys.add(`${a}|${b}`);
  hostileKeys.add(`${b}|${a}`);
}

export function stanceBetween(a: FactionId, b: FactionId): Stance {
  if (a === b) return 'allied';
  return hostileKeys.has(`${a}|${b}`) ? 'hostile' : 'neutral';
}

export function isHostile(a: FactionId, b: FactionId): boolean {
  return stanceBetween(a, b) === 'hostile';
}

export function isAllied(a: FactionId, b: FactionId): boolean {
  return a === b;
}

export function getFaction(id: FactionId): FactionDef {
  return FACTIONS[id];
}

/**
 * Extra weight a faction gives the player over other hostiles.
 *
 * Wardens guard a place, so whoever is nearest is the problem. Everyone else
 * treats the armed stranger as the more urgent threat - without this the player
 * could stroll through a firefight unnoticed, which would be funny once and
 * broken thereafter.
 */
export function playerThreatBias(faction: FactionId): number {
  return faction === 'wardens' ? 1 : 1.6;
}
