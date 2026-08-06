/**
 * Weapon firing, reloading, wear and jams.
 *
 * Players and AI share this code path entirely. The only difference between a
 * player pulling a trigger and a scavenger doing the same is the `accuracy`
 * argument and whether the entity carries an inventory - everything else is
 * data (see docs/modules/combat.md).
 *
 * Since M2 the weapon's real numbers come from `resolveWeapon`: base definition
 * plus attachments plus loaded ammunition plus wear. Nothing here knows that
 * attachments exist.
 */

import { WEAPON } from '@/content/balance';
import { DEG_TO_RAD, clamp } from '@/core/math/scalar';
import type { EntityId } from '@/core/ecs/entity';
import { findWeapon, shotIntervalSeconds } from '@/content/weapons';
import type { Caliber } from '@/content/types';
import { findItem } from '@/content/items';
import { countItem, removeItem, type InventoryState } from '@/game/inventory/inventory';
import { createProjectile } from '@/game/simulation/factories';
import { emitNoise, type SimContext } from '@/game/simulation/simContext';
import { bloomRecoveryPerSecond, resolveWeapon, type ResolvedWeapon } from './weaponStats';

/** Metres in front of the muzzle where projectiles spawn. */
const MUZZLE_OFFSET = 0.55;

export type FireResult =
  | 'fired'
  | 'cooldown'
  | 'reloading'
  | 'empty'
  | 'noWeapon'
  | 'busy'
  | 'jammed';

/**
 * Effective statistics of an entity's current weapon.
 *
 * Resolved on demand rather than cached: the inputs (attachments, chambered
 * round, durability) all change during a raid, and a stale cache here would be
 * a genuinely nasty bug class.
 */
export function resolvedWeaponOf(ctx: SimContext, entity: EntityId): ResolvedWeapon | undefined {
  const state = ctx.world.weapons.get(entity);
  if (!state) return undefined;

  const equipment = ctx.world.equipments.get(entity);
  const fraction = state.durabilityMax > 0 ? state.durability / state.durabilityMax : 1;

  return resolveWeapon(
    state.weaponId,
    equipment?.attachments ?? {},
    state.loadedAmmoItemId,
    fraction,
  );
}

export function canFire(ctx: SimContext, entity: EntityId): FireResult {
  const weapon = ctx.world.weapons.get(entity);
  if (!weapon) return 'noWeapon';
  if (ctx.world.usingItems.has(entity)) return 'busy';
  if (weapon.jamRemaining > 0) return 'jammed';
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
  const resolved = resolvedWeaponOf(ctx, entity);
  const transform = ctx.world.transforms.get(entity);
  const faction = ctx.world.factions.get(entity);
  if (!resolved || !transform || !faction) return 'noWeapon';

  // A worn weapon can jam instead of firing. The round is not consumed - the
  // punishment is the time lost clearing it.
  if (resolved.jamChance > 0 && ctx.rng.combat.chance(resolved.jamChance)) {
    weaponState.jamRemaining = WEAPON.jamClearSeconds;
    ctx.bus.emit('weapon:jammed', { entity, weaponId: resolved.weaponId });
    return 'jammed';
  }

  const baseAngle = Math.atan2(dirY, dirX);
  const safeAccuracy = Math.max(0.15, accuracy);
  const spreadDeg = clamp(
    (resolved.spreadDeg + weaponState.bloomDeg) / safeAccuracy,
    0,
    resolved.maxSpreadDeg / safeAccuracy,
  );

  const muzzleX = transform.x + Math.cos(baseAngle) * MUZZLE_OFFSET;
  const muzzleY = transform.y + Math.sin(baseAngle) * MUZZLE_OFFSET;

  for (let pellet = 0; pellet < resolved.pellets; pellet++) {
    // Gaussian rather than uniform: shots cluster around the crosshair, which
    // reads as "the weapon is accurate but not perfect" instead of "random".
    const offset = ctx.rng.combat.gaussian(0, spreadDeg * 0.5) * DEG_TO_RAD;
    const angle = baseAngle + offset;
    createProjectile(ctx.world, entity, faction.id, muzzleX, muzzleY, Math.cos(angle), Math.sin(angle), resolved);
  }

  weaponState.magazine--;
  weaponState.cooldown = shotIntervalSeconds(resolved);
  weaponState.bloomDeg = Math.min(
    resolved.maxSpreadDeg,
    weaponState.bloomDeg + resolved.spreadPerShotDeg,
  );

  const def = findWeapon(resolved.weaponId);
  if (def) {
    weaponState.durability = Math.max(0, weaponState.durability - def.wearPerShot);
  }

  ctx.bus.emit('weapon:fired', {
    entity,
    weaponId: resolved.weaponId,
    x: muzzleX,
    y: muzzleY,
    rotation: baseAngle,
    noiseRadius: resolved.noiseRadius,
  });
  emitNoise(ctx, entity, faction.id, transform.x, transform.y, resolved.noiseRadius);

  return 'fired';
}

