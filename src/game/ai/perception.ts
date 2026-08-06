/**
 * Enemy perception: sight and hearing.
 *
 * Sight = inside the view cone AND within range AND unobstructed line of
 * sight, held for `awarenessSeconds` before the target counts as confirmed.
 * That delay is what gives the player the half second needed to break contact -
 * without it, being seen and being shot are the same instant, and stealth
 * stops being a real option (Pillar P3).
 *
 * Since M3 the player is no longer the only thing worth looking at: every
 * hostile faction is a candidate, so a scavenger band and an Order patrol will
 * find and fight each other whether or not anyone is watching.
 *
 * Perception is the most expensive AI work, so it runs on a stagger: each
 * enemy re-evaluates roughly every `perceptionIntervalSeconds`, not every tick.
 */

import { AI, LIGHT } from '@/content/balance';
import { findEnemy } from '@/content/enemies';
import { isHostile, playerThreatBias } from '@/content/factions';
import type { EntityId } from '@/core/ecs/entity';
import { DEG_TO_RAD } from '@/core/math/scalar';
import { isInCone } from '@/core/math/shapes';
import type { SimContext } from '@/game/simulation/simContext';
import { reportContact, reportNoise } from './squad';

const scratchPoint = { x: 0, y: 0 };
const scratchIds: EntityId[] = [];

export function perceptionSystem(ctx: SimContext): void {
  const { world, dt } = ctx;

  world.agents.keyArray(scratchIds);

  for (const entity of scratchIds) {
    const agent = world.agents.get(entity);
    if (!agent) continue;

    const health = world.healths.get(entity);
    if (!health || health.current <= 0) continue;

    agent.timeSinceSeen += dt;
    agent.perceptionTimer -= dt;

    // A flashbanged enemy perceives nothing at all. That is what makes the
    // flash an escape tool rather than a weaker grenade.
    if (world.disoriented.has(entity)) {
      agent.awareness = 0;
      agent.target = null;
      continue;
    }

    checkHearing(ctx, entity, agent);

    if (agent.perceptionTimer > 0) continue;
    // Stagger by entity id so perception updates spread across ticks instead of
    // all landing on the same one.
    agent.perceptionTimer = AI.perceptionIntervalSeconds + (entity % 5) * 0.006;

    // Drop a target that died or vanished.
    if (agent.target !== null && !world.isAliveActor(agent.target)) agent.target = null;

    const def = findEnemy(agent.enemyId);
    const self = world.transforms.get(entity);
    const faction = world.factions.get(entity);
    if (!def || !self || !faction) continue;

    const best = findVisibleTarget(ctx, entity, faction.id, self, def);

    if (best !== null) {
      const targetTransform = world.transforms.require(best);
      agent.awareness += AI.perceptionIntervalSeconds;
      agent.lastKnownX = targetTransform.x;
      agent.lastKnownY = targetTransform.y;
      agent.timeSinceSeen = 0;

      if (agent.awareness >= def.perception.awarenessSeconds) {
        const isNewContact = agent.target === null;
        agent.target = best;

        if (isNewContact) {
          ctx.bus.emit('ai:alerted', { entity, x: self.x, y: self.y });
        }

        // Knowledge travels through the squad rather than by proximity.
        const member = world.squadMembers.get(entity);
        const squad = member ? ctx.squads.get(member.squadId) : undefined;
        if (squad) reportContact(ctx, squad, best, targetTransform.x, targetTransform.y);
      }
    } else {
      agent.awareness = Math.max(0, agent.awareness - AI.perceptionIntervalSeconds * 0.6);
      if (agent.target !== null && agent.timeSinceSeen > def.perception.memorySeconds) {
        agent.target = null;
      }
    }
  }
}

/** Does this enemy currently have eyes on its target? */
export function hasEyesOnTarget(ctx: SimContext, entity: EntityId): boolean {
  const agent = ctx.world.agents.get(entity);
  if (!agent || agent.target === null) return false;
  return agent.timeSinceSeen < 0.25;
}

/**
 * The most pressing visible hostile, or null.
 *
 * Scoring, not "first found": distance decides, with the player weighted more
 * heavily for everyone except the Wardens - who care about whoever is closest
 * to what they guard. Without that bias the player could stroll through a
 * firefight unnoticed, which is funny once and broken thereafter.
 */
