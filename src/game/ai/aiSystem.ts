/**
 * Enemy behaviour: a six-state finite state machine plus steering.
 *
 *   IDLE ──sees/hears──► INVESTIGATE ──confirms──► CHASE ──in range──► ATTACK
 *     ▲                       │                      │                   │
 *     └──────gives up─────────┴──────────────────────┘                   │
 *                                        ▲                               │
 *                                  FLEE ─┴──── health below threshold ───┘
 *
 * An FSM (rather than a behaviour tree) is the right tool at this scale: the
 * whole behaviour fits on one screen and is trivially debuggable. Squads,
 * flanking and cover selection arrive in M3 - that is when a tree earns its
 * complexity.
 */

import { AI } from '@/content/balance';
import { findEnemy } from '@/content/enemies';
import type { EntityId } from '@/core/ecs/entity';
import type { AiState, EnemyAgent, Transform } from '@/game/components';
import { approachAngle, DEG_TO_RAD } from '@/core/math/scalar';
import { moveCircle } from '@/game/simulation/collision';
import type { SimContext } from '@/game/simulation/simContext';
import { tryFire, tryReload } from '@/game/weapons/firing';
import { hasEyesOnTarget } from './perception';

const scratchIds: EntityId[] = [];

export function aiSystem(ctx: SimContext): void {
  const { world } = ctx;
  world.agents.keyArray(scratchIds);

  for (const entity of scratchIds) {
    const agent = world.agents.get(entity);
    if (!agent) continue;

    const health = world.healths.get(entity);
    if (!health || health.current <= 0) continue;

    const def = findEnemy(agent.enemyId);
    const transform = world.transforms.get(entity);
    if (!def || !transform) continue;

    agent.stateTime += ctx.dt;
    if (agent.attackCooldown > 0) agent.attackCooldown -= ctx.dt;
    if (agent.waitTimer > 0) agent.waitTimer -= ctx.dt;

    // Flee overrides everything: a wounded scavenger stops being a threat and
    // becomes a problem the player chooses whether to spend ammunition on.
    if (
      def.fleeHealthFraction > 0 &&
      health.current / health.max <= def.fleeHealthFraction &&
      agent.state !== 'flee'
    ) {
      setState(ctx, entity, agent, 'flee');
    }

    switch (agent.state) {
      case 'idle':
        updateIdle(ctx, entity, agent);
        break;
      case 'patrol':
        updatePatrol(ctx, entity, agent, transform, def.moveSpeed);
        break;
      case 'investigate':
        updateInvestigate(ctx, entity, agent, transform, def.moveSpeed);
        break;
      case 'chase':
        updateChase(ctx, entity, agent, transform, def.moveSpeed * def.chaseSpeedFactor, def.preferredRange);
        break;
      case 'attack':
        updateAttack(ctx, entity, agent, transform, def);
        break;
      case 'flee':
        updateFlee(ctx, entity, agent, transform, def.moveSpeed + AI.fleeSpeedBonus);
        break;
    }
  }
}

function setState(ctx: SimContext, entity: EntityId, agent: EnemyAgent, next: AiState): void {
  if (agent.state === next) return;
  const from = agent.state;
  agent.state = next;
  agent.stateTime = 0;
  ctx.bus.emit('ai:stateChanged', { entity, from, to: next });
}

// ─────────────────────────────────────────────────────────────────────────────
// States
// ─────────────────────────────────────────────────────────────────────────────

function updateIdle(ctx: SimContext, entity: EntityId, agent: EnemyAgent): void {
  if (agent.target !== null) {
    setState(ctx, entity, agent, 'chase');
    return;
  }
  if (agent.timeSinceSeen < 2) {
    setState(ctx, entity, agent, 'investigate');
    return;
  }
  if (agent.stateTime > AI.patrolPauseSeconds) {
    pickPatrolPoint(ctx, agent);
    setState(ctx, entity, agent, 'patrol');
  }
}

