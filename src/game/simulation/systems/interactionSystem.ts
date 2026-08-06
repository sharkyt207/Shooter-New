/**
 * Looting: ground pickups and container searching.
 *
 * The interact button is context-sensitive and resolves to exactly one target -
 * the nearest valid one. Ambiguity here is the fastest way to make a touch game
 * feel unreliable (docs/08-UI-UX.md).
 */

import { PLAYER } from '@/content/balance';
import { getContainer, type ContainerId } from '@/content/biomes';
import { findItem } from '@/content/items';
import type { EntityId } from '@/core/ecs/entity';
import { addItem, loadFraction, totalWeight } from '@/game/inventory/inventory';
import { rollLootTable } from '@/game/loot/lootRoller';
import { createLootDrop } from '@/game/simulation/factories';
import type { InteractionTarget, SimContext } from '@/game/simulation/simContext';

export function interactionSystem(ctx: SimContext): void {
  const { world, intent } = ctx;
  ctx.interactionTarget = null;

  const player = world.playerEntity;
  if (player === null || !world.isAliveActor(player)) return;

  const playerTransform = world.transforms.require(player);
  const target = findNearestTarget(ctx, playerTransform.x, playerTransform.y);

  // Cancel any search the player walked away from.
  for (const [entity, container] of world.containers.entries()) {
    if (container.searched || container.searchProgress <= 0) continue;
    if (target?.entity !== entity || !intent.interact) {
      container.searchProgress = 0;
      ctx.bus.emit('container:searchCancelled', { entity });
    }
  }

  if (!target) return;
  ctx.interactionTarget = target;

  if (!intent.interact) return;

  if (target.kind === 'loot') {
    pickUpLoot(ctx, player, target.entity);
    return;
  }

  advanceContainerSearch(ctx, target.entity);
}

function findNearestTarget(ctx: SimContext, x: number, y: number): InteractionTarget | null {
  const rangeSq = PLAYER.interactRange * PLAYER.interactRange;
  let best: InteractionTarget | null = null;
  let bestDistSq = Infinity;

  for (const [entity, drop] of ctx.world.lootDrops.entries()) {
    const transform = ctx.world.transforms.get(entity);
    if (!transform) continue;
    const dx = transform.x - x;
    const dy = transform.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq > rangeSq || distSq >= bestDistSq) continue;

    const def = findItem(drop.itemId);
    bestDistSq = distSq;
    best = {
      entity,
      kind: 'loot',
      label: def?.name ?? drop.itemId,
      quantity: drop.quantity,
      progress: 0,
      distance: Math.sqrt(distSq),
    };
  }

  for (const [entity, container] of ctx.world.containers.entries()) {
    if (container.searched) continue;
    const transform = ctx.world.transforms.get(entity);
    if (!transform) continue;
    const dx = transform.x - x;
    const dy = transform.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq > rangeSq || distSq >= bestDistSq) continue;

    const def = getContainer(container.containerId as ContainerId);
    bestDistSq = distSq;
    best = {
      entity,
      kind: 'container',
      label: def?.name ?? 'Behälter',
      quantity: 1,
      progress: def ? container.searchProgress / def.searchSeconds : 0,
      distance: Math.sqrt(distSq),
    };
  }

  return best;
}

function pickUpLoot(ctx: SimContext, player: EntityId, lootEntity: EntityId): void {
  const drop = ctx.world.lootDrops.get(lootEntity);
  const transform = ctx.world.transforms.get(lootEntity);
  if (!drop || !transform) return;

  const carrier = ctx.world.carriers.require(player);
  const added = addItem(carrier.inventory, drop.itemId, drop.quantity);

  if (added <= 0) {
    ctx.bus.emit('loot:rejected', { itemId: drop.itemId, reason: 'overweight' });
    return;
  }

  ctx.bus.emit('loot:pickedUp', {
    itemId: drop.itemId,
    quantity: added,
    x: transform.x,
    y: transform.y,
  });
  ctx.bus.emit('player:weightChanged', {
    weight: totalWeight(carrier.inventory),
    capacity: carrier.inventory.capacityKg,
  });

  drop.quantity -= added;
  if (drop.quantity <= 0) {
    ctx.world.destroyEntity(lootEntity);
  } else {
    // Partial pickup: the rest stays on the ground. That is the encumbrance
    // decision made visible (Pillar P1).
    ctx.bus.emit('loot:rejected', { itemId: drop.itemId, reason: 'overweight' });
  }
}

function advanceContainerSearch(ctx: SimContext, containerEntity: EntityId): void {
  const container = ctx.world.containers.get(containerEntity);
  if (!container || container.searched) return;

  const def = getContainer(container.containerId as ContainerId);
  if (!def) return;

  if (container.searchProgress <= 0) {
    ctx.bus.emit('container:searchStarted', {
      entity: containerEntity,
      containerId: container.containerId,
      seconds: def.searchSeconds,
    });
  }

  container.searchProgress += ctx.dt;
  if (container.searchProgress < def.searchSeconds) return;

  container.searched = true;
  container.searchProgress = def.searchSeconds;

  // Contents are rolled on open, not at map generation: a raid only pays the
  // cost of the loot the player actually reaches. Guaranteed contents - a
  // keycard, say - come first and never depend on the roll.
  container.contents = [
    ...container.guaranteed.map((entry) => ({ ...entry })),
    ...rollLootTable(ctx.rng.loot, def.lootTableId),
  ];

  const transform = ctx.world.transforms.require(containerEntity);
  scatterContents(ctx, container.contents, transform.x, transform.y);

  ctx.bus.emit('container:opened', {
    entity: containerEntity,
    containerId: container.containerId,
    contents: container.contents,
  });
}

/** Spill contents onto the ground around the container in a small ring. */
function scatterContents(
  ctx: SimContext,
  contents: ReadonlyArray<{ itemId: string; quantity: number }>,
  x: number,
  y: number,
): void {
  const count = contents.length;
  for (let i = 0; i < count; i++) {
    const item = contents[i] as { itemId: string; quantity: number };
    const angle = (i / Math.max(1, count)) * Math.PI * 2 + ctx.rng.loot.range(-0.3, 0.3);
    const radius = 0.6 + ctx.rng.loot.range(0, 0.35);
    let dropX = x + Math.cos(angle) * radius;
    let dropY = y + Math.sin(angle) * radius;
    // Never drop an item inside a wall - it would be unreachable.
    if (ctx.grid.isWallAtWorld(dropX, dropY)) {
      dropX = x;
      dropY = y;
    }
    createLootDrop(ctx.world, item.itemId, item.quantity, dropX, dropY, ctx.tick);
  }
}

/** Current carried weight as a 0..1+ fraction. Used by the view model. */
export function playerLoadFraction(ctx: SimContext): number {
  const player = ctx.world.playerEntity;
  if (player === null) return 0;
  const carrier = ctx.world.carriers.get(player);
  return carrier ? loadFraction(carrier.inventory) : 0;
}
