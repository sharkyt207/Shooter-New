/**
 * The raid map's collision grid.
 *
 * A flat Uint8Array of cells. Walls are static and axis-aligned, which lets
 * every collision query be an O(1) grid lookup instead of a broadphase - the
 * single biggest reason the simulation fits comfortably in its 3 ms budget.
 */

import type { Aabb } from '@/core/math/shapes';

export const CELL_OPEN = 0;
export const CELL_WALL = 1;
/** Marks a seam corridor. Walkable, but visually and audibly distinct. */
export const CELL_SEAM = 2;
/** A doorway. Passable only while the door in it is open (see `doorOf`). */
export const CELL_DOOR = 3;

/** Per-cell door state, parallel to `cells`. */
export const DOOR_NONE = 0;
export const DOOR_OPEN = 1;
export const DOOR_CLOSED = 2;
export const DOOR_LOCKED = 3;

export interface MapCellInfo {
  /** Index of the fragment this cell belongs to, or -1 for seams and voids. */
  fragmentIndex: number;
}

export class MapGrid {
  readonly cells: Uint8Array;
  /** Fragment index per cell; -1 where none applies. */
  readonly fragmentOf: Int8Array;
  /** Door state per cell: DOOR_NONE for everything that is not a doorway. */
  readonly doorOf: Uint8Array;

