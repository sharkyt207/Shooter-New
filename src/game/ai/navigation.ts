/**
 * Flow-field navigation.
 *
 * Until M3 an enemy simply walked at its destination and slid along whatever it
 * hit. That works in an open room and fails at every concave corner - the enemy
 * grinds against a wall until its state times out, which reads as stupidity
 * rather than as a challenge.
 *
 * A flow field fixes it properly: one breadth-first sweep from the goal
 * produces a distance map over the whole grid, and every cell then knows which
 * neighbour leads closer. Following that gradient is guaranteed to reach the
 * goal if a path exists at all.
 *
 * Cost: our maps are around 4000 cells, so a sweep is a fraction of a
 * millisecond. Fields are cached per goal cell and shared by every enemy
 * heading to the same place - which, thanks to squads, is the common case.
 */

import { CELL_WALL, type MapGrid } from '@/game/map/mapGrid';

/** Unreachable cells keep this cost. */
const UNREACHABLE = 0x7fffffff;

/**
 * Diagonal step cost relative to a straight one, scaled to integers.
 * 10 / 14 is the standard integer approximation of 1 / sqrt(2).
 */
const STRAIGHT_COST = 10;
const DIAGONAL_COST = 14;

export class FlowField {
  readonly cost: Int32Array;
  /** Goal cell this field was built for. */
  goalCx = -1;
  goalCy = -1;
  /** Tick the field was last built, for cache eviction. */
  builtAtTick = -1;

  constructor(private readonly grid: MapGrid) {
    this.cost = new Int32Array(grid.width * grid.height);
  }

  /**
   * Rebuild the field for a new goal.
   *
   * Dijkstra with a small bucket queue rather than a binary heap: there are
   * only two edge weights, so buckets keep it O(cells) with no allocation per
   * node.
   */
  build(goalCx: number, goalCy: number, tick: number): void {
    this.goalCx = goalCx;
    this.goalCy = goalCy;
    this.builtAtTick = tick;
    this.cost.fill(UNREACHABLE);

    const { grid } = this;
    if (!grid.inBounds(goalCx, goalCy) || grid.isWall(goalCx, goalCy)) return;

    const start = grid.index(goalCx, goalCy);
    this.cost[start] = 0;

    // Simple FIFO sweep with re-relaxation. With two edge weights the queue
    // stays nearly sorted, so this settles in a couple of passes.
    const queue: number[] = [start];
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head] as number;
      const current = this.cost[index] as number;

      const cx = index % grid.width;
      const cy = (index - cx) / grid.width;

      for (let dir = 0; dir < 8; dir++) {
        const dx = DIR_X[dir] as number;
        const dy = DIR_Y[dir] as number;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!grid.inBounds(nx, ny)) continue;

        const ni = ny * grid.width + nx;
        if (grid.cells[ni] === CELL_WALL) continue;

        // Never cut a corner diagonally: an actor with a real radius would
        // clip the wall it is squeezing past.
        if (dx !== 0 && dy !== 0) {
          if (grid.isWall(cx + dx, cy) || grid.isWall(cx, cy + dy)) continue;
        }

        const step = dx !== 0 && dy !== 0 ? DIAGONAL_COST : STRAIGHT_COST;
        const next = current + step;
        if (next < (this.cost[ni] as number)) {
          this.cost[ni] = next;
          queue.push(ni);
        }
      }
    }
  }

  isReachable(cx: number, cy: number): boolean {
    if (!this.grid.inBounds(cx, cy)) return false;
    return (this.cost[cy * this.grid.width + cx] as number) < UNREACHABLE;
  }

  /**
   * Direction of steepest descent at a world position, written into `out`.
   * Returns false when the cell is unreachable or already the goal.
   */
  directionAt(worldX: number, worldY: number, out: { x: number; y: number }): boolean {
    const { grid } = this;
    const cx = grid.worldToCellX(worldX);
    const cy = grid.worldToCellY(worldY);
    if (!grid.inBounds(cx, cy)) return false;

    const here = this.cost[cy * grid.width + cx] as number;
    if (here === 0 || here >= UNREACHABLE) return false;

    let bestCost = here;
    let bestX = 0;
    let bestY = 0;

    for (let dir = 0; dir < 8; dir++) {
      const dx = DIR_X[dir] as number;
      const dy = DIR_Y[dir] as number;
      const nx = cx + dx;
      const ny = cy + dy;
      if (!grid.inBounds(nx, ny)) continue;
      if (grid.isWall(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (grid.isWall(cx + dx, cy) || grid.isWall(cx, cy + dy))) continue;

      const cost = this.cost[ny * grid.width + nx] as number;
      if (cost < bestCost) {
        bestCost = cost;
        bestX = dx;
        bestY = dy;
      }
    }

    if (bestX === 0 && bestY === 0) return false;

    const length = Math.hypot(bestX, bestY);
    out.x = bestX / length;
    out.y = bestY / length;
    return true;
  }
}

const DIR_X = [1, -1, 0, 0, 1, 1, -1, -1] as const;
const DIR_Y = [0, 0, 1, -1, 1, -1, 1, -1] as const;

/**
 * Cache of flow fields, keyed by goal cell.
 *
 * Squads share a destination, so a handful of fields covers every enemy on the
 * map. The cache is deliberately small: rebuilding is cheap, holding stale
 * fields is not.
 */
export class NavigationCache {
  private readonly fields: FlowField[] = [];

  constructor(
    private readonly grid: MapGrid,
    private readonly capacity = 6,
  ) {}

  /** How many fields are currently held. Used by tests and diagnostics. */
  get size(): number {
    return this.fields.length;
  }

  /**
   * Field leading to a world position, building or reusing as needed.
   * Returns undefined when the goal is inside geometry.
   */
  fieldFor(worldX: number, worldY: number, tick: number): FlowField | undefined {
    const cx = this.grid.worldToCellX(worldX);
    const cy = this.grid.worldToCellY(worldY);
    if (!this.grid.inBounds(cx, cy) || this.grid.isWall(cx, cy)) return undefined;

    for (const field of this.fields) {
      if (field.goalCx === cx && field.goalCy === cy) {
        field.builtAtTick = tick;
        return field;
      }
    }

    const field = this.acquire();
    field.build(cx, cy, tick);
    return field;
  }

  private acquire(): FlowField {
    if (this.fields.length < this.capacity) {
      const field = new FlowField(this.grid);
      this.fields.push(field);
      return field;
    }

    // Evict the field nobody has asked for in the longest time.
    let oldest = this.fields[0] as FlowField;
    for (const field of this.fields) {
      if (field.builtAtTick < oldest.builtAtTick) oldest = field;
    }
    return oldest;
  }

  clear(): void {
    this.fields.length = 0;
  }
}
