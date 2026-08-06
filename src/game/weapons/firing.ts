/**
 * Weapon firing and reloading.
 *
 * Players and AI share this code path entirely. The only difference between a
 * player pulling a trigger and a scavenger doing the same is the `accuracy`
 * argument and where the ammunition comes from - everything else is data
 * (see docs/04-MODULES.md, `game/weapons`).
 */

import { COMBAT } from '@/content/balance';
import { DEG_TO_RAD, clamp } from '@/core/math/scalar';
import type { EntityId } from '@/core/ecs/entity';
import { findWeapon, shotIntervalSeconds } from '@/content/weapons';
import { countItem, removeItem } from '@/game/inventory/inventory';
import { createProjectile } from '@/game/simulation/factories';
import { emitNoise, type SimContext } from '@/game/simulation/simContext';

/** Metres in front of the muzzle where projectiles spawn. */
const MUZZLE_OFFSET = 0.55;

export type FireResult = 'fired' | 'cooldown' | 'reloading' | 'empty' | 'noWeapon' | 'busy';

export function canFire(ctx: SimContext, entity: EntityId): FireResult {
  const weapon = ctx.world.weapons.get(entity);
  if (!weapon) return 'noWeapon';
  if (ctx.world.usingItems.has(entity)) return 'busy';
  if (weapon.reloadRemaining > 0) return 'reloading';
  if (weapon.cooldown > 0) return 'cooldown';
  if (weapon.magazine <= 0) return 'empty';
  return 'fired';
}

/**
 * Fire one shot in the given direction.
 *
 * @param accuracy 1 = the weapon's own spread, lower values widen the cone.
 *                 Enemy archetypes use this to feel distinct without needing
 *                 their own weapon entries.
 */
export function tryFire(
  ctx: SimContext,
  entity: EntityId,
  dirX: number,
  dirY: number,
  accuracy = 1,
): FireResult {
  const state = canFire(ctx, entity);
  if (state !== 'fired') {
    if (state === 'empty') {
      const weapon = ctx.world.weapons.require(entity);
      ctx.bus.emit('weapon:dryFire', { entity, weaponId: weapon.weaponId });
    }
    return state;
  }

  const weaponState = ctx.world.weapons.require(entity);
  const def = findWeapon(weaponState.weaponId);
  const transform = ctx.world.transforms.get(entity);
  const faction = ctx.world.factions.get(entity);
  if (!def || !transform || !faction) return 'noWeapon';

  const baseAngle = Math.atan2(dirY, dirX);
  const spreadDeg = clamp(
    (def.spreadDeg + weaponState.bloomDeg) / Math.max(0.15, accuracy),
    0,
    def.maxSpreadDeg / Math.max(0.15, accuracy),
  );

  const muzzleX = transform.x + Math.cos(baseAngle) * MUZZLE_OFFSET;
  const muzzleY = transform.y + Math.sin(baseAngle) * MUZZLE_OFFSET;

  for (let pellet = 0; pellet < def.pellets; pellet++) {
    // Gaussian rather than uniform: shots cluster around the crosshair, which
    // reads as "the weapon is accurate but not perfect" instead of "random".
    const offset = ctx.rng.combat.gaussian(0, spreadDeg * 0.5) * DEG_TO_RAD;
    const angle = baseAngle + offset;
    createProjectile(
      ctx.world,
      entity,
      faction.id,
      muzzleX,
      muzzleY,
      Math.cos(angle),
      Math.sin(angle),
      def.id,
      def.damage,
    );
  }

  weaponState.magazine--;
  weaponState.cooldown = shotIntervalSeconds(def);
  weaponState.bloomDeg = Math.min(def.maxSpreadDeg, weaponState.bloomDeg + def.spreadPerShotDeg);

  ctx.bus.emit('weapon:fired', {
    entity,
    weaponId: def.id,
    x: muzzleX,
    y: muzzleY,
    rotation: baseAngle,
    noiseRadius: def.noiseRadius,
  });
  emitNoise(ctx, entity, faction.id, transform.x, transform.y, def.noiseRadius);

  return 'fired';
}

/**
 * Begin a reload.
 * Returns false when it is pointless (already full, already reloading, or the
 * entity carries no matching ammunition).
 */
export function tryReload(ctx: SimContext, entity: EntityId): boolean {
  const weaponState = ctx.world.weapons.get(entity);
  if (!weaponState || weaponState.reloadRemaining > 0) return false;
  if (ctx.world.usingItems.has(entity)) return false;

  const def = findWeapon(weaponState.weaponId);
  if (!def || weaponState.magazine >= def.magazineSize) return false;

  const carrier = ctx.world.carriers.get(entity);
  if (carrier && countItem(carrier.inventory, def.ammoItemId) <= 0) return false;

  weaponState.reloadRemaining = def.reloadSeconds;
  ctx.bus.emit('weapon:reloadStarted', {
    entity,
    weaponId: def.id,
    seconds: def.reloadSeconds,
  });
  return true;
}

/**
 * Advance cooldowns, reloads and spread recovery for every armed entity.
 * Runs once per tick for all weapons, players and AI alike.
 */
export function updateWeapons(ctx: SimContext): void {
  const { dt } = ctx;
  const bloomDecay = COMBAT.bloomDecayDegPerSecond * dt;

  for (const [entity, state] of ctx.world.weapons.entries()) {
    if (state.cooldown > 0) state.cooldown = Math.max(0, state.cooldown - dt);
    if (state.bloomDeg > 0) state.bloomDeg = Math.max(0, state.bloomDeg - bloomDecay);

    if (state.reloadRemaining > 0) {
      state.reloadRemaining -= dt;
      if (state.reloadRemaining <= 0) {
        state.reloadRemaining = 0;
        finishReload(ctx, entity);
      }
    }
  }
}

function finishReload(ctx: SimContext, entity: EntityId): void {
  const state = ctx.world.weapons.require(entity);
  const def = findWeapon(state.weaponId);
  if (!def) return;

  const needed = def.magazineSize - state.magazine;
  if (needed <= 0) return;

  const carrier = ctx.world.carriers.get(entity);
  if (carrier) {
    // Players (and any future looting AI) pull rounds from their inventory.
    const taken = removeItem(carrier.inventory, def.ammoItemId, needed);
    state.magazine += taken;
  } else {
    // Enemies do not manage ammunition; the fantasy is "they keep shooting",
    // and the pressure comes from their reload window, not their supply.
    state.magazine = def.magazineSize;
  }

  ctx.bus.emit('weapon:reloadFinished', { entity, weaponId: def.id });
}