function updatePatrol(
  ctx: SimContext,
  entity: EntityId,
  agent: EnemyAgent,
  transform: Transform,
  speed: number,
): void {
  if (agent.target !== null) {
    setState(ctx, entity, agent, 'chase');
    return;
  }
  if (agent.timeSinceSeen < 2) {
    setState(ctx, entity, agent, 'investigate');
    return;
  }

  const arrived = moveTowards(ctx, entity, transform, agent.destX, agent.destY, speed);
  // Give up on an unreachable point rather than grinding against a wall
  // forever - the map is procedural, so some points will be awkward.
  if (arrived || agent.stateTime > 12) {
    setState(ctx, entity, agent, 'idle');
  }
}

function updateInvestigate(
  ctx: SimContext,
  entity: EntityId,
  agent: EnemyAgent,
  transform: Transform,
  speed: number,
): void {
  if (agent.target !== null) {
    setState(ctx, entity, agent, 'chase');
    return;
  }

  const arrived = moveTowards(ctx, entity, transform, agent.lastKnownX, agent.lastKnownY, speed * 0.85);
  if (arrived || agent.stateTime > AI.investigateSeconds) {
    setState(ctx, entity, agent, 'idle');
  }
}

function updateChase(
  ctx: SimContext,
  entity: EntityId,
  agent: EnemyAgent,
  transform: Transform,
  speed: number,
  preferredRange: number,
): void {
  const target = agent.target;
  if (target === null || !ctx.world.isAliveActor(target)) {
    agent.target = null;
    setState(ctx, entity, agent, 'investigate');
    return;
  }

  const targetTransform = ctx.world.transforms.get(target);
  if (!targetTransform) return;

  const dx = targetTransform.x - transform.x;
  const dy = targetTransform.y - transform.y;
  const dist = Math.hypot(dx, dy);

  const canSee = hasEyesOnTarget(ctx, entity);
  if (canSee && dist <= preferredRange) {
    setState(ctx, entity, agent, 'attack');
    return;
  }

  // No eyes on target: head for the last known position instead of magically
  // tracking through walls.
  const destX = canSee ? targetTransform.x : agent.lastKnownX;
  const destY = canSee ? targetTransform.y : agent.lastKnownY;
  moveTowards(ctx, entity, transform, destX, destY, speed);

  if (!canSee && agent.stateTime > 8) {
    agent.target = null;
    setState(ctx, entity, agent, 'investigate');
  }
}

function updateAttack(
  ctx: SimContext,
  entity: EntityId,
  agent: EnemyAgent,
  transform: Transform,
  def: NonNullable<ReturnType<typeof findEnemy>>,
): void {
  const target = agent.target;
  if (target === null || !ctx.world.isAliveActor(target)) {
    agent.target = null;
    setState(ctx, entity, agent, 'investigate');
    return;
  }

  const targetTransform = ctx.world.transforms.get(target);
  if (!targetTransform) return;

  const dx = targetTransform.x - transform.x;
  const dy = targetTransform.y - transform.y;
  const dist = Math.hypot(dx, dy);

  if (!hasEyesOnTarget(ctx, entity) || dist > def.preferredRange * 1.35) {
    setState(ctx, entity, agent, 'chase');
    return;
  }

  // Face the target. Turn rate is finite, so flanking an enemy actually works.
  const desired = Math.atan2(dy, dx);
  transform.rotation = approachAngle(
    transform.rotation,
    desired,
    AI.turnRateDeg * DEG_TO_RAD * ctx.dt,
  );

  // Hold the preferred distance: close in when too far, back off when too near.
  const tooClose = dist < def.preferredRange * 0.55;
  const tooFar = dist > def.preferredRange;
  if (tooClose || tooFar) {
    const sign = tooClose ? -1 : 1;
    stepInDirection(ctx, entity, transform, (dx / dist) * sign, (dy / dist) * sign, def.moveSpeed * 0.6);
  }

  const weapon = ctx.world.weapons.get(entity);
  if (!weapon) return;

  if (weapon.magazine <= 0) {
    tryReload(ctx, entity);
    return;
  }

  if (agent.burstRemaining > 0) {
    const fired = tryFire(ctx, entity, Math.cos(transform.rotation), Math.sin(transform.rotation), def.accuracy);
    if (fired === 'fired') {
      agent.burstRemaining--;
      if (agent.burstRemaining <= 0) agent.attackCooldown = def.attackCooldownSeconds;
    }
    return;
  }

  if (agent.attackCooldown <= 0) {
    // Only start a burst once actually facing the target, so the first round of
    // a burst is not fired sideways.
    const aimError = Math.abs(angleDifference(transform.rotation, desired));
    if (aimError < 12 * DEG_TO_RAD) {
      agent.burstRemaining = def.burstCount;
    }
  }
}

