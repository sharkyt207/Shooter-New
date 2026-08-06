/**
 * Death handling and per-tick cleanup.
 *
 * Runs after all damage has been applied, so an entity is evaluated exactly
 * once no matter how many projectiles hit it in the same tick.
 */

import { LOOT } from '@/content/balance';
import { findEnemy } from '@/content/enemies';
import { findWeapon } from '@/content/weapons';
import type { EntityId } from '@/core/ecs/entity';
import { rollLootTable } from '@/game/loot/lootRoller';
import { createLootDrop } from '@/game/simulation/factories';
import type { SimContext } from '@/game/simulation/simContext';

const scratchIds: EntityId[] = [];

export function deathSystem(ctx: SimContext): void {
  const { world } = ctx;

  // Tick down transient hit flashes.
  world.hitFlashes.keyArray(scratchIds);
  for (const entity of scratchIds) {
    const flash = world.hitFlashes.get(entity);
    if (!flash) continue;
    flash.remaining -= ctx.dt;
    if (flash.remaining <= 0) world.hitFlashes.remove(entity);
  }

  world.healths.keyArray(scratchIds);
  for (const entity of scratchIds) {
    const health = world.healths.get(entity);
    if (!health || health.current > 0) continue;
    if (world.isPendingDestroy(entity)) continue;

    const transform = world.transforms.get(entity);
    const faction = world.factions.get(entity);
    const x = transform?.x ?? 0;
    const y = transform?.y ?? 0;

    if (world.players.has(entity)) {
      handlePlayerDeath(ctx, entity, x, y);
      continue;
    }

    const agent = world.agents.get(entity);
    const def = agent ? findEnemy(agent.enemyId) : undefined;
    const xp = def?.xp ?? 0;

    if (def) dropEnemyLoot(ctx, entity, def, x, y);

    // Credit the kill to the player when they landed the final shot.
    const killer = health.lastAttacker;
    if (killer !== null && world.players.has(killer)) {
      const tag = world.players.get(killer);
      if (tag) {
        tag.kills++;
        tag.raidXp += xp;
      }
    }

    ctx.bus.emit('entity:died', {
      entity,
      faction: faction?.id ?? 'scavengers',
      x,
      y,
      killer,
      xp,
      isBoss: def?.isBoss ?? false,
    });

    // A squad must forget its dead, or role assignment keeps handing jobs to
    // corpses.
    ctx.squads.remove(entity);
    world.destroyEntity(entity);
  }
}

function handlePlayerDeath(ctx: SimContext, entity: EntityId, x: number, y: number): void {
  ctx.bus.emit('entity:died', {
    entity,
    faction: 'player',
    x,
    y,
    killer: ctx.world.healths.get(entity)?.lastAttacker ?? null,
    xp: 0,
    isBoss: false,
  });
  ctx.bus.emit('camera:shake', { intensity: 1 });

  // The entity stays in the world for one more moment so the renderer can play
  // the death beat; the simulation stops it from acting via `isAliveActor`.
  ctx.pendingOutcome = 'died';
}

function dropEnemyLoot(
  ctx: SimContext,
  entity: EntityId,
  def: NonNullable<ReturnType<typeof findEnemy>>,
  x: number,
  y: number,
): void {
  const rolled = rollLootTable(ctx.rng.loot, def.lootTableId);

  // Whatever is left in the magazine drops too, at a reduced rate - looting a
  // body should feel like scavenging, not like opening a vending machine.
  const weaponState = ctx.world.weapons.get(entity);
  const weapon = weaponState ? findWeapon(weaponState.weaponId) : undefined;
  if (weapon && weaponState) {
    const rounds = Math.floor(weaponState.magazine * LOOT.enemyAmmoDropFactor);
    // Whatever was actually chambered drops - killing an Order runner carrying
    // armour-piercing rounds is a real prize.
    const ammoId = weaponState.loadedAmmoItemId ?? weapon.defaultAmmoItemId;
    if (rounds > 0) rolled.push({ itemId: ammoId, quantity: rounds });
  }

  for (let i = 0; i < rolled.length; i++) {
    const item = rolled[i] as { itemId: string; quantity: number };
    const angle = (i / Math.max(1, rolled.length)) * Math.PI * 2;
    const radius = 0.35 + ctx.rng.loot.range(0, 0.3);
    let dropX = x + Math.cos(angle) * radius;
    let dropY = y + Math.sin(angle) * radius;
    if (ctx.grid.isWallAtWorld(dropX, dropY)) {
      dropX = x;
      dropY = y;
    }
    createLootDrop(ctx.world, item.itemId, item.quantity, dropX, dropY, ctx.tick);
  }
}
