/**
 * Damage application.
 *
 * One entry point, so armour, the grace period, death handling and the event
 * contract can never diverge between "shot by a player" and "shot by an AI".
 *
 * Since M2 the ballistic resolution (hit zone, penetration, fragmentation) lives
 * in `ballistics.ts`. This module takes an already-resolved amount and applies
 * it - which keeps area damage from grenades and anomalies on the same path
 * without pretending they hit a body part.
 */

import { COMBAT } from '@/content/balance';
import type { HitZone } from '@/content/types';
import type { EntityId } from '@/core/ecs/entity';
import { clamp } from '@/core/math/scalar';
import type { SimContext } from '@/game/simulation/simContext';

export interface DamageResult {
  applied: number;
  absorbed: number;
  killed: boolean;
}

export interface DamageOptions {
  /** Body part that was hit. Null for area damage. */
  zone?: HitZone | null;
  /** Damage the target's armour absorbed before this call. */
  absorbed?: number;
  penetrated?: boolean;
  fragmented?: boolean;
  wasUnaware?: boolean;
  /** Skip the unaware multiplier - callers that already applied it. */
  skipUnawareBonus?: boolean;
}

const result: DamageResult = { applied: 0, absorbed: 0, killed: false };

export function applyDamage(
  ctx: SimContext,
  target: EntityId,
  source: EntityId,
  rawAmount: number,
  hitX: number,
  hitY: number,
  options: DamageOptions = {},
): DamageResult {
  const { world } = ctx;
  result.applied = 0;
  result.absorbed = options.absorbed ?? 0;
  result.killed = false;

  const health = world.healths.get(target);
  if (!health || health.current <= 0) return result;

  // A shotgun lands seven pellets in the same tick. All of them hurt, but the
  // feedback burst fires only once - otherwise the screen turns into a strobe.
  const graceTicks = COMBAT.damageGraceSeconds / ctx.dt;
  const withinGrace = ctx.tick - health.lastDamageTick < graceTicks;

  const wasUnaware = options.wasUnaware ?? false;
  let amount = rawAmount;
  if (wasUnaware && !options.skipUnawareBonus) amount *= COMBAT.unawareDamageMultiplier;

  const dealt = Math.min(amount, health.current);
  health.current = clamp(health.current - amount, 0, health.max);
  health.lastDamageTick = ctx.tick;
  health.lastAttacker = source;

  world.hitFlashes.set(target, { remaining: 0.12 });

  result.applied = dealt;
  result.killed = health.current <= 0;

  const isPlayerTarget = world.players.has(target);
  ctx.bus.emit('damage:dealt', {
    target,
    source,
    amount: dealt,
    absorbed: result.absorbed,
    x: hitX,
    y: hitY,
    isPlayerTarget,
    wasUnaware,
    zone: options.zone ?? null,
    penetrated: options.penetrated ?? true,
    fragmented: options.fragmented ?? false,
  });

  if (isPlayerTarget) {
    ctx.bus.emit('player:healthChanged', { current: health.current, max: health.max });
    if (!withinGrace) ctx.bus.emit('camera:shake', { intensity: clamp(dealt / 40, 0.15, 1) });
  }

  return result;
}

/** Heal an entity, clamped to its maximum. Returns how much was actually restored. */
export function applyHealing(ctx: SimContext, entity: EntityId, amount: number): number {
  const health = ctx.world.healths.get(entity);
  if (!health || health.current <= 0) return 0;

  const before = health.current;
  health.current = clamp(health.current + amount, 0, health.max);
  const restored = health.current - before;

  if (restored > 0 && ctx.world.players.has(entity)) {
    ctx.bus.emit('player:healthChanged', { current: health.current, max: health.max });
  }
  return restored;
}

/** Has this entity not noticed anyone yet? Drives the ambush bonus. */
export function isUnaware(ctx: SimContext, entity: EntityId): boolean {
  if (ctx.world.disoriented.has(entity)) return true;
  const agent = ctx.world.agents.get(entity);
  if (!agent) return false;
  return agent.state === 'idle' || agent.state === 'patrol';
}
