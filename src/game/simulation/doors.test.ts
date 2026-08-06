/**
 * Doors, keys and what they do to sight, movement and navigation.
 *
 * The grid is the authority on whether a doorway blocks anything, so these
 * tests deliberately check collision, line of sight and pathfinding rather than
 * the component's own bookkeeping.
 */

import { describe, expect, it } from 'vitest';
import { DOORS } from '@/content/balance';
import type { EntityId } from '@/core/ecs/entity';
import { addItem } from '@/game/inventory/inventory';
import {
  CELL_OPEN,
  CELL_WALL,
  DOOR_CLOSED,
  DOOR_LOCKED,
  DOOR_OPEN,
  MapGrid,
} from '@/game/map/mapGrid';
import { NavigationCache } from '@/game/ai/navigation';
import type { Loadout } from '@/game/player/loadout';
import { createIntent } from '@/game/player/playerIntent';
import { RaidSimulation } from '@/game/simulation/raidSimulation';
import { createDoor } from '@/game/simulation/factories';
import { moveCircle } from '@/game/simulation/collision';

function loadout(): Loadout {
  return {
    weaponItemId: 'itm_wpn_splitter',
    armorItemId: null,
    helmetItemId: null,
    backpackItemId: 'itm_bag_medium',
    attachments: {},
    preferredAmmoItemId: 'itm_ammo_9mm',
    weaponCondition: 1,
    carried: [{ itemId: 'itm_ammo_9mm', quantity: 30 }],
  };
}

/** A corridor of open cells with a single doorway in the middle. */
function corridor(doorState: number): MapGrid {
  const grid = new MapGrid(11, 5, 2);
  for (let cy = 1; cy <= 3; cy++) {
    for (let cx = 1; cx <= 9; cx++) grid.set(cx, cy, CELL_OPEN, 0);
  }
  // Wall the corridor down to one cell high at the door, so it is the only way
  // through rather than something to walk around.
  for (let cx = 5; cx <= 5; cx++) {
    grid.set(cx, 1, CELL_WALL, -1);
    grid.set(cx, 3, CELL_WALL, -1);
  }
  grid.setDoor(5, 2, doorState, 0);
  return grid;
}

describe('a closed door', () => {
  it('blocks movement, sight and the flow field', () => {
    const grid = corridor(DOOR_CLOSED);

    expect(grid.isBlocking(5, 2)).toBe(true);
    expect(grid.isOpen(5, 2)).toBe(false);
    expect(grid.hasLineOfSight(grid.cellCenterX(3), 5, grid.cellCenterX(8), 5)).toBe(false);

    // An actor walking at the door stops short of it. Stepped at a realistic
    // per-tick distance: a single huge step would tunnel through any cell.
    let x = grid.cellCenterX(3);
    let blocked = false;
    for (let i = 0; i < 60; i++) {
      const moved = moveCircle(grid, x, grid.cellCenterY(2), 0.4, 0.1, 0);
      x = moved.x;
      blocked ||= moved.hitWall;
    }
    expect(blocked).toBe(true);
    // Cell 5 starts at x = 10; a 0.4 m circle can get no closer than 9.6.
    expect(x).toBeLessThan(9.7);
  });

  it('is still walkable for pathfinding - somebody will open it', () => {
    const grid = corridor(DOOR_CLOSED);
    expect(grid.isNavBlocked(5, 2)).toBe(false);

    const cache = new NavigationCache(grid);
    const field = cache.fieldFor(grid.cellCenterX(8), grid.cellCenterY(2), 0);
    expect(field?.isReachable(2, 2)).toBe(true);
  });
});

describe('a locked door', () => {
  it('blocks pathfinding as well, so the AI never strands itself on it', () => {
    const grid = corridor(DOOR_LOCKED);
    expect(grid.isNavBlocked(5, 2)).toBe(true);

    const cache = new NavigationCache(grid);
    const field = cache.fieldFor(grid.cellCenterX(8), grid.cellCenterY(2), 0);
    expect(field?.isReachable(2, 2)).toBe(false);
  });
});

