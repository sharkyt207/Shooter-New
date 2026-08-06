import { describe, expect, it } from 'vitest';
import { RAID } from '@/content/balance';
import { SeededRandom } from '@/core/math/random';
import { generateMap } from './mapGenerator';
import { CELL_WALL } from './mapGrid';

function generate(seed: number, fragmentCount = 3) {
  return generateMap(new SeededRandom(seed), { fragmentCount });
}

describe('map generation', () => {
  it('is deterministic for the same seed', () => {
    const a = generate(4711);
    const b = generate(4711);

    expect(Array.from(a.grid.cells)).toEqual(Array.from(b.grid.cells));
    expect(a.playerSpawn).toEqual(b.playerSpawn);
    expect(a.containers).toEqual(b.containers);
    expect(a.enemies).toEqual(b.enemies);
    expect(a.extractions).toEqual(b.extractions);
  });

  it('produces different maps for different seeds', () => {
    const a = generate(1);
    const b = generate(2);
    expect(Array.from(a.grid.cells)).not.toEqual(Array.from(b.grid.cells));
  });

  it('creates the requested number of fragments', () => {
    const map = generate(99, 4);
    expect(map.fragments).toHaveLength(4);
    expect(map.biomeNames).toHaveLength(4);
  });

  it('is fully connected - every open cell is reachable from the spawn', () => {
    // The single most important invariant: an unreachable extraction zone or
    // loot container would silently ruin a raid.
    for (const seed of [1, 2, 3, 42, 1337, 90210]) {
      const map = generate(seed);
      const { grid } = map;

      const startIndex = grid.index(
        grid.worldToCellX(map.playerSpawn.x),
        grid.worldToCellY(map.playerSpawn.y),
      );
      const reachable = grid.floodFill(startIndex);

      let openCells = 0;
      let unreachable = 0;
      for (let i = 0; i < grid.cells.length; i++) {
        if (grid.cells[i] === CELL_WALL) continue;
        openCells++;
        if (reachable[i] !== 1) unreachable++;
      }

      expect(openCells).toBeGreaterThan(200);
      expect(unreachable).toBe(0);
    }
  });

  it('spawns the player on an open cell', () => {
    for (const seed of [5, 55, 555]) {
      const map = generate(seed);
      expect(map.grid.isWallAtWorld(map.playerSpawn.x, map.playerSpawn.y)).toBe(false);
    }
  });

  it('places containers, enemies and extraction zones on open cells', () => {
    const map = generate(24680);

    expect(map.containers.length).toBeGreaterThan(0);
    expect(map.enemies.length).toBeGreaterThan(0);
    expect(map.extractions.length).toBeGreaterThan(0);

    for (const item of [...map.containers, ...map.enemies, ...map.extractions]) {
      expect(map.grid.isWallAtWorld(item.x, item.y)).toBe(false);
    }
  });

  it('keeps enemies away from the player spawn', () => {
    for (const seed of [11, 22, 33]) {
      const map = generate(seed);
      for (const enemy of map.enemies) {
        const dist = Math.hypot(enemy.x - map.playerSpawn.x, enemy.y - map.playerSpawn.y);
        expect(dist).toBeGreaterThanOrEqual(14);
      }
    }
  });

  it('opens extraction zones on a staggered schedule', () => {
    const map = generate(31415);
    const ticks = map.extractions.map((zone) => zone.opensAtTick);

    expect(ticks[0]).toBe(Math.round(RAID.firstExtractionAtSeconds * 60));
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i] as number).toBeGreaterThan(ticks[i - 1] as number);
    }
    for (const zone of map.extractions) {
      expect(zone.closesAtTick).toBeGreaterThan(zone.opensAtTick);
    }
  });

  it('has a solid border so nothing can leave the map', () => {
    const map = generate(80808);
    const { grid } = map;

    for (let cx = 0; cx < grid.width; cx++) {
      expect(grid.get(cx, 0)).toBe(CELL_WALL);
      expect(grid.get(cx, grid.height - 1)).toBe(CELL_WALL);
    }
    for (let cy = 0; cy < grid.height; cy++) {
      expect(grid.get(0, cy)).toBe(CELL_WALL);
      expect(grid.get(grid.width - 1, cy)).toBe(CELL_WALL);
    }
  });
});

describe('line of sight', () => {
  it('sees through open space and is blocked by walls', () => {
    const map = generate(6543);
    const { grid } = map;
    const { x, y } = map.playerSpawn;

    // A point on top of itself is always visible.
    expect(grid.hasLineOfSight(x, y, x, y)).toBe(true);

    // Find any wall cell and confirm sight into its centre is blocked.
    let blockedFound = false;
    for (let i = 0; i < grid.cells.length && !blockedFound; i++) {
      if (grid.cells[i] !== CELL_WALL) continue;
      const wx = grid.cellCenterX(grid.cellXOf(i));
      const wy = grid.cellCenterY(grid.cellYOf(i));
      if (Math.hypot(wx - x, wy - y) < 6) {
        expect(grid.hasLineOfSight(x, y, wx, wy)).toBe(false);
        blockedFound = true;
      }
    }
    expect(blockedFound).toBe(true);
  });

  it('terminates for degenerate rays', () => {
    const map = generate(13);
    const { grid } = map;
    expect(() => grid.hasLineOfSight(-500, -500, 5000, 5000)).not.toThrow();
  });
});
