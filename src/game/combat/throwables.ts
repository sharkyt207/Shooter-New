/**
 * Throwables: flight, detonation and effects.
 *
 * A thrown object travels a fixed distance (or until it meets a wall), then
 * counts down its fuse and resolves. Keeping flight and fuse independent means
 * a grenade that lands early still cooks off on schedule - which is what makes
 * cooking one a real option later.
 */

import { THROWABLE } from '@/content/balance';
import { findThrowable, throwableForItem } from '@/content/throwables';
import type { ThrowableDef } from '@/content/types';
import type { EntityId } from '@/core/ecs/entity';
import { clamp01 } from '@/core/math/scalar';
import { removeItem } from '@/game/inventory/inventory';
import { emitNoise, type SimContext } from '@/game/simulation/simContext';
import { applyDamage } from './damage';

/**
 * Throw an item.
 * Returns false when the entity is not carrying that throwable.
 */
export function throwItem(
  ctx: SimContext,
  entity: EntityId,
  itemId: string,
  dirX: number,
  dirY: number,
): boolean {
  const def = throwableForItem(itemId);
  if (!def) return false;

  const carrier = ctx.world.carriers.get(entity);
  const transform = ctx.world.transforms.get(entity);
  const faction = ctx.world.factions.get(entity);
  if (!carrier || !transform || !faction) return false;
  if (removeItem(carrier.inventory, itemId, 1) <= 0) return false;

  const length = Math.hypot(dirX, dirY);
  const dx = length > 0.001 ? dirX / length : Math.cos(transform.rotation);
  const dy = length > 0.001 ? dirY / length : Math.sin(transform.rotation);

  const projectile = ctx.world.createEntity();
  ctx.world.transforms.set(projectile, {
    x: transform.x,
    y: transform.y,
    rotation: Math.atan2(dy, dx),
    prevX: transform.x,
    prevY: transform.y,
    prevRotation: 0,
  });
  ctx.world.thrown.set(projectile, {
    throwableId: def.id,
    owner: entity,
    ownerFaction: faction.id,
    dirX: dx,
    dirY: dy,
    speed: def.throwSpeed,
    remainingDistance: Math.max(THROWABLE.minRange, def.throwRange),
    fuse: def.fuseSeconds,
  });
  ctx.world.renderables.set(projectile, { assetKey: def.visual, height: 0.5, tint: 0xffffff });

  ctx.bus.emit('throwable:thrown', {
    entity,
    throwableId: def.id,
    x: transform.x,
    y: transform.y,
  });
  return true;
}

const scratchIds: EntityId[] = [];

export function throwableSystem(ctx: SimContext): void {
  const { world, dt } = ctx;
  if (world.thrown.size === 0 && world.disoriented.size === 0) return;

  // Disorientation ticks down first, so a flashbang that lands this tick is not
  // immediately cleared by the same pass.
  world.disoriented.keyArray(scratchIds);
  for (const entity of scratchIds) {
    const state = world.disoriented.get(entity);
    if (!state) continue;
    state.remaining -= dt;
    if (state.remaining <= 0) world.disoriented.remove(entity);
  }

  world.thrown.keyArray(scratchIds);
  for (const entity of scratchIds) {
    const thrown = world.thrown.get(entity);
    const transform = world.transforms.get(entity);
    if (!thrown || !transform) continue;

    if (thrown.remainingDistance > 0) {
      const step = Math.min(thrown.speed * dt, thrown.remainingDistance);
      const nextX = transform.x + thrown.dirX * step;
      const nextY = transform.y + thrown.dirY * step;

      if (ctx.grid.isWallAtWorld(nextX, nextY)) {
        // Bounce off the wall by stopping short - a grenade that vanishes into
        // geometry is the classic frustrating bug in this genre.
        thrown.remainingDistance = 0;
      } else {
        transform.x = nextX;
        transform.y = nextY;
        thrown.remainingDistance -= step;
      }
    }

    thrown.fuse -= dt;
    if (thrown.fuse <= 0) {
      const def = findThrowable(thrown.throwableId);
      if (def) detonate(ctx, def, thrown.owner, transform.x, transform.y);
      world.destroyEntity(entity);
    }
  }
}

function detonate(
  ctx: SimContext,
  def: ThrowableDef,
  owner: EntityId,
  x: number,
  y: number,
): void {
  ctx.bus.emit('throwable:detonated', {
    throwableId: def.id,
    kind: def.kind,
    x,
    y,
    radius: def.radius,
  });

  // Every throwable makes noise. That is a cost for the frag and a flash, and
  // the entire point of the lure.
  const faction = ctx.world.factions.get(owner);
  emitNoise(ctx, owner, faction?.id ?? 'player', x, y, def.noiseRadius);

  if (def.kind === 'lure') return;

  const radiusSq = def.radius * def.radius;
  for (const [entity, transform] of ctx.world.transforms.entries()) {
    const health = ctx.world.healths.get(entity);
    if (!health || health.current <= 0) continue;

    const dx = transform.x - x;
    const dy = transform.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq > radiusSq) continue;

    // Line of sight gates the blast: a wall between you and a grenade should
    // save you, exactly as the player expects.
    if (!ctx.grid.hasLineOfSight(x, y, transform.x, transform.y)) continue;

    const falloff = 1 - clamp01(Math.sqrt(distSq) / def.radius);

    if (def.kind === 'frag' && def.damage > 0) {
      // Area damage ignores hit zones - "the grenade hit your left arm" is not
      // a distinction worth modelling.
      applyDamage(ctx, entity, owner, def.damage * falloff * falloff, transform.x, transform.y, {
        zone: null,
        cause: 'explosion',
      });
    }

    if (def.kind === 'flash' && def.disorientSeconds > 0) {
      const seconds = def.disorientSeconds * falloff;
      if (seconds <= 0.2) continue;
      const existing = ctx.world.disoriented.get(entity);
      // A second flash extends rather than replaces, so stacking them works.
      ctx.world.disoriented.set(entity, {
        remaining: Math.max(existing?.remaining ?? 0, seconds),
      });
    }
  }
}
