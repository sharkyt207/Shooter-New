import { describe, expect, it } from 'vitest';

import { CELL_OPEN, CELL_WALL, MapGrid } from '@/game/map/mapGrid';
import { moveCircle } from './collision';

/**
 * A 4x4 metre room, open, with a solid wall column at cell x=2.
 *
 * ```
 *   . . # .
 *   . . # .
 *   . . # .
 *   . . # .
 * ```
 */
function wallColumn(): MapGrid {
  const grid = new MapGrid(4, 4, 1);
  for (let cy = 0; cy < 4; cy++) {
    for (let cx = 0; cx < 4; cx++) {
      grid.set(cx, cy, cx === 2 ? CELL_WALL : CELL_OPEN);
    }
  }
  return grid;
}

describe('moveCircle', () => {
  it('moves freely through open space', () => {
    const moved = moveCircle(wallColumn(), 1.0, 1.5, 0.3, -0.2, 0.25);
    expect(moved.x).toBeCloseTo(0.8, 5);
    expect(moved.y).toBeCloseTo(1.75, 5);
    expect(moved.hitWall).toBe(false);
  });

  it('stops at a wall instead of passing through it', () => {
    // A realistic per-tick step. At 60 Hz the fastest thing in the game - a
    // sprinting player at 6.5 m/s - covers 0.11 m per tick.
    let x = 1.5;
    for (let tick = 0; tick < 40; tick++) {
      x = moveCircle(wallColumn(), x, 1.5, 0.3, 0.11, 0).x;
    }
    // The wall spans x = 2..3; a radius-0.3 circle cannot get past x = 1.7.
    expect(x).toBeLessThanOrEqual(1.7 + 1e-6);
  });

  /**
   * The known bound of this resolver, asserted rather than assumed.
   *
   * Resolution is a push-out at the destination, not a swept test, so a single
   * step longer than a wall is thick tunnels straight through it. That is
   * acceptable *because* nothing in the game moves that fast in one tick: the
   * fastest actor covers 0.11 m against a 1 m wall, a factor of nine of head
   * room. This test fails the day something exceeds it, which is exactly when
   * somebody needs to know.
   */
  it('is only safe for steps shorter than a wall is thick', () => {
    const grid = wallColumn();
    const safe = moveCircle(grid, 1.5, 1.5, 0.3, 0.5, 0);
    expect(safe.hitX).toBe(true);

    const tunnelled = moveCircle(grid, 1.5, 1.5, 0.3, 2.0, 0);
    expect(tunnelled.hitX).toBe(false);
    expect(tunnelled.x).toBeGreaterThan(3);
  });
});

/**
 * The axis report exists for one reason: the caller must not damp a free axis.
 *
 * Before it existed, `playerSystem` cut both velocity components to 40 % on any
 * wall contact. Running along a corridor wall - the most common movement in the
 * game - therefore lost 60 % of its forward speed every tick while the shoulder
 * touched the wall, and felt like wading through mud.
 */
describe('which axis was blocked', () => {
  it('reports X alone when sliding along a vertical wall', () => {
    // Push into the wall (+x) while also travelling along it (+y).
    const moved = moveCircle(wallColumn(), 1.5, 1.5, 0.3, 0.5, 0.3);
    expect(moved.hitX).toBe(true);
    expect(moved.hitY).toBe(false);
    expect(moved.hitWall).toBe(true);
    // The free axis keeps its full travel - that is the whole point.
    expect(moved.y).toBeCloseTo(1.8, 5);
  });

  it('reports neither in open space', () => {
    const moved = moveCircle(wallColumn(), 1.5, 1.5, 0.3, -0.3, 0.3);
    expect(moved.hitX).toBe(false);
    expect(moved.hitY).toBe(false);
    expect(moved.hitWall).toBe(false);
  });

  it('is deterministic: the same move always gives the same result', () => {
    const a = moveCircle(wallColumn(), 1.5, 1.5, 0.3, 0.5, 0.3);
    const first = { x: a.x, y: a.y, hitX: a.hitX, hitY: a.hitY };
    const b = moveCircle(wallColumn(), 1.5, 1.5, 0.3, 0.5, 0.3);
    expect({ x: b.x, y: b.y, hitX: b.hitX, hitY: b.hitY }).toEqual(first);
  });
});
