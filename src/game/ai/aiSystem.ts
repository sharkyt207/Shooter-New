/**
 * Enemy behaviour: a six-state finite state machine plus steering.
 *
 *   IDLE ──sees/hears──► INVESTIGATE ──confirms──► CHASE ──in range──► ATTACK
 *     ▲                       │                      │                   │
 *     └──────gives up─────────┴──────────────────────┘                   │
 *                                        ▲                               │
 *                                  FLEE ─┴──── health below threshold ───┘
 *
 * An FSM (rather than a behaviour tree) remains the right tool at this scale:
 * the whole behaviour fits on one screen and is readable in the debug overlay.
 * M3 adds three things on top of it, all of which sit *beside* the FSM rather
 * than inside it:
 *
 *   - flow-field navigation, so an enemy can actually get somewhere
 *   - squad roles, so a group has structure instead of five identical chasers
 *   - phases, grenades and doctrine, so archetypes differ in how they fight
 */

import { AI } from '@/content/balance';
import { findEnemy } from '@/content/enemies';
import { getFaction } from '@/content/factions';
import type { EntityId } from '@/core/ecs/entity';
import type { AiState, EnemyAgent, SquadRole, Transform } from '@/game/components';
import { approachAngle, clamp, DEG_TO_RAD } from '@/core/math/scalar';
import { throwItem } from '@/game/combat/throwables';
import { moveCircle } from '@/game/simulation/collision';
import type { SimContext } from '@/game/simulation/simContext';
import { tryFire, tryReload } from '@/game/weapons/firing';
import { hasEyesOnTarget } from './perception';
import { assignRoles, flankPosition, hasFreshIntel, type Squad } from './squad';

const scratchIds: EntityId[] = [];
const scratchDir = { x: 0, y: 0 };
const scratchFlank = { x: 0, y: 0 };

/** Per-archetype stat scaling for the current phase. */
interface PhaseModifiers {
  speed: number;
  cooldown: number;
  accuracy: number;
}

const NEUTRAL_PHASE: PhaseModifiers = { speed: 1, cooldown: 1, accuracy: 0 };

export function aiSystem(ctx: SimContext): void {
  const { world } = ctx;

  // Roles are decided once per squad per tick, before any member acts, so the
  // whole group reasons about the same picture.
  for (const squad of ctx.squads.all()) assignRoles(ctx, squad);

  world.agents.keyArray(scratchIds);

  for (const entity of scratchIds) {
    const agent = world.agents.get(entity);
    if (!agent) continue;

    const health = world.healths.get(entity);
    if (!health || health.current <= 0) continue;

    const def = findEnemy(agent.enemyId);
    const transform = world.transforms.get(entity);
    if (!def || !transform) continue;

    // Disoriented enemies stand still and shoot nothing - the window a
    // flashbang buys is the whole reason to carry one.
    if (world.disoriented.has(entity)) {
      agent.burstRemaining = 0;
      continue;
    }

    const healthFraction = health.current / health.max;
    const phase = phaseFor(def, healthFraction);
    const member = world.squadMembers.get(entity);
    const squad = member ? ctx.squads.get(member.squadId) : undefined;

    if (def.isBoss) announceBoss(ctx, entity, agent, def, health, healthFraction);

    // Adopt the squad's picture when this member has nothing better.
    if (squad && agent.target === null && hasFreshIntel(ctx, squad)) {
      agent.lastKnownX = squad.lastKnownX;
      agent.lastKnownY = squad.lastKnownY;
      if (squad.target !== null && world.isAliveActor(squad.target)) {
        agent.timeSinceSeen = Math.min(agent.timeSinceSeen, 1.5);
      }
    }

    agent.stateTime += ctx.dt;
    if (agent.attackCooldown > 0) agent.attackCooldown -= ctx.dt;
    if (agent.waitTimer > 0) agent.waitTimer -= ctx.dt;
    if (member && member.throwCooldown > 0) member.throwCooldown -= ctx.dt;

    // Flee overrides everything: a wounded scavenger stops being a threat and
    // becomes a problem the player chooses whether to spend ammunition on.
    if (
      def.fleeHealthFraction > 0 &&
      health.current / health.max <= def.fleeHealthFraction &&
      agent.state !== 'flee'
    ) {
      setState(ctx, entity, agent, 'flee');
    }

    const role: SquadRole = member?.role ?? 'assault';

    switch (agent.state) {
      case 'idle':
        updateIdle(ctx, entity, agent, squad);
        break;
      case 'patrol':
        updatePatrol(ctx, entity, agent, transform, def.moveSpeed * phase.speed);
        break;
      case 'investigate':
        updateInvestigate(ctx, entity, agent, transform, def.moveSpeed * phase.speed * 0.85);
        break;
      case 'chase':
        updateChase(ctx, entity, agent, transform, def, phase, role, squad);
        break;
      case 'attack':
        updateAttack(ctx, entity, agent, transform, def, phase, role, squad);
        break;
      case 'flee':
        updateFlee(ctx, entity, agent, transform, (def.moveSpeed + AI.fleeSpeedBonus) * phase.speed);
        break;
    }
  }
}

