/**
 * Doors.
 *
 * A door is two things at once: a piece of collision the grid owns, and an
 * entity that remembers why it is shut. Keeping the grid authoritative means
 * collision, line of sight, bullets and the flow field all agree about a closed
 * door for free, with no special case anywhere.
 *
 * Doors open on approach rather than on a button press. That is a deliberate
 * touch decision (Pillar P4): an extra verb the player has to find mid-fight is
 * a design failure, and an automatic door also removes the entire class of bugs
 * where an enemy grinds against a frame it does not know how to open.
 *
 * A locked door is the exception, and the only one: it opens for a player
 * carrying the matching key and for nobody else. Enemies never hold keys, so a
 * vault stays a room the player alone can reach - which is exactly what makes
 * the key worth hunting for.
 */

import { DOORS } from '@/content/balance';
import { findItem } from '@/content/items';
import type { EntityId } from '@/core/ecs/entity';
import type { Door } from '@/game/components';
import { countItem } from '@/game/inventory/inventory';
import { DOOR_OPEN } from '@/game/map/mapGrid';
import { emitNoise, type SimContext } from '@/game/simulation/simContext';

export function doorSystem(ctx: SimContext): void {
  const { world } = ctx;
  if (world.doors.size === 0) return;

  const rangeSq = DOORS.autoOpenRange * DOORS.autoOpenRange;

  for (const [entity, door] of world.doors.entries()) {
    if (door.state === 'open') continue;

    const transform = world.transforms.get(entity);
    if (!transform) continue;

    for (const [actor, actorTransform] of world.transforms.entries()) {
      if (!world.players.has(actor) && !world.agents.has(actor)) continue;

      const health = world.healths.get(actor);
      if (!health || health.current <= 0) continue;

      const dx = actorTransform.x - transform.x;
      const dy = actorTransform.y - transform.y;
      if (dx * dx + dy * dy > rangeSq) continue;

      if (!canOpen(ctx, door, actor)) {
        // Tell the player why the door will not move - once they are close
        // enough for that to be the answer to a question they just asked.
        if (actor === world.playerEntity) {
          ctx.bus.emit('door:locked', { entity, keyItemId: door.keyItemId });
        }
        continue;
      }

      openDoor(ctx, entity, door, actor, transform.x, transform.y);
      break;
    }
  }
}

/** Anyone may push a closed door. A locked one needs the matching key. */
function canOpen(ctx: SimContext, door: Door, actor: EntityId): boolean {
  if (door.state !== 'locked') return true;
  if (actor !== ctx.world.playerEntity || door.keyItemId === null) return false;

  const carrier = ctx.world.carriers.get(actor);
  if (!carrier) return false;
  return countItem(carrier.inventory, door.keyItemId) > 0;
}

function openDoor(
  ctx: SimContext,
  entity: EntityId,
  door: Door,
  actor: EntityId,
  x: number,
  y: number,
): void {
  const wasLocked = door.state === 'locked';

  door.state = 'open';
  door.everOpened = true;
  // The grid is the authority; bumping its version invalidates every cached
  // flow field, so the AI immediately knows the building changed shape.
  ctx.grid.setDoorState(door.cx, door.cy, DOOR_OPEN);

  const renderable = ctx.world.renderables.get(entity);
  if (renderable) renderable.assetKey = 'prop.door.open';

  // A door is never quiet. Forcing a locked one is louder still - taking the
  // vault is supposed to announce itself.
  const faction = ctx.world.factions.get(actor)?.id ?? 'player';
  emitNoise(
    ctx,
    entity,
    faction,
    x,
    y,
    wasLocked ? DOORS.lockedNoiseRadius : DOORS.noiseRadius,
  );

  ctx.bus.emit('door:opened', { entity, x, y, wasLocked });

  // A key is consumed by the door it opens: one vault per key, so finding a
  // second one still means something.
  if (wasLocked && door.keyItemId) {
    const carrier = ctx.world.carriers.get(actor);
    if (carrier && findItem(door.keyItemId)) {
      removeOne(carrier.inventory.slots, door.keyItemId);
    }
  }
}

function removeOne(slots: Array<{ itemId: string; quantity: number }>, itemId: string): void {
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i] as { itemId: string; quantity: number };
    if (slot.itemId !== itemId) continue;
    slot.quantity--;
    if (slot.quantity <= 0) slots.splice(i, 1);
    return;
  }
}
