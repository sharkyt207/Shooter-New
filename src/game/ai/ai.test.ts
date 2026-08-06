import { describe, expect, it } from 'vitest';
import { AI } from '@/content/balance';
import { isHostile, stanceBetween } from '@/content/factions';
import { SeededRandom } from '@/core/math/random';
import { MapGrid, CELL_OPEN, CELL_WALL } from '@/game/map/mapGrid';
import { FlowField, NavigationCache } from './navigation';

/**
 * A hand-built grid, so navigation tests exercise a known shape rather than
 * whatever the procedural generator happened to produce.
 *
 *   #########
 *   #...#...#
 *   #...#...#
 *   #...#...#
 *   #.......#     <- the only way through is along the bottom row
 *   #########
 */
function buildTestGrid(): MapGrid {
  const grid = new MapGrid(9, 6, 2);
  for (let cy = 1; cy <= 4; cy++) {
    for (let cx = 1; cx <= 7; cx++) grid.set(cx, cy, CELL_OPEN, 0);
  }
  // The dividing wall, open only on the bottom row.
  for (let cy = 1; cy <= 3; cy++) grid.set(4, cy, CELL_WALL, -1);
  return grid;
}

describe('flow field', () => {
  it('reaches every open cell of a connected map', () => {
    const grid = buildTestGrid();
    const field = new FlowField(grid);
    field.build(1, 1, 0);

    for (let cy = 1; cy <= 4; cy++) {
      for (let cx = 1; cx <= 7; cx++) {
        if (grid.isWall(cx, cy)) continue;
        expect(field.isReachable(cx, cy), `cell ${cx},${cy}`).toBe(true);
      }
    }
  });

  it('costs nothing at the goal and more further away', () => {
    const grid = buildTestGrid();
    const field = new FlowField(grid);
    field.build(1, 1, 0);

    expect(field.cost[grid.index(1, 1)]).toBe(0);
    expect(field.cost[grid.index(7, 1)] as number).toBeGreaterThan(
      field.cost[grid.index(2, 1)] as number,
    );
  });

  it('routes around a wall instead of into it', () => {
    const grid = buildTestGrid();
    const field = new FlowField(grid);
    // Goal on the left of the divider, start on the right.
    field.build(1, 1, 0);

    const out = { x: 0, y: 0 };
    // From (5,1) the direct line is blocked; the only path is down and around.
    const ok = field.directionAt(grid.cellCenterX(5), grid.cellCenterY(1), out);

    expect(ok).toBe(true);
    // Must not head straight left into the wall at (4,1).
    expect(out.x).toBeGreaterThanOrEqual(0);
    expect(out.y).toBeGreaterThan(0);
  });

  it('walks a full path from one side to the other', () => {
    const grid = buildTestGrid();
    const field = new FlowField(grid);
    field.build(1, 1, 0);

    let cx = 7;
    let cy = 1;
    const out = { x: 0, y: 0 };

    // Follow the gradient cell by cell; it must terminate at the goal.
    for (let step = 0; step < 60; step++) {
      if (cx === 1 && cy === 1) break;
      const ok = field.directionAt(grid.cellCenterX(cx), grid.cellCenterY(cy), out);
      expect(ok, `stuck at ${cx},${cy}`).toBe(true);
      cx += Math.round(out.x);
      cy += Math.round(out.y);
      expect(grid.isWall(cx, cy), `walked into a wall at ${cx},${cy}`).toBe(false);
    }

    expect([cx, cy]).toEqual([1, 1]);
  });

  it('marks unreachable cells rather than pretending', () => {
    const grid = new MapGrid(9, 6, 2);
    // Two rooms with no connection at all.
    for (let cy = 1; cy <= 4; cy++) {
      grid.set(1, cy, CELL_OPEN, 0);
      grid.set(7, cy, CELL_OPEN, 0);
    }

    const field = new FlowField(grid);
    field.build(1, 1, 0);

    expect(field.isReachable(1, 4)).toBe(true);
    expect(field.isReachable(7, 1)).toBe(false);
  });

  it('never cuts a diagonal through a wall corner', () => {
    const grid = new MapGrid(6, 6, 2);
    for (let cy = 1; cy <= 4; cy++) {
      for (let cx = 1; cx <= 4; cx++) grid.set(cx, cy, CELL_OPEN, 0);
    }
    // An L of walls: (2,1) and (1,2) block the diagonal from (1,1) to (2,2).
    grid.set(2, 1, CELL_WALL, -1);
    grid.set(1, 2, CELL_WALL, -1);

    const field = new FlowField(grid);
    field.build(2, 2, 0);

    // (1,1) is only reachable diagonally through the corner, which is banned.
    expect(field.isReachable(1, 1)).toBe(false);
  });

  it('returns no direction when standing on the goal', () => {
    const grid = buildTestGrid();
    const field = new FlowField(grid);
    field.build(2, 2, 0);
    const out = { x: 0, y: 0 };
    expect(field.directionAt(grid.cellCenterX(2), grid.cellCenterY(2), out)).toBe(false);
  });
});