  /**
   * Bumped whenever the walkable topology changes - which today means a door
   * opening. Cached flow fields compare against it and rebuild when it moves.
   */
  version = 0;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cellSize: number,
  ) {
    this.cells = new Uint8Array(width * height).fill(CELL_WALL);
    this.fragmentOf = new Int8Array(width * height).fill(-1);
    this.doorOf = new Uint8Array(width * height).fill(DOOR_NONE);
  }

  get worldWidth(): number {
    return this.width * this.cellSize;
  }

  get worldHeight(): number {
    return this.height * this.cellSize;
  }

  index(cx: number, cy: number): number {
    return cy * this.width + cx;
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.width && cy < this.height;
  }

  get(cx: number, cy: number): number {
    if (!this.inBounds(cx, cy)) return CELL_WALL;
    return this.cells[cy * this.width + cx] as number;
  }

  /**
   * Write a plain cell. Any door that stood here is removed with it - leaving
   * `doorOf` behind would produce a floor tile that silently blocks everything.
   */
  set(cx: number, cy: number, value: number, fragmentIndex = -1): void {
    if (!this.inBounds(cx, cy)) return;
    const i = cy * this.width + cx;
    this.cells[i] = value;
    this.fragmentOf[i] = fragmentIndex;
    if (this.doorOf[i] !== DOOR_NONE) {
      this.doorOf[i] = DOOR_NONE;
      this.version++;
    }
  }

  /** Solid geometry. A doorway is never a wall, whatever its door is doing. */
  isWall(cx: number, cy: number): boolean {
    return this.get(cx, cy) === CELL_WALL;
  }

  /**
   * Does this cell stop movement, sight and bullets right now?
   *
   * This - not `isWall` - is the question collision, line of sight and
   * projectiles ask, because a closed door stops all three without being a wall.
   */
  isBlocking(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) return true;
    const i = cy * this.width + cx;
    if (this.cells[i] === CELL_WALL) return true;
    const door = this.doorOf[i] as number;
    return door === DOOR_CLOSED || door === DOOR_LOCKED;
  }

  isOpen(cx: number, cy: number): boolean {
    return !this.isBlocking(cx, cy);
  }

  /**
   * Blocking for pathfinding purposes.
   *
   * A closed but unlocked door is *not* blocking here: anyone who reaches it
   * opens it. A locked one is, because only the player can ever hold a key, so
   * routing the AI through it would strand it against the frame.
   */
  isNavBlocked(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) return true;
    const i = cy * this.width + cx;
    return this.cells[i] === CELL_WALL || this.doorOf[i] === DOOR_LOCKED;
  }

  isDoor(cx: number, cy: number): boolean {
    return this.get(cx, cy) === CELL_DOOR;
  }

  doorAt(cx: number, cy: number): number {
    if (!this.inBounds(cx, cy)) return DOOR_NONE;
    return this.doorOf[cy * this.width + cx] as number;
  }

  /** Place a doorway. Marks the cell and records the door's initial state. */
  setDoor(cx: number, cy: number, state: number, fragmentIndex = -1): void {
    if (!this.inBounds(cx, cy)) return;
    const i = cy * this.width + cx;
    this.cells[i] = CELL_DOOR;
    this.fragmentOf[i] = fragmentIndex;
    this.doorOf[i] = state;
    this.version++;
  }

  /** Open or close an existing door, invalidating cached navigation. */
  setDoorState(cx: number, cy: number, state: number): void {
    if (!this.inBounds(cx, cy)) return;
    const i = cy * this.width + cx;
    if (this.cells[i] !== CELL_DOOR || this.doorOf[i] === state) return;
    this.doorOf[i] = state;
    this.version++;
  }

  fragmentAt(cx: number, cy: number): number {
    if (!this.inBounds(cx, cy)) return -1;
    return this.fragmentOf[cy * this.width + cx] as number;
  }

  // ── World-space helpers ──────────────────────────────────────────────────

  worldToCellX(x: number): number {
    return Math.floor(x / this.cellSize);
  }

  worldToCellY(y: number): number {
    return Math.floor(y / this.cellSize);
  }

  /** Centre of a cell, in world metres. */
  cellCenterX(cx: number): number {
    return (cx + 0.5) * this.cellSize;
  }

  cellCenterY(cy: number): number {
    return (cy + 0.5) * this.cellSize;
  }

  /** "Would an actor be stuck here?" - walls and closed doors alike. */
  isWallAtWorld(x: number, y: number): boolean {
    return this.isBlocking(this.worldToCellX(x), this.worldToCellY(y));
  }

  /** AABB of a wall cell, in world metres. Reuses `out` to stay allocation-free. */
  cellBounds(cx: number, cy: number, out: Aabb): Aabb {
    out.minX = cx * this.cellSize;
    out.minY = cy * this.cellSize;
    out.maxX = out.minX + this.cellSize;
    out.maxY = out.minY + this.cellSize;
    return out;
  }

  /**
   * Line of sight between two world points, using a DDA grid walk.
   * Returns true when no wall cell blocks the segment.
   */
  hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    const cs = this.cellSize;
    let cx = this.worldToCellX(x0);
    let cy = this.worldToCellY(y0);
    const endX = this.worldToCellX(x1);
    const endY = this.worldToCellY(y1);

    if (this.isBlocking(cx, cy)) return false;
    if (cx === endX && cy === endY) return true;

    const dx = x1 - x0;
    const dy = y1 - y0;
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;

    // Distance along the ray to the next cell boundary on each axis.
    const invDx = dx !== 0 ? 1 / Math.abs(dx) : Infinity;
    const invDy = dy !== 0 ? 1 / Math.abs(dy) : Infinity;

    let tMaxX =
      dx !== 0 ? (((dx > 0 ? cx + 1 : cx) * cs - x0) / dx) : Infinity;
    let tMaxY =
      dy !== 0 ? (((dy > 0 ? cy + 1 : cy) * cs - y0) / dy) : Infinity;
    const tDeltaX = cs * invDx;
    const tDeltaY = cs * invDy;

    // Bounded to the grid diagonal so a degenerate ray can never spin forever.
    const maxSteps = this.width + this.height + 2;
    for (let step = 0; step < maxSteps; step++) {
      if (tMaxX < tMaxY) {
        cx += stepX;
        tMaxX += tDeltaX;
      } else {
        cy += stepY;
        tMaxY += tDeltaY;
      }

      // Wall check comes first: a target standing inside geometry is not
      // visible, and neither is anything behind it.
      if (this.isBlocking(cx, cy)) return false;
      if (cx === endX && cy === endY) return true;
      if (tMaxX > 1 && tMaxY > 1) return true;
    }
    return true;
  }

  /**
   * How many wall cells a straight line crosses.
   *
   * Used by the hearing model: sound does not stop at a wall, it is muffled by
   * it. Counting walls is a cheap, deterministic stand-in for real acoustic
   * propagation and is more than enough at this scale.
   */
  countWallsBetween(x0: number, y0: number, x1: number, y1: number): number {
    const cs = this.cellSize;
    let cx = this.worldToCellX(x0);
    let cy = this.worldToCellY(y0);
    const endX = this.worldToCellX(x1);
    const endY = this.worldToCellY(y1);
    if (cx === endX && cy === endY) return 0;

    const dx = x1 - x0;
    const dy = y1 - y0;
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;

    let tMaxX = dx !== 0 ? ((dx > 0 ? cx + 1 : cx) * cs - x0) / dx : Infinity;
    let tMaxY = dy !== 0 ? ((dy > 0 ? cy + 1 : cy) * cs - y0) / dy : Infinity;
    const tDeltaX = dx !== 0 ? cs / Math.abs(dx) : Infinity;
    const tDeltaY = dy !== 0 ? cs / Math.abs(dy) : Infinity;

    let walls = 0;
    const maxSteps = this.width + this.height + 2;
    for (let step = 0; step < maxSteps; step++) {
      if (tMaxX < tMaxY) {
        cx += stepX;
        tMaxX += tDeltaX;
      } else {
        cy += stepY;
        tMaxY += tDeltaY;
      }

      if (this.isBlocking(cx, cy)) walls++;
      if (cx === endX && cy === endY) break;
      if (tMaxX > 1 && tMaxY > 1) break;
    }
    return walls;
  }

  /**
   * Every cell something may be spawned on.
   * Doorways are excluded: a container standing in a door is a blocked door.
   */
  collectOpenCells(out: number[] = []): number[] {
    out.length = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      if (cell !== CELL_WALL && cell !== CELL_DOOR) out.push(i);
    }
    return out;
  }

  cellXOf(index: number): number {
    return index % this.width;
  }

  cellYOf(index: number): number {
    return Math.floor(index / this.width);
  }

  /**
   * Flood fill from a starting cell; every reachable open cell is marked.
   * The generator uses this to guarantee a connected, fully playable map.
   *
   * Doors count as passable regardless of their lock, because the generator
   * guarantees every key spawns outside the room it opens. Treating a locked
   * door as a wall here would have the connectivity pass seal a vault it was
   * supposed to protect.
   */
  floodFill(startIndex: number): Uint8Array {
    const visited = new Uint8Array(this.cells.length);
    if (this.cells[startIndex] === CELL_WALL) return visited;

    const queue: number[] = [startIndex];
    visited[startIndex] = 1;

    for (let head = 0; head < queue.length; head++) {
      const index = queue[head] as number;
      const cx = index % this.width;
      const cy = (index - cx) / this.width;

      // 4-connected: diagonal-only links would let actors clip wall corners.
      for (let dir = 0; dir < 4; dir++) {
        const nx = cx + (dir === 0 ? 1 : dir === 1 ? -1 : 0);
        const ny = cy + (dir === 2 ? 1 : dir === 3 ? -1 : 0);
        if (!this.inBounds(nx, ny)) continue;
        const ni = ny * this.width + nx;
        if (visited[ni] === 1 || this.cells[ni] === CELL_WALL) continue;
        visited[ni] = 1;
        queue.push(ni);
      }
    }
    return visited;
  }
}
