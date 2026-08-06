/**
 * Enemy perception: sight and hearing.
 *
 * Sight = inside the view cone AND within range AND unobstructed line of
 * sight, held for `awarenessSeconds` before the target counts as confirmed.
 * That delay is what gives the player the half second needed to break contact -
 * without it, being seen and being shot are the same instant, and stealth
 * stops being a real option (Pillar P3).
 *
 * Perception is the most expensive AI work, so it runs on a stagger: each
 * enemy re-evaluates roughly every `perceptionIntervalSeconds`, not every tick.
 */

import { AI } from '@/content/balance';
import { findEnemy } from '@/content/enemies';
import type { EntityId } from '@/core/ecs/entity';
import { DEG_TO_RAD } from '@/core/math/scalar';
import { isInCone } from '@/core/math/shapes';
import type { SimContext } from '@/game/simulation/simContext';

const scratchPoint = { x: 0, y: 0 };
const scratchIds: EntityId[] = [];

export function perceptionSystem(ctx: SimContext): void {
  const { world, dt } = ctx;
  const player = world.playerEntity;

  world.agents.keyArray(scratchIds);

  for (const entity of scratchIds) {
    const agent = world.agents.get(entity);
    if (!agent) continue;

    const health = world.healths.get(entity);
    if (!health || health.current <= 0) continue;

    agent.timeSinceSeen += dt;
    agent.perceptionTimer -= dt;

    // Hearing is cheap and time-critical (a gunshot must register immediately),
    // so it is checked every tick regardless of the stagger.
    checkHearing(ctx, entity, agent);

    if (agent.perceptionTimer > 0) continue;
    // Stagger by entity id so perception updates spread across ticks instead of
    // all landing on the same one.
    agent.perceptionTimer = AI.perceptionIntervalSeconds + (entity % 5) * 0.006;

    if (player === null || !world.isAliveActor(player)) {
      agent.awareness = Math.max(0, agent.awareness - dt);
      continue;
    }

    const def = findEnemy(agent.enemyId);
    if (!def) continue;

    const self = world.transforms.get(entity);
    const targetTransform = world.transforms.get(player);
    if (!self || !targetTransform) continue;

    scratchPoint.x = targetTransform.x;
    scratchPoint.y = targetTransform.y;

    const inCone = isInCone(
      self.x,
      self.y,
      self.rotation,
      def.perception.visionConeDeg * 0.5 * DEG_TO_RAD,
      def.perception.visionRange,
      scratchPoint,
    );

    const visible =
      inCone && ctx.grid.hasLineOfSight(self.x, self.y, targetTransform.x, targetTransform.y);

    if (visible) {
      agent.awareness += AI.perceptionIntervalSeconds;
      agent.lastKnownX = targetTransform.x;
      agent.lastKnownY = targetTransform.y;
      agent.timeSinceSeen = 0;

      if (agent.awareness >= def.perception.awarenessSeconds) {
        if (agent.target === null) {
          ctx.bus.emit('ai:alerted', { entity, x: self.x, y: self.y });
          alertNearbyAllies(ctx, entity, self.x, self.y, targetTransform.x, targetTransform.y);
        }
        agent.target = player;
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

function checkHearing(
  ctx: SimContext,
  entity: EntityId,
  agent: { enemyId: string; lastKnownX: number; lastKnownY: number; target: EntityId | null; timeSinceSeen: number },
): void {
  if (ctx.noises.length === 0) return;

  const def = findEnemy(agent.enemyId);
  const self = ctx.world.transforms.get(entity);
  if (!def || !self) return;

  const faction = ctx.world.factions.get(entity);

  for (const noise of ctx.noises) {
    if (faction && noise.faction === faction.id) continue;
    if (noise.source === entity) continue;

    const dx = noise.x - self.x;
    const dy = noise.y - self.y;
    const distSq = dx * dx + dy * dy;

    // A sound is heard when the listener is inside its radius AND within the
    // enemy's own hearing range - loud sounds carry, deaf enemies still miss them.
    const audibleRange = Math.min(noise.radius, def.perception.hearingRange);
    if (distSq > audibleRange * audibleRange) continue;

    agent.lastKnownX = noise.x;
    agent.lastKnownY = noise.y;
    // Heard, not seen: the enemy investigates the position but has not
    // acquired a target yet.
    if (agent.target === null) agent.timeSinceSeen = Math.min(agent.timeSinceSeen, 0.5);
    return;
  }
}

/** A confirmed sighting is shouted to nearby allies of the same faction. */
function alertNearbyAllies(
  ctx: SimContext,
  origin: EntityId,
  x: number,
  y: number,
  targetX: number,
  targetY: number,
): void {
  const faction = ctx.world.factions.get(origin);
  if (!faction) return;

  const radiusSq = AI.allyAlertRadius * AI.allyAlertRadius;

  for (const [entity, agent] of ctx.world.agents.entries()) {
    if (entity === origin) continue;
    const otherFaction = ctx.world.factions.get(entity);
    if (!otherFaction || otherFaction.id !== faction.id) continue;

    const transform = ctx.world.transforms.get(entity);
    if (!transform) continue;

    const dx = transform.x - x;
    const dy = transform.y - y;
    if (dx * dx + dy * dy > radiusSq) continue;

    agent.lastKnownX = targetX;
    agent.lastKnownY = targetY;
    agent.timeSinceSeen = Math.min(agent.timeSinceSeen, 1);
  }
}
