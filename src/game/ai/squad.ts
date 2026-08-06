/**
 * Squads: shared knowledge and role assignment.
 *
 * A squad is not a formation, it is a *blackboard*. Members write what they
 * learn and read what the others learned, and one member picks roles for the
 * rest. That is enough to produce the two behaviours that matter:
 *
 *   - the group reacts as a group, so flanking the player is emergent rather
 *     than scripted
 *   - the group does not all do the same thing, so a fight has structure
 *
 * Doctrine (from `content/factions.ts`) decides *how* the roles are assigned:
 * the Order flanks methodically, scavengers hang back and shoot, the Weaved all
 * charge at once.
 */

import { AI } from '@/content/balance';
import { getFaction, type FactionId } from '@/content/factions';
import type { EntityId } from '@/core/ecs/entity';
import type { SquadRole } from '@/game/components';
import type { SimContext } from '@/game/simulation/simContext';

export interface Squad {
  id: number;
  faction: FactionId;
  members: EntityId[];

  /** Target the squad has agreed on, or null. */
  target: EntityId | null;
  /** Last position anyone in the squad saw or heard the target at. */
  lastKnownX: number;
  lastKnownY: number;
  /** Tick that knowledge was written. Stale knowledge is dropped. */
  knownAtTick: number;

  /** Member currently assigned to flank, if any. */
  flanker: EntityId | null;
  /** Which side of the target the flanker should approach from, -1 or 1. */
  flankSide: number;
}

export class SquadRegistry {
  private readonly squads = new Map<number, Squad>();
  private nextId = 1;

  get count(): number {
    return this.squads.size;
  }

  create(faction: FactionId): Squad {
    const squad: Squad = {
      id: this.nextId++,
      faction,
      members: [],
      target: null,
      lastKnownX: 0,
      lastKnownY: 0,
      knownAtTick: -99999,
      flanker: null,
      flankSide: 1,
    };
    this.squads.set(squad.id, squad);
    return squad;
  }

  get(id: number): Squad | undefined {
    return this.squads.get(id);
  }

  all(): IterableIterator<Squad> {
    return this.squads.values();
  }

  add(squad: Squad, entity: EntityId): void {
    squad.members.push(entity);
  }

  /** Forget a dead member. Squads with no members left are dropped. */
  remove(entity: EntityId): void {
    for (const squad of this.squads.values()) {
      const index = squad.members.indexOf(entity);
      if (index >= 0) squad.members.splice(index, 1);
      if (squad.flanker === entity) squad.flanker = null;
      if (squad.members.length === 0) this.squads.delete(squad.id);
    }
  }

  clear(): void {
    this.squads.clear();
    this.nextId = 1;
  }
}

/**
 * Share a sighting with the whole squad.
 *
 * This replaces the radius-based shout from M1: knowledge now travels through
 * the squad structure rather than through proximity, which is both cheaper and
 * far more predictable to reason about.
 */
export function reportContact(
  ctx: SimContext,
  squad: Squad,
  target: EntityId,
  x: number,
  y: number,
): void {
  squad.target = target;
  squad.lastKnownX = x;
  squad.lastKnownY = y;
  squad.knownAtTick = ctx.tick;
}

/** Share a noise without committing to a target. */
export function reportNoise(ctx: SimContext, squad: Squad, x: number, y: number): void {
  // A confirmed target outranks a noise - do not distract a squad already
  // engaged by a footstep somewhere else.
  if (squad.target !== null && ctx.tick - squad.knownAtTick < AI.squadMemoryTicks) return;
  squad.lastKnownX = x;
  squad.lastKnownY = y;
  squad.knownAtTick = ctx.tick;
}

/** Is the squad's knowledge still worth acting on? */
export function hasFreshIntel(ctx: SimContext, squad: Squad): boolean {
  return ctx.tick - squad.knownAtTick < AI.squadMemoryTicks;
}

/**
 * Assign roles once per squad per tick.
 *
 * Deliberately simple and deterministic: the closest live member assaults, the
 * furthest flanks, everyone else suppresses. No scoring function, no
 * negotiation - just a stable rule the player can learn to read.
 */
export function assignRoles(ctx: SimContext, squad: Squad): void {
  const doctrine = getFaction(squad.faction).doctrine;

  if (squad.target === null || !hasFreshIntel(ctx, squad)) {
    for (const member of squad.members) setRole(ctx, member, 'assault');
    squad.flanker = null;
    return;
  }

  // The Weaved do not manoeuvre. They all come at once, and that is the point
  // of fighting them.
  if (doctrine === 'frenzied') {
    for (const member of squad.members) setRole(ctx, member, 'assault');
    squad.flanker = null;
    return;
  }

  const alive = squad.members.filter((member) => ctx.world.isAliveActor(member));
  if (alive.length === 0) {
    squad.flanker = null;
    return;
  }

  const ranked = alive
    .map((member) => ({ member, distance: distanceToIntel(ctx, squad, member) }))
    .sort((a, b) => a.distance - b.distance);

  const closest = ranked[0]?.member ?? null;
  const furthest = ranked.length > 1 ? (ranked[ranked.length - 1]?.member ?? null) : null;

  // Scavengers are opportunists: they keep their distance and shoot rather
  // than close in.
  const wantsFlank = doctrine === 'disciplined' || doctrine === 'territorial';

  for (const { member } of ranked) {
    if (member === closest) setRole(ctx, member, doctrine === 'opportunist' ? 'suppress' : 'assault');
    else if (wantsFlank && member === furthest) setRole(ctx, member, 'flank');
    else setRole(ctx, member, 'suppress');
  }

  const nextFlanker = wantsFlank ? furthest : null;
  if (nextFlanker !== squad.flanker) {
    squad.flanker = nextFlanker;
    // Pick a side once per flanker so they commit instead of oscillating
    // around the target.
    squad.flankSide = ctx.rng.ai.chance(0.5) ? -1 : 1;
  }
}

function setRole(ctx: SimContext, entity: EntityId, role: SquadRole): void {
  const member = ctx.world.squadMembers.get(entity);
  if (member) member.role = role;
}

function distanceToIntel(ctx: SimContext, squad: Squad, entity: EntityId): number {
  const transform = ctx.world.transforms.get(entity);
  if (!transform) return Infinity;
  return Math.hypot(transform.x - squad.lastKnownX, transform.y - squad.lastKnownY);
}

/**
 * Where a flanker should head: offset perpendicular to the target's bearing.
 *
 * Approaching from the side is what makes a squad dangerous - the player cannot
 * hold one firing line and be safe.
 */
export function flankPosition(
  squad: Squad,
  fromX: number,
  fromY: number,
  out: { x: number; y: number },
): { x: number; y: number } {
  const dx = squad.lastKnownX - fromX;
  const dy = squad.lastKnownY - fromY;
  const length = Math.hypot(dx, dy) || 1;

  const perpX = (-dy / length) * squad.flankSide;
  const perpY = (dx / length) * squad.flankSide;

  out.x = squad.lastKnownX + perpX * AI.flankOffset;
  out.y = squad.lastKnownY + perpY * AI.flankOffset;
  return out;
}
