/**
 * Player movement, stamina, aiming, firing and item use.
 *
 * Reads only `ctx.intent` - never an input device (ADR-002).
 */

import { COMBAT, ENCUMBRANCE, PLAYER } from '@/content/balance';
import { findItem } from '@/content/items';
import { approachAngle, clamp, clamp01, DEG_TO_RAD, remap } from '@/core/math/scalar';
import { applyHealing } from '@/game/combat/damage';
import { loadFraction, removeItem } from '@/game/inventory/inventory';
import { createLootDrop } from '@/game/simulation/factories';
import { moveCircle } from '@/game/simulation/collision';
import { emitNoise, type SimContext } from '@/game/simulation/simContext';
import { clearOneShots } from '@/game/player/playerIntent';
import { tryFire, tryReload } from '@/game/weapons/firing';

/** Degrees per second the player character turns towards the aim direction. */
const TURN_RATE_DEG = 900;

export function playerSystem(ctx: SimContext): void {
  const { world, intent, dt } = ctx;
  const entity = world.playerEntity;
  if (entity === null || !world.isAliveActor(entity)) return;

  const transform = world.transforms.require(entity);
  const velocity = world.velocities.require(entity);
  const collider = world.colliders.require(entity);
  const stamina = world.staminas.require(entity);
  const carrier = world.carriers.require(entity);

  const busy = world.usingItems.has(entity);

  // ── Encumbrance ──────────────────────────────────────────────────────────
  const load = loadFraction(carrier.inventory);
  const speedFactor = encumbranceSpeedFactor(load);

  // ── Movement ─────────────────────────────────────────────────────────────
  let moveX = intent.moveX;
  let moveY = intent.moveY;
  const moveLen = Math.hypot(moveX, moveY);
  if (moveLen > 1) {
    moveX /= moveLen;
    moveY /= moveLen;
  }
  const throttle = Math.min(1, moveLen);

  const wantsSprint = intent.sprint && !busy && throttle > 0.6 && stamina.current > 1;
  const sprintFactor = wantsSprint ? PLAYER.sprintMultiplier : 1;
  const targetSpeed = PLAYER.baseSpeed * speedFactor * sprintFactor * throttle;

  const targetVx = moveX * targetSpeed;
  const targetVy = moveY * targetSpeed;

  // Accelerate towards the target velocity, brake with friction when idle.
  const rate = throttle > 0 ? PLAYER.acceleration : PLAYER.friction;
  velocity.x = approachValue(velocity.x, targetVx, rate * dt);
  velocity.y = approachValue(velocity.y, targetVy, rate * dt);

  const moved = moveCircle(
    ctx.grid,
    transform.x,
    transform.y,
    collider.radius,
    velocity.x * dt,
    velocity.y * dt,
  );
  transform.x = moved.x;
  transform.y = moved.y;
  if (moved.hitWall) {
    // Bleed off velocity into the wall so the player does not "stick" while
    // holding a direction against it.
    velocity.x *= 0.4;
    velocity.y *= 0.4;
  }

  // ── Stamina ──────────────────────────────────────────────────────────────
  updateStamina(ctx, stamina, wantsSprint, load, dt);

  // ── Footstep noise ───────────────────────────────────────────────────────
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed > 0.6) {
    const radius = wantsSprint ? PLAYER.footstepNoiseSprint : PLAYER.footstepNoiseWalk;
    // One noise pulse roughly every 0.35 s of movement, tied to the tick count
    // so it stays deterministic.
    if (ctx.tick % 21 === 0) {
      emitNoise(ctx, entity, 'player', transform.x, transform.y, radius);
    }
  }

  // ── Aiming ───────────────────────────────────────────────────────────────
  let aimAngle = transform.rotation;
  const aimLen = Math.hypot(intent.aimX, intent.aimY);
  if (aimLen > 0.001) {
    aimAngle = Math.atan2(intent.aimY, intent.aimX);
    aimAngle = applyAimAssist(ctx, transform.x, transform.y, aimAngle);
  } else if (speed > 0.3) {
    aimAngle = Math.atan2(velocity.y, velocity.x);
  }
  transform.rotation = approachAngle(transform.rotation, aimAngle, TURN_RATE_DEG * DEG_TO_RAD * dt);

  // ── Item use ─────────────────────────────────────────────────────────────
  handleItemUse(ctx);

  // ── Drop request ─────────────────────────────────────────────────────────
  if (intent.dropItemId) {
    const dropped = removeItem(carrier.inventory, intent.dropItemId, intent.dropQuantity);
    if (dropped > 0) {
      createLootDrop(world, intent.dropItemId, dropped, transform.x, transform.y, ctx.tick);
      ctx.bus.emit('loot:dropped', {
        itemId: intent.dropItemId,
        quantity: dropped,
        x: transform.x,
        y: transform.y,
      });
      ctx.bus.emit('player:weightChanged', {
        weight: loadFraction(carrier.inventory) * carrier.inventory.capacityKg,
        capacity: carrier.inventory.capacityKg,
      });
    }
  }

  // ── Weapon ───────────────────────────────────────────────────────────────
  if (!busy) {
    const weapon = world.weapons.get(entity);
    if (intent.reload) tryReload(ctx, entity);

    if (intent.fire && weapon) {
      if (weapon.magazine <= 0 && weapon.reloadRemaining <= 0) {
        // Auto-reload on an empty magazine: on touch, expecting the player to
        // find a reload button mid-fight is a design failure (Pillar P4).
        tryReload(ctx, entity);
      } else {
        tryFire(ctx, entity, Math.cos(transform.rotation), Math.sin(transform.rotation), 1);
      }
    }
  }

  clearOneShots(intent);
}

