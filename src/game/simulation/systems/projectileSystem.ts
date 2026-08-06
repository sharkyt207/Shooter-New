/**
 * Projectile movement, collision and damage.
 *
 * Projectiles are stepped in small substeps so a fast round can never tunnel
 * through a wall or an actor between two ticks - at 132 m/s a single 16 ms step
 * would otherwise cover 2.2 metres in one jump.
 */

import { COMBAT } from '@/content/balance';
import type { EntityId } from '@/core/ecs/entity';
import { remap } from '@/core/math/scalar';
import { resolveHit } from '@/game/combat/ballistics';
import { applyDamage, isUnaware } from '@/game/combat/damage';
import { CELL_WALL } from '@/game/map/mapGrid';
import type { SimContext } from '@/game/simulation/simContext';

/** Maximum distance a projectile may advance in one collision substep. */
const MAX_SUBSTEP_METRES = 0.35;

const scratchIds: EntityId[] = [];

export function projectileSystem(ctx: SimContext): void {
  const { world, dt } = ctx;
  if (world.projectiles.size === 0) return;

  world.projectiles.keyArray(scratchIds);

  for (const entity of scratchIds) {
    const projectile = world.projectiles.get(entity);
    const transform = world.transforms.get(entity);
    if (!projectile || !transform) continue;

    projectile.lifetime -= dt;
    if (projectile.lifetime <= 0) {
      world.destroyEntity(entity);
      continue;
    }

    const distance = projectile.speed * dt;
    const steps = Math.max(1, Math.ceil(distance / MAX_SUBSTEP_METRES));
    const stepDistance = distance / steps;

    let consumed = false;
    for (let i = 0; i < steps && !consumed; i++) {
      transform.x += projectile.dirX * stepDistance;
      transform.y += projectile.dirY * stepDistance;
      projectile.travelled += stepDistance;

      if (projectile.travelled >= projectile.maxRange) {
        world.destroyEntity(entity);
        consumed = true;
        break;
      }

      // Walls first: a round that clips a corner should not reach the actor
      // standing behind it.
      if (ctx.grid.get(ctx.grid.worldToCellX(transform.x), ctx.grid.worldToCellY(transform.y)) === CELL_WALL) {
        ctx.bus.emit('projectile:impact', { x: transform.x, y: transform.y, surface: 'wall' });
        world.destroyEntity(entity);
        consumed = true;
        break;
      }

      const hit = findActorHit(ctx, entity, transform.x, transform.y);
      if (hit !== null) {
        resolveActorHit(ctx, entity, hit, transform.x, transform.y);
        consumed = true;
        break;
      }
    }
  }
}

/**
 * Which actor does this projectile overlap right now?
 *
 * Brute force over actors is correct here: the simulation caps out around 40
 * living actors, so a spatial index would cost more to maintain than it saves.
 */
function findActorHit(
  ctx: SimContext,
  projectileEntity: EntityId,
  x: number,
  y: number,
): EntityId | null {
  const projectile = ctx.world.projectiles.require(projectileEntity);

  for (const [entity, collider] of ctx.world.colliders.entries()) {
    if (entity === projectile.owner || collider.isStatic) continue;

    const health = ctx.world.healths.get(entity);
    if (!health || health.current <= 0) continue;

    const faction = ctx.world.factions.get(entity);
    // No friendly fire: enemy factions shooting each other is an M3 feature,
    // not an accident of collision order.
    if (faction && faction.id === projectile.ownerFaction) continue;

    const transform = ctx.world.transforms.get(entity);
    if (!transform) continue;

    const dx = transform.x - x;
    const dy = transform.y - y;
    const radius = collider.radius + COMBAT.projectileRadius;
    if (dx * dx + dy * dy <= radius * radius) return entity;
  }

  return null;
}

function resolveActorHit(
  ctx: SimContext,
  projectileEntity: EntityId,
  target: EntityId,
  x: number,
  y: number,
): void {
  const projectile = ctx.world.projectiles.require(projectileEntity);

  // Range falloff: full damage inside the effective range, tapering to
  // `minDamageFactor` at maximum range. This is what makes the shotgun a
  // close-range answer and the marksman rifle a long-range one.
  let factor = 1;
  if (projectile.travelled > projectile.effectiveRange) {
    factor = remap(
      projectile.travelled,
      projectile.effectiveRange,
      projectile.maxRange,
      1,
      projectile.minDamageFactor,
    );
  }

  const wasUnaware = isUnaware(ctx, target);

  // M2: where it lands, what is loaded and what the target wears all matter.
  const ballistic = resolveHit(ctx, target, {
    baseDamage: projectile.damage * factor,
    penetration: projectile.penetration,
    fragmentation: projectile.fragmentation,
    fragmentationBonus: projectile.fragmentationBonus,
    zoneBias: projectile.zoneBias,
    targetUnaware: wasUnaware,
  });

  applyDamage(ctx, target, projectile.owner, ballistic.damage, x, y, {
    zone: ballistic.zone,
    absorbed: ballistic.absorbed,
    penetrated: ballistic.penetrated,
    fragmented: ballistic.fragmented,
    wasUnaware,
  });

  ctx.bus.emit('projectile:impact', { x, y, surface: 'actor' });
  ctx.world.destroyEntity(projectileEntity);
}
