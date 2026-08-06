/**
 * M4: what the generator must guarantee once it stamps authored rooms.
 *
 * The expensive lesson behind this file: a prefab whose door opens into its own
 * dividing wall stamps cleanly, then makes the connectivity pass delete the
 * fragment around it. Nothing about that is visible in a unit test of the
 * prefab alone, so these tests check the *generated map* instead.
 */

import { describe, expect, it } from 'vitest';
import { RandomStreams } from '@/core/math/random';
import { generateMap, type GeneratedMap } from './mapGenerator';
import { CELL_DOOR, CELL_WALL, DOOR_LOCKED } from './mapGrid';

const SEEDS = [1, 7, 42, 101, 512, 2048, 5001, 90210];

function mapFor(seed: number): GeneratedMap {
  return generateMap(new RandomStreams(seed).map, {});
}

describe('fragment generation with prefabs', () => {
  it('keeps the map open and playable on every seed', () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      let open = 0;
      for (const cell of map.grid.cells) {
        if (cell !== CELL_WALL) open++;
      }
      // A map that collapsed to a single sealed room is the exact failure this
      // suite exists to catch, so the bar is a real, walkable space.
      expect(open, `seed ${seed} produced only ${open} open cells`).toBeGreaterThan(400);
      expect(map.enemies.length, `seed ${seed}`).toBeGreaterThan(0);
      expect(map.containers.length, `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  it('stamps authored rooms and their anchors', () => {
    let withPrefabs = 0;
    let withCover = 0;
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      if (map.prefabs.length > 0) withPrefabs++;
      if (map.coverPoints.length > 0) withCover++;
    }
    expect(withPrefabs).toBe(SEEDS.length);
    expect(withCover).toBe(SEEDS.length);
  });

  it('never places a cover point or container inside geometry', () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      for (const point of map.coverPoints) {
        expect(map.grid.isWallAtWorld(point.x, point.y), `seed ${seed} cover in a wall`).toBe(false);
      }
      for (const container of map.containers) {
        const cx = map.grid.worldToCellX(container.x);
        const cy = map.grid.worldToCellY(container.y);
        expect(map.grid.get(cx, cy)).not.toBe(CELL_WALL);
        // A container standing in a doorway is a permanently blocked door.
        expect(map.grid.get(cx, cy)).not.toBe(CELL_DOOR);
      }
    }
  });

  it('marks every door cell as a doorway in the grid', () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      for (const door of map.doors) {
        expect(map.grid.get(door.cx, door.cy), `seed ${seed}`).toBe(CELL_DOOR);
        expect(map.grid.isDoor(door.cx, door.cy)).toBe(true);
        // A door must lead somewhere: at least one walkable neighbour on the
        // grid, otherwise it is decoration in a wall.
        const neighbours = [
          map.grid.isOpen(door.cx + 1, door.cy),
          map.grid.isOpen(door.cx - 1, door.cy),
          map.grid.isOpen(door.cx, door.cy + 1),
          map.grid.isOpen(door.cx, door.cy - 1),
        ].filter(Boolean).length;
        expect(neighbours, `door at ${door.cx},${door.cy} on seed ${seed}`).toBeGreaterThan(0);
      }
    }
  });

  it('always hides a key for every locked door, outside the room it opens', () => {
    let lockedSeen = 0;

    for (let seed = 0; seed < 120; seed++) {
      const map = mapFor(seed);
      const locked = map.doors.filter((door) => door.locked);
      if (locked.length === 0) continue;
      lockedSeen += locked.length;

      for (const door of locked) {
        expect(door.keyItemId).toBeTruthy();
        expect(map.grid.doorAt(door.cx, door.cy)).toBe(DOOR_LOCKED);

        const holder = map.containers.find((container) =>
          container.guaranteed?.some((entry) => entry.itemId === door.keyItemId),
        );
        expect(holder, `no key for ${door.keyItemId} on seed ${seed}`).toBeDefined();

        // The key must not be inside the room it unlocks, or the vault can
        // never be opened at all.
        const distance = Math.hypot((holder?.x ?? 0) - door.x, (holder?.y ?? 0) - door.y);
        expect(distance, `key next to its own door on seed ${seed}`).toBeGreaterThan(6);
      }
    }

    expect(lockedSeen, 'no seed in 120 produced a vault').toBeGreaterThan(0);
  });

  it('is deterministic, prefabs and weather included', () => {
    for (const seed of SEEDS) {
      const a = mapFor(seed);
      const b = mapFor(seed);
      expect(a.weather.id).toBe(b.weather.id);
      expect(a.prefabs.map((p) => `${p.prefabId}@${p.minCx},${p.minCy}`)).toEqual(
        b.prefabs.map((p) => `${p.prefabId}@${p.minCx},${p.minCy}`),
      );
      expect(a.doors.length).toBe(b.doors.length);
      expect(a.coverPoints).toEqual(b.coverPoints);
    }
  });
});

describe('weather', () => {
  it('varies across seeds without ever being invalid', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const map = mapFor(seed);
      expect(map.weather.visionMultiplier).toBeGreaterThan(0);
      expect(map.weather.hearingMultiplier).toBeGreaterThan(0);
      expect(map.weather.lightMultiplier).toBeGreaterThan(0);
      seen.add(map.weather.id);
    }
    // Not every raid should look the same, and none should be impossible.
    expect(seen.size).toBeGreaterThan(2);
  });
});
