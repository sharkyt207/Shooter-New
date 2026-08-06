/**
 * Entity factories.
 *
 * One place that knows which components make up a player, an enemy, a
 * projectile or a container. Systems never assemble entities by hand - that is
 * how component sets drift apart and produce entities that are almost, but not
 * quite, an enemy.
 */

import { COMBAT, PLAYER } from '@/content/balance';
import { getContainer, type ContainerId } from '@/content/biomes';
import { findEnemy } from '@/content/enemies';
import { findItem } from '@/content/items';
import { findWeapon } from '@/content/weapons';
import type { EntityId } from '@/core/ecs/entity';
import type { AnomalyKind, FactionId } from '@/game/components';
import { addItem, createInventory } from '@/game/inventory/inventory';
import type { Loadout } from '@/game/player/loadout';
import { loadoutCapacityKg } from '@/game/player/loadout';
import type { ExtractionSpawn } from '@/game/map/mapGenerator';
import type { RaidWorld } from './raidWorld';

export function createPlayer(
  world: RaidWorld,
  loadout: Readonly<Loadout>,
  x: number,
  y: number,
): EntityId {
  const entity = world.createEntity();

  world.transforms.set(entity, { x, y, rotation: 0, prevX: x, prevY: y, prevRotation: 0 });
  world.velocities.set(entity, { x: 0, y: 0 });
  world.colliders.set(entity, { radius: PLAYER.radius, isStatic: false });
  world.healths.set(entity, {
    current: PLAYER.maxHealth,
    max: PLAYER.maxHealth,
    lastDamageTick: -9999,
    lastAttacker: null,
  });
  world.staminas.set(entity, { current: PLAYER.maxStamina, max: PLAYER.maxStamina, regenDelay: 0 });
  world.factions.set(entity, { id: 'player' });
  world.players.set(entity, { raidXp: 0, kills: 0 });
  world.renderables.set(entity, { assetKey: 'actor.player', height: 1.8, tint: 0xffffff });

  const armorDef = loadout.armorItemId ? findItem(loadout.armorItemId) : undefined;
  world.equipments.set(entity, {
    weaponItemId: loadout.weaponItemId,
    armorItemId: loadout.armorItemId,
    backpackItemId: loadout.backpackItemId,
    armorDurability: armorDef?.armor?.durability ?? 0,
  });

  const inventory = createInventory(loadoutCapacityKg(loadout));
  for (const slot of loadout.carried) addItem(inventory, slot.itemId, slot.quantity);
  world.carriers.set(entity, { inventory });

  const weapon = loadout.weaponItemId ? weaponDefForItem(loadout.weaponItemId) : undefined;
  if (weapon) {
    // Enter the raid with a full magazine; the rounds come out of the packed
    // ammunition, so a player who brought none starts dry - as they should.
    const loaded = Math.min(weapon.magazineSize, countCarried(loadout, weapon.ammoItemId));
    world.weapons.set(entity, {
      weaponId: weapon.id,
      magazine: loaded,
      cooldown: 0,
      reloadRemaining: 0,
      bloomDeg: 0,
    });
    const carrier = world.carriers.require(entity);
    removeExact(carrier.inventory.slots, weapon.ammoItemId, loaded);
  }

  world.playerEntity = entity;
  return entity;
}

function weaponDefForItem(itemId: string) {
  // The weapon catalogue is small; a linear scan at spawn time is fine and
  // avoids maintaining a second index.
  const ids = ['wpn_splitter', 'wpn_bruch', 'wpn_nadel'];
  for (const id of ids) {
    const def = findWeapon(id);
    if (def && def.itemId === itemId) return def;
  }
  return undefined;
}

function countCarried(loadout: Readonly<Loadout>, itemId: string): number {
  let total = 0;
  for (const slot of loadout.carried) {
    if (slot.itemId === itemId) total += slot.quantity;
  }
  return total;
}

function removeExact(slots: Array<{ itemId: string; quantity: number }>, itemId: string, amount: number): void {
  let left = amount;
  for (const slot of slots) {
    if (left <= 0) break;
    if (slot.itemId !== itemId) continue;
    const take = Math.min(slot.quantity, left);
    slot.quantity -= take;
    left -= take;
  }
  for (let i = slots.length - 1; i >= 0; i--) {
    if ((slots[i] as { quantity: number }).quantity <= 0) slots.splice(i, 1);
  }
}