describe('navigation cache', () => {
  it('reuses a field for the same goal cell', () => {
    const grid = buildTestGrid();
    const cache = new NavigationCache(grid, 3);

    const a = cache.fieldFor(grid.cellCenterX(2), grid.cellCenterY(2), 0);
    const b = cache.fieldFor(grid.cellCenterX(2), grid.cellCenterY(2), 1);

    expect(a).toBe(b);
    expect(cache.size).toBe(1);
  });

  it('builds separate fields for separate goals', () => {
    const grid = buildTestGrid();
    const cache = new NavigationCache(grid, 3);

    cache.fieldFor(grid.cellCenterX(2), grid.cellCenterY(2), 0);
    cache.fieldFor(grid.cellCenterX(6), grid.cellCenterY(3), 0);

    expect(cache.size).toBe(2);
  });

  it('never grows past its capacity', () => {
    const grid = buildTestGrid();
    const cache = new NavigationCache(grid, 2);

    cache.fieldFor(grid.cellCenterX(1), grid.cellCenterY(1), 0);
    cache.fieldFor(grid.cellCenterX(2), grid.cellCenterY(1), 1);
    cache.fieldFor(grid.cellCenterX(3), grid.cellCenterY(1), 2);

    expect(cache.size).toBe(2);
  });

  it('refuses a goal inside geometry', () => {
    const grid = buildTestGrid();
    const cache = new NavigationCache(grid, 2);
    expect(cache.fieldFor(grid.cellCenterX(4), grid.cellCenterY(1), 0)).toBeUndefined();
  });
});

describe('faction relations', () => {
  it('is symmetric', () => {
    expect(stanceBetween('order', 'scavengers')).toBe('hostile');
    expect(stanceBetween('scavengers', 'order')).toBe('hostile');
  });

  it('treats a faction as allied with itself', () => {
    expect(stanceBetween('order', 'order')).toBe('allied');
    expect(isHostile('order', 'order')).toBe(false);
  });

  it('makes everything hostile to the player', () => {
    for (const faction of ['scavengers', 'order', 'weaved', 'wardens'] as const) {
      expect(isHostile('player', faction), faction).toBe(true);
    }
  });

  it('lets scavengers and the Order fight each other', () => {
    expect(isHostile('scavengers', 'order')).toBe(true);
  });
});

describe('sound damping', () => {
  it('counts the walls a straight line crosses', () => {
    const grid = buildTestGrid();
    // Along row 1, from left room to right room, through the divider at x=4.
    const walls = grid.countWallsBetween(
      grid.cellCenterX(2),
      grid.cellCenterY(1),
      grid.cellCenterX(6),
      grid.cellCenterY(1),
    );
    expect(walls).toBe(1);
  });

  it('counts nothing in open space', () => {
    const grid = buildTestGrid();
    const walls = grid.countWallsBetween(
      grid.cellCenterX(1),
      grid.cellCenterY(4),
      grid.cellCenterX(3),
      grid.cellCenterY(4),
    );
    expect(walls).toBe(0);
  });

  it('halves the audible radius per wall', () => {
    // The damping constant is what finally makes the M2 suppressor pay off.
    expect(AI.wallSoundDamping).toBeLessThan(1);
    const oneWall = 30 * Math.pow(AI.wallSoundDamping, 1);
    const twoWalls = 30 * Math.pow(AI.wallSoundDamping, 2);
    expect(oneWall).toBeLessThan(30);
    expect(twoWalls).toBeLessThan(oneWall);
  });
});

describe('determinism', () => {
  it('builds identical fields for identical input', () => {
    const build = (): number[] => {
      const grid = buildTestGrid();
      const field = new FlowField(grid);
      field.build(1, 1, 0);
      return Array.from(field.cost);
    };
    expect(build()).toEqual(build());
  });

  it('keeps flank side selection on the seeded stream', () => {
    const rolls = (): boolean[] => {
      const rng = new SeededRandom(4242);
      return Array.from({ length: 20 }, () => rng.chance(0.5));
    };
    expect(rolls()).toEqual(rolls());
  });
});