function approachValue(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return target;
}

/** Speed multiplier from carried weight. Smooth, never a hard wall. */
export function encumbranceSpeedFactor(load: number): number {
  if (load <= ENCUMBRANCE.freeFraction) return 1;
  if (load <= 1) {
    return remap(load, ENCUMBRANCE.freeFraction, 1, 1, ENCUMBRANCE.speedAtFull);
  }
  return remap(load, 1, 1.35, ENCUMBRANCE.speedAtFull, ENCUMBRANCE.speedAtOverload);
}

function updateStamina(
  ctx: SimContext,
  stamina: { current: number; max: number; regenDelay: number },
  sprinting: boolean,
  load: number,
  dt: number,
): void {
  const before = stamina.current;

  if (sprinting) {
    stamina.current -= PLAYER.sprintStaminaPerSecond * dt;
    stamina.regenDelay = PLAYER.staminaRegenDelaySeconds;
  } else {
    if (load > ENCUMBRANCE.freeFraction) {
      const overload = clamp01(
        (load - ENCUMBRANCE.freeFraction) / (1 - ENCUMBRANCE.freeFraction),
      );
      stamina.current -= ENCUMBRANCE.staminaDrainAtFull * overload * dt * 0.35;
    }
    if (stamina.regenDelay > 0) stamina.regenDelay = Math.max(0, stamina.regenDelay - dt);
    else stamina.current += PLAYER.staminaRegenPerSecond * dt;
  }

  stamina.current = clamp(stamina.current, 0, stamina.max);
  if (Math.abs(stamina.current - before) > 0.001) {
    ctx.bus.emit('player:staminaChanged', { current: stamina.current, max: stamina.max });
  }
}

/**
 * Nudge the aim direction towards the nearest valid target.
 *
 * Essential on touch, and deliberately conservative: it corrects at most
 * `aimAssistMaxDeg` and never fires on the player's behalf (docs/08-UI-UX.md).
 */
function applyAimAssist(ctx: SimContext, x: number, y: number, aimAngle: number): number {
  const maxDelta = COMBAT.aimAssistMaxDeg * DEG_TO_RAD;
  const coneHalf = COMBAT.aimAssistConeDeg * 0.5 * DEG_TO_RAD;
  const maxRangeSq = COMBAT.aimAssistMaxRange ** 2;

  let bestAngle = 0;
  let bestScore = Infinity;
  let found = false;

  for (const [entity, transform] of ctx.world.transforms.entries()) {
    if (!ctx.world.agents.has(entity)) continue;
    const health = ctx.world.healths.get(entity);
    if (!health || health.current <= 0) continue;

    const dx = transform.x - x;
    const dy = transform.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq > maxRangeSq || distSq < 1e-6) continue;

    const angleToTarget = Math.atan2(dy, dx);
    let delta = angleToTarget - aimAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    if (Math.abs(delta) > coneHalf) continue;

    if (!ctx.grid.hasLineOfSight(x, y, transform.x, transform.y)) continue;

    // Prefer targets that are both close to the crosshair and close in space.
    const score = Math.abs(delta) * 4 + Math.sqrt(distSq) * 0.05;
    if (score < bestScore) {
      bestScore = score;
      bestAngle = angleToTarget;
      found = true;
    }
  }

  if (!found) return aimAngle;

  let delta = bestAngle - aimAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return aimAngle + clamp(delta, -maxDelta, maxDelta);
}

function handleItemUse(ctx: SimContext): void {
  const { world, intent, dt } = ctx;
  const entity = world.playerEntity;
  if (entity === null) return;

  const inProgress = world.usingItems.get(entity);
  if (inProgress) {
    inProgress.remaining -= dt;
    if (inProgress.remaining <= 0) {
      finishItemUse(ctx);
    }
    return;
  }

  if (!intent.useItemId) return;

  const carrier = world.carriers.require(entity);
  const def = findItem(intent.useItemId);
  if (!def?.consumable) return;
  if (countOf(carrier, intent.useItemId) <= 0) return;

  world.usingItems.set(entity, {
    itemId: intent.useItemId,
    remaining: def.consumable.useSeconds,
    total: def.consumable.useSeconds,
  });
}

function countOf(carrier: { inventory: { slots: Array<{ itemId: string; quantity: number }> } }, itemId: string): number {
  let total = 0;
  for (const slot of carrier.inventory.slots) {
    if (slot.itemId === itemId) total += slot.quantity;
  }
  return total;
}

function finishItemUse(ctx: SimContext): void {
  const { world } = ctx;
  const entity = world.playerEntity;
  if (entity === null) return;

  const using = world.usingItems.get(entity);
  if (!using) return;
  world.usingItems.remove(entity);

  const carrier = world.carriers.require(entity);
  if (removeItem(carrier.inventory, using.itemId, 1) <= 0) return;

  const def = findItem(using.itemId);
  const effect = def?.consumable;
  if (effect?.health) applyHealing(ctx, entity, effect.health);
  if (effect?.stamina) {
    const stamina = world.staminas.require(entity);
    stamina.current = clamp(stamina.current + effect.stamina, 0, stamina.max);
    stamina.regenDelay = 0;
    ctx.bus.emit('player:staminaChanged', { current: stamina.current, max: stamina.max });
  }

  ctx.bus.emit('item:used', { entity, itemId: using.itemId });
  ctx.bus.emit('player:weightChanged', {
    weight: loadFraction(carrier.inventory) * carrier.inventory.capacityKg,
    capacity: carrier.inventory.capacityKg,
  });
}