/**
 * Begin a reload, or clear a jam when the weapon is stuck.
 *
 * Both live on the same input because both answer the same player question -
 * "my weapon is not shooting, fix it" - and a separate jam button would be one
 * more thing to find under pressure (Pillar P4).
 */
export function tryReload(ctx: SimContext, entity: EntityId): boolean {
  const weaponState = ctx.world.weapons.get(entity);
  if (!weaponState) return false;
  if (weaponState.jamRemaining > 0 || weaponState.reloadRemaining > 0) return false;
  if (ctx.world.usingItems.has(entity)) return false;

  const resolved = resolvedWeaponOf(ctx, entity);
  const def = findWeapon(weaponState.weaponId);
  if (!resolved || !def) return false;

  const carrier = ctx.world.carriers.get(entity);
  if (carrier) {
    const next = bestAmmoFor(carrier.inventory, def.caliber, weaponState.loadedAmmoItemId);
    if (!next) return false;
    // Reloading with a different round is a real choice, so a full magazine of
    // the wrong ammunition is still worth swapping out.
    if (weaponState.magazine >= resolved.magazineSize && next === weaponState.loadedAmmoItemId) {
      return false;
    }
  } else if (weaponState.magazine >= resolved.magazineSize) {
    return false;
  }

  weaponState.reloadRemaining = resolved.reloadSeconds;
  ctx.bus.emit('weapon:reloadStarted', {
    entity,
    weaponId: resolved.weaponId,
    seconds: resolved.reloadSeconds,
  });
  return true;
}

/**
 * Pick the round to load.
 *
 * Preference order: keep what is already chambered if any is left, otherwise
 * take the highest-penetration round available. Automatic selection beats a
 * mid-fight ammo menu on a phone; the loadout screen is where the deliberate
 * choice happens.
 */
export function bestAmmoFor(
  inventory: InventoryState,
  caliber: Caliber,
  preferred: string | null,
): string | null {
  if (preferred && countItem(inventory, preferred) > 0) {
    const def = findItem(preferred);
    if (def?.ammo?.caliber === caliber) return preferred;
  }

  let best: string | null = null;
  let bestPenetration = -1;
  for (const slot of inventory.slots) {
    const def = findItem(slot.itemId);
    if (!def?.ammo || def.ammo.caliber !== caliber || slot.quantity <= 0) continue;
    if (def.ammo.penetration > bestPenetration) {
      bestPenetration = def.ammo.penetration;
      best = slot.itemId;
    }
  }
  return best;
}

/**
 * Advance cooldowns, reloads, jams and spread recovery for every armed entity.
 * Runs once per tick for all weapons, players and AI alike.
 */
export function updateWeapons(ctx: SimContext): void {
  const { dt } = ctx;

  for (const [entity, state] of ctx.world.weapons.entries()) {
    if (state.cooldown > 0) state.cooldown = Math.max(0, state.cooldown - dt);

    if (state.jamRemaining > 0) {
      state.jamRemaining = Math.max(0, state.jamRemaining - dt);
      if (state.jamRemaining === 0) {
        ctx.bus.emit('weapon:jamCleared', { entity, weaponId: state.weaponId });
      }
      continue;
    }

    if (state.bloomDeg > 0) {
      // Ergonomics decides how fast the weapon settles between bursts - the
      // main reason a handy weapon feels better than a powerful one.
      const resolved = resolvedWeaponOf(ctx, entity);
      const recovery = bloomRecoveryPerSecond(resolved?.ergonomics ?? 50) * dt;
      state.bloomDeg = Math.max(0, state.bloomDeg - recovery);
    }

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
  const resolved = resolvedWeaponOf(ctx, entity);
  if (!def || !resolved) return;

  const carrier = ctx.world.carriers.get(entity);
  if (!carrier) {
    // Enemies do not manage ammunition; the fantasy is "they keep shooting",
    // and the pressure comes from their reload window, not their supply.
    state.magazine = resolved.magazineSize;
    ctx.bus.emit('weapon:reloadFinished', { entity, weaponId: def.id });
    return;
  }

  const chosen = bestAmmoFor(carrier.inventory, def.caliber, state.loadedAmmoItemId);
  if (!chosen) return;

  // Switching round type discards what is left in the magazine - that is the
  // cost of changing your mind about what you are shooting at.
  if (chosen !== state.loadedAmmoItemId) state.magazine = 0;

  const needed = resolved.magazineSize - state.magazine;
  if (needed > 0) {
    const taken = removeItem(carrier.inventory, chosen, needed);
    state.magazine += taken;
  }
  state.loadedAmmoItemId = chosen;

  ctx.bus.emit('weapon:reloadFinished', { entity, weaponId: def.id });
}