function findVisibleTarget(
  ctx: SimContext,
  self: EntityId,
  selfFaction: string,
  transform: { x: number; y: number; rotation: number },
  def: NonNullable<ReturnType<typeof findEnemy>>,
): EntityId | null {
  const halfCone = def.perception.visionConeDeg * 0.5 * DEG_TO_RAD;
  const bias = playerThreatBias(selfFaction as never);
  // Weather scales sight for everyone equally. Fog is not a handicap, it is a
  // different raid: it hides the player exactly as well as it hides the enemy.
  const baseRange = def.perception.visionRange * ctx.weather.visionMultiplier;

  let best: EntityId | null = null;
  let bestScore = Infinity;

  for (const [candidate, faction] of ctx.world.factions.entries()) {
    if (candidate === self) continue;
    if (!isHostile(selfFaction as never, faction.id)) continue;

    const health = ctx.world.healths.get(candidate);
    if (!health || health.current <= 0) continue;

    const other = ctx.world.transforms.get(candidate);
    if (!other) continue;

    const range = baseRange * lightPenalty(ctx, candidate);

    scratchPoint.x = other.x;
    scratchPoint.y = other.y;
    if (!isInCone(transform.x, transform.y, transform.rotation, halfCone, range, scratchPoint)) {
      continue;
    }
    if (!ctx.grid.hasLineOfSight(transform.x, transform.y, other.x, other.y)) continue;

    const distance = Math.hypot(other.x - transform.x, other.y - transform.y);
    const score = ctx.world.players.has(candidate) ? distance / bias : distance;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

/**
 * How much further this candidate can be seen because of the lamp it carries.
 *
 * This is the entire trade the night side of a fragment is built on: a player
 * who lights the room can see it, and so can everyone in it. Turning the lamp
 * off is always available and always costs something.
 */
function lightPenalty(ctx: SimContext, candidate: EntityId): number {
  if (ctx.weather.lightMultiplier >= LIGHT.darkThreshold) return 1;
  return ctx.world.players.get(candidate)?.lightOn ? LIGHT.spottedRangeBonus : 1;
}

/**
 * Hearing, with walls muffling sound.
 *
 * A sound does not stop at a wall, it is attenuated by it. Counting the walls
 * a straight line crosses is a cheap, deterministic stand-in for real acoustic
 * propagation, and it is what finally makes the M2 suppressor pay off: half the
 * emitted radius, halved again per wall.
 */
function checkHearing(
  ctx: SimContext,
  entity: EntityId,
  agent: {
    enemyId: string;
    lastKnownX: number;
    lastKnownY: number;
    target: EntityId | null;
    timeSinceSeen: number;
  },
): void {
  if (ctx.noises.length === 0) return;

  const def = findEnemy(agent.enemyId);
  const self = ctx.world.transforms.get(entity);
  const faction = ctx.world.factions.get(entity);
  if (!def || !self || !faction) return;

  for (const noise of ctx.noises) {
    if (noise.source === entity) continue;
    // Allies making noise is not information worth investigating.
    if (noise.faction === faction.id) continue;

    const dx = noise.x - self.x;
    const dy = noise.y - self.y;
    const distance = Math.hypot(dx, dy);

    const audible = audibleRadius(ctx, noise.radius, noise.x, noise.y, self.x, self.y);
    if (distance > Math.min(audible, def.perception.hearingRange)) continue;

    agent.lastKnownX = noise.x;
    agent.lastKnownY = noise.y;
    if (agent.target === null) agent.timeSinceSeen = Math.min(agent.timeSinceSeen, 0.5);

    const member = ctx.world.squadMembers.get(entity);
    const squad = member ? ctx.squads.get(member.squadId) : undefined;
    if (squad) reportNoise(ctx, squad, noise.x, noise.y);
    return;
  }
}

/** Effective radius of a sound after passing through geometry. */
export function audibleRadius(
  ctx: SimContext,
  emittedRadius: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): number {
  // Weather first: a storm swallows sound, fog carries it.
  const radius = emittedRadius * ctx.weather.hearingMultiplier;
  const walls = ctx.grid.countWallsBetween(fromX, fromY, toX, toY);
  if (walls === 0) return radius;
  if (walls > AI.maxWallsHeard) return 0;
  return radius * Math.pow(AI.wallSoundDamping, walls);
}