function updateFlee(
  ctx: SimContext,
  entity: EntityId,
  agent: EnemyAgent,
  transform: Transform,
  speed: number,
): void {
  if (agent.stateTime > AI.fleeSeconds) {
    agent.target = null;
    setState(ctx, entity, agent, 'idle');
    return;
  }

  const threatX = agent.target !== null
    ? (ctx.world.transforms.get(agent.target)?.x ?? agent.lastKnownX)
    : agent.lastKnownX;
  const threatY = agent.target !== null
    ? (ctx.world.transforms.get(agent.target)?.y ?? agent.lastKnownY)
    : agent.lastKnownY;

  const dx = transform.x - threatX;
  const dy = transform.y - threatY;
  const len = Math.hypot(dx, dy) || 1;
  stepInDirection(ctx, entity, transform, dx / len, dy / len, speed);
}

// ─────────────────────────────────────────────────────────────────────────────
// Steering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Move towards a world position, returning true once close enough.
 *
 * Steering is intentionally naive for M1 (direct approach plus wall sliding).
 * Flow-field navigation lands in M3 - the interface here will not change.
 */
function moveTowards(
  ctx: SimContext,
  entity: EntityId,
  transform: Transform,
  destX: number,
  destY: number,
  speed: number,
): boolean {
  const dx = destX - transform.x;
  const dy = destY - transform.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= AI.arriveRadius) return true;

  stepInDirection(ctx, entity, transform, dx / dist, dy / dist, speed);

  const desired = Math.atan2(dy, dx);
  transform.rotation = approachAngle(
    transform.rotation,
    desired,
    AI.turnRateDeg * DEG_TO_RAD * ctx.dt,
  );
  return false;
}

function stepInDirection(
  ctx: SimContext,
  entity: EntityId,
  transform: Transform,
  dirX: number,
  dirY: number,
  speed: number,
): void {
  const collider = ctx.world.colliders.get(entity);
  const radius = collider?.radius ?? 0.4;
  const step = speed * ctx.dt;

  const moved = moveCircle(ctx.grid, transform.x, transform.y, radius, dirX * step, dirY * step);
  transform.x = moved.x;
  transform.y = moved.y;

  const velocity = ctx.world.velocities.get(entity);
  if (velocity) {
    velocity.x = dirX * speed;
    velocity.y = dirY * speed;
  }
}

function pickPatrolPoint(ctx: SimContext, agent: EnemyAgent): void {
  const rng = ctx.rng.ai;
  for (let attempt = 0; attempt < 8; attempt++) {
    const angle = rng.angle();
    const radius = rng.range(2, AI.patrolRadius);
    const x = agent.homeX + Math.cos(angle) * radius;
    const y = agent.homeY + Math.sin(angle) * radius;
    if (!ctx.grid.isWallAtWorld(x, y)) {
      agent.destX = x;
      agent.destY = y;
      return;
    }
  }
  agent.destX = agent.homeX;
  agent.destY = agent.homeY;
}

function angleDifference(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}
