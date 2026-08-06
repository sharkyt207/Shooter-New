/**
 * Melee.
 *
 * Deliberately not a combat option - it is the *stealth* option. Against an
 * alerted enemy a knife is a bad idea; against one that has not noticed you it
 * removes them for free and, crucially, almost silently.
 *
 * That asymmetry is what gives the player a reason to move carefully rather
 * than simply shooting everything (Pillar P3).
 */

import { MELEE } from '@/content/balance';
import type { EntityId } from '@/core/ecs/entity';
import { DEG_TO_RAD } from '@/core/math/scalar';
import { isInCone } from '@/core/math/shapes';
import { emitNoise, type SimContext } from '@/game/simulation/simContext';
import { applyDamage, isUnaware } from './damage';

const scratchPoint = { x: 0, y: 0 };

/**
 * Swing at whatever is in front of the entity.
 * Returns true when the swing happened, whether or not it connected.
 */
export function meleeAttack(ctx: SimContext, entity: EntityId): boolean {
  const transform = ctx.world.transforms.get(entity);
  const faction = ctx.world.factions.get(entity);
  if (!transform || !faction) return false;
  if (ctx.world.usingItems.has(entity)) return false;

  ctx.bus.emit('melee:swing', {
    entity,
    x: transform.x,
    y: transform.y,
    rotation: transform.rotation,
  });

  const target = findTargetInArc(ctx, entity, faction.id, transform.x, transform.y, transform.rotation);
  if (target === null) {
    // A miss still makes a little noise - swinging at air is not free.
    emitNoise(ctx, entity, faction.id, transform.x, transform.y, MELEE.noiseRadius);
    return true;
  }

  const unaware = isUnaware(ctx, target);
  const damage = MELEE.damage * (unaware ? MELEE.unawareMultiplier : 1);

  // Melee bypasses hit zones and armour class: this is a blade at the seam of
  // whatever they are wearing, not a projectile trying to defeat a plate.
  applyDamage(ctx, entity === target ? entity : target, entity, damage, transform.x, transform.y, {
    zone: null,
    wasUnaware: unaware,
    // The ambush bonus is already in `damage`; applying it twice would make a
    // knife strictly better than any weapon in the game.
    skipUnawareBonus: true,
  });

  ctx.bus.emit('melee:hit', { entity, target, silent: unaware });
  emitNoise(ctx, entity, faction.id, transform.x, transform.y, MELEE.noiseRadius);
  return true;
}

function findTargetInArc(
  ctx: SimContext,
  attacker: EntityId,
  attackerFaction: string,
  x: number,
  y: number,
  facing: number,
): EntityId | null {
  const halfAngle = MELEE.arcDeg * DEG_TO_RAD;
  let best: EntityId | null = null;
  let bestDistSq = Infinity;

  for (const [entity, transform] of ctx.world.transforms.entries()) {
    if (entity === attacker) continue;

    const health = ctx.world.healths.get(entity);
    if (!health || health.current <= 0) continue;

    const faction = ctx.world.factions.get(entity);
    if (!faction || faction.id === attackerFaction) continue;

    scratchPoint.x = transform.x;
    scratchPoint.y = transform.y;
    const collider = ctx.world.colliders.get(entity);
    const reach = MELEE.range + (collider?.radius ?? 0);
    if (!isInCone(x, y, facing, halfAngle, reach, scratchPoint)) continue;

    const dx = transform.x - x;
    const dy = transform.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = entity;
    }
  }

  return best;
}