/**
 * Emit the boss banner and phase changes.
 *
 * The banner fires the moment the Warden actually notices the player, not when
 * it comes into view - being seen is the thing worth announcing.
 */
function announceBoss(
  ctx: SimContext,
  entity: EntityId,
  agent: EnemyAgent,
  def: NonNullable<ReturnType<typeof findEnemy>>,
  health: { current: number; max: number },
  healthFraction: number,
): void {
  if (!agent.announced && agent.target !== null && ctx.world.players.has(agent.target)) {
    agent.announced = true;
    ctx.bus.emit('boss:engaged', {
      entity,
      name: def.name,
      health: health.current,
      maxHealth: health.max,
    });
  }

  const label = phaseLabelFor(def, healthFraction);
  if (label !== agent.phaseLabel) {
    agent.phaseLabel = label;
    if (agent.announced && label) ctx.bus.emit('boss:phaseChanged', { entity, label });
  }
}

function phaseLabelFor(
  def: NonNullable<ReturnType<typeof findEnemy>>,
  healthFraction: number,
): string {
  if (!def.phases) return '';
  for (const phase of def.phases) {
    if (healthFraction > phase.healthAbove) return phase.label;
  }
  return def.phases[def.phases.length - 1]?.label ?? '';
}

function setState(ctx: SimContext, entity: EntityId, agent: EnemyAgent, next: AiState): void {
  if (agent.state === next) return;
  const from = agent.state;
  agent.state = next;
  agent.stateTime = 0;
  ctx.bus.emit('ai:stateChanged', { entity, from, to: next });
}

/**
 * Which phase an archetype is in.
 *
 * Only bosses declare phases; everything else runs on neutral modifiers. Phases
 * are what make the Warden a fight with a shape rather than a health bar.
 */
function phaseFor(
  def: NonNullable<ReturnType<typeof findEnemy>>,
  healthFraction: number,
): PhaseModifiers {
  if (!def.phases || def.phases.length === 0) return NEUTRAL_PHASE;
  for (const phase of def.phases) {
    if (healthFraction > phase.healthAbove) {
      return { speed: phase.speedMult, cooldown: phase.cooldownMult, accuracy: phase.accuracyBonus };
    }
  }
  const last = def.phases[def.phases.length - 1];
  return last
    ? { speed: last.speedMult, cooldown: last.cooldownMult, accuracy: last.accuracyBonus }
    : NEUTRAL_PHASE;
}

// ─────────────────────────────────────────────────────────────────────────────
// States
// ─────────────────────────────────────────────────────────────────────────────