export function createEnemy(
  world: RaidWorld,
  enemyId: string,
  x: number,
  y: number,
): EntityId | null {
  const def = findEnemy(enemyId);
  if (!def) return null;

  const entity = world.createEntity();

  world.transforms.set(entity, { x, y, rotation: 0, prevX: x, prevY: y, prevRotation: 0 });
  world.velocities.set(entity, { x: 0, y: 0 });
  world.colliders.set(entity, { radius: def.radius, isStatic: false });
  world.healths.set(entity, {
    current: def.health,
    max: def.health,
    lastDamageTick: -9999,
    lastAttacker: null,
  });
  world.factions.set(entity, { id: def.faction as FactionId });
  world.renderables.set(entity, { assetKey: def.visual, height: 1.75, tint: 0xffffff });

  const weapon = findWeapon(def.weaponId);
  world.weapons.set(entity, {
    weaponId: def.weaponId,
    magazine: weapon?.magazineSize ?? 10,
    cooldown: 0,
    reloadRemaining: 0,
    bloomDeg: 0,
  });

  world.agents.set(entity, {
    enemyId,
    state: 'idle',
    stateTime: 0,
    target: null,
    lastKnownX: x,
    lastKnownY: y,
    awareness: 0,
    timeSinceSeen: 999,
    homeX: x,
    homeY: y,
    destX: x,
    destY: y,
    attackCooldown: 0,
    burstRemaining: 0,
    // Spread perception updates over the interval so they never all land on
    // the same tick.
    perceptionTimer: 0,
    waitTimer: 0,
  });

  return entity;
}

export function createProjectile(
  world: RaidWorld,
  owner: EntityId,
  ownerFaction: FactionId,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  weaponId: string,
  damage: number,
): EntityId | null {
  const weapon = findWeapon(weaponId);
  if (!weapon) return null;

  const entity = world.createEntity();
  const rotation = Math.atan2(dirY, dirX);

  world.transforms.set(entity, { x, y, rotation, prevX: x, prevY: y, prevRotation: rotation });
  world.projectiles.set(entity, {
    owner,
    ownerFaction,
    damage,
    dirX,
    dirY,
    speed: weapon.projectileSpeed,
    travelled: 0,
    effectiveRange: weapon.effectiveRange,
    maxRange: weapon.maxRange,
    minDamageFactor: weapon.minDamageFactor,
    lifetime: COMBAT.projectileMaxLifetimeSeconds,
  });
  world.renderables.set(entity, { assetKey: 'fx.projectile', height: 0.9, tint: 0xffffff });

  return entity;
}

export function createLootDrop(
  world: RaidWorld,
  itemId: string,
  quantity: number,
  x: number,
  y: number,
  tick: number,
): EntityId | null {
  const def = findItem(itemId);
  if (!def || quantity <= 0) return null;

  const entity = world.createEntity();
  world.transforms.set(entity, { x, y, rotation: 0, prevX: x, prevY: y, prevRotation: 0 });
  world.lootDrops.set(entity, { itemId, quantity, createdTick: tick });
  world.renderables.set(entity, { assetKey: def.icon, height: 0.3, tint: 0xffffff });
  return entity;
}

export function createContainer(
  world: RaidWorld,
  containerId: string,
  x: number,
  y: number,
): EntityId | null {
  const def = getContainer(containerId as ContainerId);
  if (!def) return null;

  const entity = world.createEntity();
  world.transforms.set(entity, { x, y, rotation: 0, prevX: x, prevY: y, prevRotation: 0 });
  world.colliders.set(entity, { radius: 0.55, isStatic: true });
  world.containers.set(entity, {
    containerId,
    searchProgress: 0,
    searched: false,
    // Contents are rolled lazily on first search, so a raid only pays for the
    // loot the player actually reaches.
    contents: [],
  });
  world.renderables.set(entity, { assetKey: def.visual, height: 0.8, tint: 0xffffff });
  return entity;
}

export function createExtractionZone(world: RaidWorld, spawn: ExtractionSpawn): EntityId {
  const entity = world.createEntity();
  world.transforms.set(entity, {
    x: spawn.x,
    y: spawn.y,
    rotation: 0,
    prevX: spawn.x,
    prevY: spawn.y,
    prevRotation: 0,
  });
  world.extractionZones.set(entity, {
    zoneId: spawn.zoneId,
    name: spawn.name,
    radius: spawn.radius,
    opensAtTick: spawn.opensAtTick,
    closesAtTick: spawn.closesAtTick,
    phase: 'locked',
    holdProgress: 0,
  });
  return entity;
}

export function createAnomaly(
  world: RaidWorld,
  kind: AnomalyKind,
  x: number,
  y: number,
  radius: number,
): EntityId {
  const entity = world.createEntity();
  world.transforms.set(entity, { x, y, rotation: 0, prevX: x, prevY: y, prevRotation: 0 });
  world.anomalies.set(entity, { kind, radius, phase: 0 });
  world.renderables.set(entity, { assetKey: 'fx.anomaly.core', height: 0.1, tint: 0x38e1d4 });
  return entity;
}
