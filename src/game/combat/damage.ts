/**
 * Damage application.
 *
 * One entry point, so armor, the grace period, death handling and the event
 * contract can never diverge between "shot by a player" and "shot by an AI".
 */

import { COMBAT } from '@/content/balance';
import { findEnemy } from '@/content/enemies';
import { findItem } from '@/content/items';
import type { EntityId } from '@/core/ecs/entity';
import { clamp } from '@/core/math/scalar';
import type { SimContext } from '@/game/simulation/simContext';

export interface DamageResult {
  applied: number;
  absorbed: number;
  killed: boolean;
}

const result: DamageResult = { applied: 0, absorbed: 0, killed: false };

export function applyDamage(
  ctx: SimContext,
  target: EntityId,
  source: EntityId,
  rawAmount: number,
  hitX: number,
  hitY: number,
  wasUnaware = false,
): DamageResult {
  const { world } = ctx;
  result.applied = 0;
  result.absorbed = 0;
  result.killed = false;

  const health = world.healths.get(target);
  if (!health || health.current <= 0) return result;

  // A shotgun lands seven pellets in the same tick. All of them hurt, but the
  // feedback burst fires only once - otherwise the screen turns into a strobe.
  const graceTicks = COMBAT.damageGraceSeconds / ctx.dt;
  const withinGrace = ctx.tick - health.lastDamageTick < graceTicks;

  let amount = rawAmount;
  if (wasUnaware) amount *= COMBAT.unawareDamageMultiplier;

  const reduction = armorReductionOf(ctx, target);
  const afterArmor = Math.max(amount * COMBAT.minDamageAfterArmor, amount * (1 - reduction));
  const absorbed = amount - afterArmor;

  consumeArmorDurability(ctx, target);

  const dealt = Math.min(afterArmor, health.current);
  health.current = clamp(health.current - afterArmor, 0, health.max);
  health.lastDamageTick = ctx.tick;
  health.lastAttacker = source;

  world.hitFlashes.set(target, { remaining: 0.12 });

  result.applied = dealt;
  result.absorbed = absorbed;
  result.killed = health.current <= 0;

  const isPlayerTarget = world.players.has(target);
  ctx.bus.emit('damage:dealt', {
    target,
    source,
    amount: dealt,
    absorbed,
    x: hitX,
    y: hitY,
    isPlayerTarget,
    wasUnaware,
  });

  if (isPlayerTarget) {
    ctx.bus.emit('player:healthChanged', { current: health.current, max: health.max });
    if (!withinGrace) ctx.bus.emit('camera:shake', { intensity: clamp(dealt / 40, 0.15, 1) });
  }

  return result;
}

function armorReductionOf(ctx: SimContext, entity: EntityId): number {
  const equipment = ctx.world.equipments.get(entity);
  if (equipment) {
    if (!equipment.armorItemId || equipment.armorDurability <= 0) return 0;
    const def = findItem(equipment.armorItemId);
    return def?.armor?.reduction ?? 0;
  }

  const agent = ctx.world.agents.get(entity);
  if (agent) return findEnemy(agent.enemyId)?.armorReduction ?? 0;

  return 0;
}

function consumeArmorDurability(ctx: SimContext, entity: EntityId): void {
  const equipment = ctx.world.equipments.get(entity);
  if (!equipment || !equipment.armorItemId) return;
  equipment.armorDurability = Math.max(0, equipment.armorDurability - COMBAT.armorDurabilityPerHit);
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
