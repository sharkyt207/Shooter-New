/**
 * Movement and collision resolution against the map grid.
 *
 * There is no physics engine (ADR-012). Actors are circles, walls are grid
 * cells, and resolution is a small number of push-outs per step. Deterministic,
 * allocation-free and easy to reason about.
 */

import { circleVsAabb, type Aabb, type Penetration } from '@/core/math/shapes';
import type { MapGrid } from '@/game/map/mapGrid';

/** Scratch objects - this runs for every actor, every tick. */
const scratchBox: Aabb = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const scratchPen: Penetration = { depth: 0, normalX: 0, normalY: 0 };

export interface MoveResult {
  x: number;
  y: number;
  /** True when the mover was pushed out of at least one wall. */
  hitWall: boolean;
  /**
   * Which axis was blocked.
   *
   * Reported separately because the caller must not bleed off the velocity of
   * an axis that was free. Running *along* a wall blocks X and leaves Y open;
   * damping both turns a clean slide into wading through mud, and that was the
   * single worst thing about how movement felt.
   */
  hitX: boolean;
  hitY: boolean;
}

const result: MoveResult = { x: 0, y: 0, hitWall: false, hitX: false, hitY: false };

/**
 * Move a circle by (dx, dy) and push it out of any wall it ends up inside.
 *
 * Axis-separated: the X move is resolved before the Y move, which gives the
 * "slide along the wall" feel players expect from a twin-stick shooter instead
 * of sticking to corners.
 */
export function moveCircle(
  grid: MapGrid,
  x: number,
  y: number,
  radius: number,
  dx: number,
  dy: number,
): MoveResult {
  let px = x;
  let py = y;
  let hitX = false;
  let hitY = false;

  if (dx !== 0) {
    px += dx;
    if (resolveAgainstWalls(grid, px, py, radius, true)) {
      px = resolvedX;
      hitX = true;
    }
  }

  if (dy !== 0) {
    py += dy;
    if (resolveAgainstWalls(grid, px, py, radius, false)) {
      py = resolvedY;
      hitY = true;
    }
  }

  result.x = px;
  result.y = py;
  result.hitX = hitX;
  result.hitY = hitY;
  result.hitWall = hitX || hitY;
  return result;
}

let resolvedX = 0;
let resolvedY = 0;

/**
 * Push a circle out of every overlapping wall cell.
 * Writes into `resolvedX`/`resolvedY` and returns whether anything was hit.
 *
 * @param axisX When true only the X coordinate is corrected, otherwise only Y.
 */
function resolveAgainstWalls(
  grid: MapGrid,
  x: number,
  y: number,
  radius: number,
  axisX: boolean,
): boolean {
  const minCx = grid.worldToCellX(x - radius);
  const maxCx = grid.worldToCellX(x + radius);
  const minCy = grid.worldToCellY(y - radius);
  const maxCy = grid.worldToCellY(y + radius);

  let cx2 = x;
  let cy2 = y;
  let hit = false;

  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      // A closed door is as solid as a wall until somebody opens it.
      if (!grid.isBlocking(cx, cy)) continue;

      grid.cellBounds(cx, cy, scratchBox);
      circleVsAabb(cx2, cy2, radius, scratchBox, scratchPen);
      if (scratchPen.depth <= 0) continue;

      hit = true;
      // Correcting only the moving axis is what produces wall sliding.
      if (axisX) cx2 += scratchPen.normalX * scratchPen.depth;
      else cy2 += scratchPen.normalY * scratchPen.depth;
    }
  }

  resolvedX = cx2;
  resolvedY = cy2;
  return hit;
}

/** Is a circle of this radius free of walls at this position? */
export function isPositionFree(grid: MapGrid, x: number, y: number, radius: number): boolean {
  const minCx = grid.worldToCellX(x - radius);
  const maxCx = grid.worldToCellX(x + radius);
  const minCy = grid.worldToCellY(y - radius);
  const maxCy = grid.worldToCellY(y + radius);

  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      if (!grid.isBlocking(cx, cy)) continue;
      grid.cellBounds(cx, cy, scratchBox);
      circleVsAabb(x, y, radius, scratchBox, scratchPen);
      if (scratchPen.depth > 0) return false;
    }
  }
  return true;
}