describe('opening a door', () => {
  it('reopens sight and movement and invalidates cached navigation', () => {
    const grid = corridor(DOOR_CLOSED);
    const cache = new NavigationCache(grid);

    const before = cache.fieldFor(grid.cellCenterX(8), grid.cellCenterY(2), 0);
    const beforeVersion = grid.version;
    expect(before).toBeDefined();

    grid.setDoorState(5, 2, DOOR_OPEN);

    expect(grid.version).toBeGreaterThan(beforeVersion);
    expect(grid.isBlocking(5, 2)).toBe(false);
    expect(grid.hasLineOfSight(grid.cellCenterX(3), 5, grid.cellCenterX(8), 5)).toBe(true);

    // The cached field was built against the old topology and must be rebuilt.
    const after = cache.fieldFor(grid.cellCenterX(8), grid.cellCenterY(2), 1);
    expect(after?.builtVersion).toBe(grid.version);
  });

  it('never leaves a stale door behind when the cell is overwritten', () => {
    const grid = corridor(DOOR_CLOSED);
    grid.set(5, 2, CELL_OPEN, 0);
    // A floor tile that still blocks because a door used to stand on it is the
    // worst kind of invisible wall.
    expect(grid.isBlocking(5, 2)).toBe(false);
    expect(grid.isDoor(5, 2)).toBe(false);
  });
});

describe('doors in a raid', () => {
  it('opens for a player who walks up to it, and makes a noise doing so', () => {
    const sim = simWithDoor(false);
    const { door } = sim;

    let opened = 0;
    sim.raid.bus.on('door:opened', () => opened++);

    step(sim.raid, 3);

    expect(opened).toBe(1);
    expect(sim.raid.world.doors.require(door).state).toBe('open');
    expect(sim.raid.grid.doorAt(sim.cx, sim.cy)).toBe(DOOR_OPEN);
    expect(DOORS.noiseRadius).toBeGreaterThan(0);
  });

  it('stays shut for a player without the key, and says why', () => {
    const sim = simWithDoor(true);

    let opened = 0;
    let refused = 0;
    sim.raid.bus.on('door:opened', () => opened++);
    sim.raid.bus.on('door:locked', () => refused++);

    step(sim.raid, 5);

    expect(opened).toBe(0);
    expect(refused).toBeGreaterThan(0);
    expect(sim.raid.world.doors.require(sim.door).state).toBe('locked');
  });

  it('opens for a player carrying the key and consumes it', () => {
    const sim = simWithDoor(true);
    const player = sim.raid.world.playerEntity as EntityId;
    const carrier = sim.raid.world.carriers.require(player);
    addItem(carrier.inventory, 'itm_key_vault', 1);

    let opened = 0;
    sim.raid.bus.on('door:opened', (event) => {
      opened++;
      expect(event.wasLocked).toBe(true);
    });

    step(sim.raid, 3);

    expect(opened).toBe(1);
    expect(sim.raid.world.doors.require(sim.door).state).toBe('open');
    // One vault per key: finding a second one still has to mean something.
    expect(carrier.inventory.slots.some((slot) => slot.itemId === 'itm_key_vault')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface DoorFixture {
  raid: RaidSimulation;
  door: EntityId;
  cx: number;
  cy: number;
}

/** A raid with one hand-placed door right next to the player. */
function simWithDoor(locked: boolean): DoorFixture {
  const raid = new RaidSimulation({ seed: 31337, loadout: loadout() });

  // Clear the generated doors so only the placed one can fire an event.
  for (const entity of raid.world.doors.keyArray()) raid.world.destroyEntity(entity);
  raid.world.flushDestroyed();

  const player = raid.world.playerEntity as EntityId;
  const at = raid.world.transforms.require(player);

  // Find a free neighbouring cell to stand the door in.
  const cx = raid.grid.worldToCellX(at.x) + 1;
  const cy = raid.grid.worldToCellY(at.y);
  raid.grid.setDoor(cx, cy, locked ? DOOR_LOCKED : DOOR_CLOSED, 0);

  const door = createDoor(raid.world, {
    cx,
    cy,
    x: raid.grid.cellCenterX(cx),
    y: raid.grid.cellCenterY(cy),
    locked,
    keyItemId: locked ? 'itm_key_vault' : null,
  });

  // Stand close enough for the automatic opening to trigger.
  at.x = raid.grid.cellCenterX(cx) - 1;
  at.y = raid.grid.cellCenterY(cy);

  return { raid, door, cx, cy };
}

function step(sim: RaidSimulation, ticks: number): void {
  const intent = createIntent();
  for (let i = 0; i < ticks; i++) {
    sim.applyIntent(intent);
    sim.step();
  }
}