function updateIdle(
  ctx: SimContext,
  entity: EntityId,
  agent: EnemyAgent,
  squad: Squad | undefined,
): void {
  if (agent.target !== null) {
    setState(ctx, entity, agent, 'chase');
    return;
  }
  if (agent.timeSinceSeen < 2 || (squad && hasFreshIntel(ctx, squad) && squad.target !== null)) {
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

  const arrived = navigateTo(ctx, entity, transform, agent.destX, agent.destY, speed);
  if (arrived || agent.stateTime > 20) setState(ctx, entity, agent, 'idle');
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

  const arrived = navigateTo(ctx, entity, transform, agent.lastKnownX, agent.lastKnownY, speed);
  if (arrived || agent.stateTime > AI.investigateSeconds) {
    setState(ctx, entity, agent, 'idle');
  }
}

function updateChase(
  ctx: SimContext,
  entity: EntityId,
  agent: EnemyAgent,
  transform: Transform,
  def: NonNullable<ReturnType<typeof findEnemy>>,
  phase: PhaseModifiers,
  role: SquadRole,
  squad: Squad | undefined,
): void {
  const target = agent.target;
  if (target === null || !ctx.world.isAliveActor(target)) {
    agent.target = null;
    setState(ctx, entity, agent, 'investigate');
    return;
  }

  const targetTransform = ctx.world.transforms.get(target);
  if (!targetTransform) return;

  const dist = Math.hypot(targetTransform.x - transform.x, targetTransform.y - transform.y);
  const canSee = hasEyesOnTarget(ctx, entity);
  const engageRange = def.preferredRange * (role === 'suppress' ? AI.suppressRangeFactor : 1);

  if (canSee && dist <= engageRange) {
    setState(ctx, entity, agent, 'attack');
    return;
  }

  const speed = def.moveSpeed * def.chaseSpeedFactor * phase.speed;

  // A flanker does not run at the target - it swings wide and comes in from
  // the side, which is what stops the player from holding one firing line.
  if (role === 'flank' && squad) {
    const flank = flankPosition(squad, transform.x, transform.y, scratchFlank);
    navigateTo(ctx, entity, transform, flank.x, flank.y, speed);
  } else {
    const destX = canSee ? targetTransform.x : agent.lastKnownX;
    const destY = canSee ? targetTransform.y : agent.lastKnownY;
    navigateTo(ctx, entity, transform, destX, destY, speed);
  }

  if (!canSee && agent.stateTime > 10) {
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
  phase: PhaseModifiers,
  role: SquadRole,
  squad: Squad | undefined,
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
  const engageRange = def.preferredRange * (role === 'suppress' ? AI.suppressRangeFactor : 1);

  const canSee = hasEyesOnTarget(ctx, entity);
  if (!canSee) {
    // Target broke line of sight. Before chasing into the open, consider
    // solving the problem the way the player would: throw something.
    if (tryThrowGrenade(ctx, entity, agent, transform, def, dist)) return;
    setState(ctx, entity, agent, 'chase');
    return;
  }
  if (dist > engageRange * 1.35) {
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

  // Hold the preferred distance, then spread out from squad mates so a group
  // does not collapse into one target-shaped clump.
  const tooClose = dist < engageRange * 0.55;
  const tooFar = dist > engageRange;
  let moveX = 0;
  let moveY = 0;
  if (tooClose || tooFar) {
    const sign = tooClose ? -1 : 1;
    moveX = (dx / (dist || 1)) * sign;
    moveY = (dy / (dist || 1)) * sign;
  }
  applySeparation(ctx, entity, transform, squad, scratchDir);
  moveX += scratchDir.x;
  moveY += scratchDir.y;

  const length = Math.hypot(moveX, moveY);
  if (length > 0.05) {
    stepInDirection(ctx, entity, transform, moveX / length, moveY / length, def.moveSpeed * 0.6 * phase.speed);
  }

  const weapon = ctx.world.weapons.get(entity);
  if (!weapon) return;

  if (weapon.magazine <= 0) {
    tryReload(ctx, entity);
    return;
  }

  const accuracy = clamp(def.accuracy + phase.accuracy, 0.1, 1);

  if (agent.burstRemaining > 0) {
    const fired = tryFire(ctx, entity, Math.cos(transform.rotation), Math.sin(transform.rotation), accuracy);
    if (fired === 'fired') {
      agent.burstRemaining--;
      if (agent.burstRemaining <= 0) {
        agent.attackCooldown = def.attackCooldownSeconds * phase.cooldown;
      }
    }
    return;
  }

  if (agent.attackCooldown <= 0) {
    // Only start a burst once actually facing the target, so the first round of
    // a burst is not fired sideways.
    const aimError = Math.abs(angleDifference(transform.rotation, desired));
    if (aimError < 12 * DEG_TO_RAD) {
      // A suppressing member fires longer, looser bursts - the job is to keep
      // the target's head down while someone else moves.
      agent.burstRemaining = role === 'suppress' ? def.burstCount + 2 : def.burstCount;
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
// Grenades
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Throw at a target that has taken cover.
 *
 * This is the single change that most alters how a fight feels: hiding behind a
 * wall stops being a solution and becomes a timer. Enemies only reach for a
 * grenade once the target has actually been out of sight for a while, and never
 * so close that they would catch their own blast.
 */
function tryThrowGrenade(
  ctx: SimContext,
  entity: EntityId,
  agent: EnemyAgent,
  transform: Transform,
  def: NonNullable<ReturnType<typeof findEnemy>>,
  distance: number,
): boolean {
  if (!def.throwableItemId) return false;

  const member = ctx.world.squadMembers.get(entity);
  if (!member || member.throwCooldown > 0) return false;
  if (agent.timeSinceSeen < AI.grenadeAfterBlindSeconds) return false;
  if (distance < AI.grenadeMinRange || distance > AI.grenadeMaxRange) return false;

  const dx = agent.lastKnownX - transform.x;
  const dy = agent.lastKnownY - transform.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.1) return false;

  // Enemies do not carry an inventory, so grant the round for this throw.
  const carrier = ctx.world.carriers.get(entity);
  if (!carrier) {
    ctx.world.carriers.set(entity, {
      inventory: { slots: [{ itemId: def.throwableItemId, quantity: 1 }], capacityKg: 99 },
    });
  }

  const thrown = throwItem(ctx, entity, def.throwableItemId, dx / length, dy / length);
  member.throwCooldown = AI.grenadeCooldownSeconds;

  // Drop the temporary carrier again so reloading keeps using the AI path.
  if (!carrier) ctx.world.carriers.remove(entity);
  return thrown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Steering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Move towards a world position, returning true once close enough.
 *
 * Direct approach when the destination is in plain sight, flow field otherwise.
 * The hybrid matters: a pure field looks blocky in an open room, and pure
 * direct steering gets stuck at every concave corner. Together they read as an
 * enemy that knows the building.
 */
function navigateTo(
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

  let dirX = dx / dist;
  let dirY = dy / dist;

  if (!ctx.grid.hasLineOfSight(transform.x, transform.y, destX, destY)) {
    const field = ctx.navigation.fieldFor(destX, destY, ctx.tick);
    if (field?.directionAt(transform.x, transform.y, scratchDir)) {
      dirX = scratchDir.x;
      dirY = scratchDir.y;
    }
  }

  stepInDirection(ctx, entity, transform, dirX, dirY, speed);

  const desired = Math.atan2(dirY, dirX);
  transform.rotation = approachAngle(
    transform.rotation,
    desired,
    AI.turnRateDeg * DEG_TO_RAD * ctx.dt,
  );
  return false;
}

/** Push away from squad mates so a group keeps a usable spread. */
function applySeparation(
  ctx: SimContext,
  entity: EntityId,
  transform: Transform,
  squad: Squad | undefined,
  out: { x: number; y: number },
): void {
  out.x = 0;
  out.y = 0;
  if (!squad) return;

  const radius = AI.separationRadius;
  for (const other of squad.members) {
    if (other === entity) continue;
    const otherTransform = ctx.world.transforms.get(other);
    if (!otherTransform) continue;

    const dx = transform.x - otherTransform.x;
    const dy = transform.y - otherTransform.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > radius * radius || distSq < 1e-6) continue;

    const dist = Math.sqrt(distSq);
    const push = (1 - dist / radius) * AI.separationStrength;
    out.x += (dx / dist) * push;
    out.y += (dy / dist) * push;
  }
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

/** Doctrine of an enemy's faction. Exposed for the debug overlay. */
export function doctrineOf(ctx: SimContext, entity: EntityId): string {
  const faction = ctx.world.factions.get(entity);
  return faction ? getFaction(faction.id).doctrine : 'unknown';
}
