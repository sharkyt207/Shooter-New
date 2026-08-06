import { describe, expect, it } from 'vitest';
import {
  ALL_PREFAB_IDS,
  checkReachability,
  getPrefab,
  prefabHeight,
  prefabWidth,
  prefabsForBiome,
  validatePrefabs,
  type RoomPrefab,
} from './prefabs';

describe('room prefabs', () => {
  it('are all structurally valid', () => {
    expect(validatePrefabs()).toEqual([]);
  });

  it('are rectangular', () => {
    for (const id of ALL_PREFAB_IDS) {
      const prefab = getPrefab(id);
      const width = prefabWidth(prefab);
      expect(prefabHeight(prefab)).toBeGreaterThan(0);
      for (const row of prefab.layout) expect(row.length).toBe(width);
    }
  });

  it('offer at least one prefab for every biome', () => {
    for (const biome of ['biome_lab', 'biome_forest', 'biome_terminal'] as const) {
      expect(prefabsForBiome(biome).length).toBeGreaterThan(0);
    }
  });

  it('only put vault loot behind a locked door with a key', () => {
    for (const id of ALL_PREFAB_IDS) {
      const prefab: RoomPrefab = getPrefab(id);
      const flat = prefab.layout.join('');
      if (flat.includes('V')) {
        expect(prefab.tier, `${id}`).toBe('vault');
        expect(prefab.keyItemId, `${id}`).toBeTruthy();
        expect(flat).toContain('+');
      }
    }
  });
});

/**
 * These are the two failure modes that produced a real bug: a door that opens
 * into the room's own dividing wall, and a chamber with no path to any door.
 * Both look perfectly fine in the layout string, and both silently delete a
 * chunk of the map when the generator's connectivity pass runs.
 */
describe('the prefab validator', () => {
  it('catches a door that opens into a wall', () => {
    const broken: RoomPrefab = {
      id: 'test_sealed_door',
      name: 'kaputt',
      layout: [
        '#####',
        '#...#',
        '#####',
        '##D##',
      ],
      biomes: [],
      weight: 1,
      tier: 'common',
    };
    expect(checkReachability(broken).join(' ')).toContain('opens into a wall');
  });

  it('catches a chamber cut off from every door', () => {
    const broken: RoomPrefab = {
      id: 'test_pocket',
      name: 'kaputt',
      layout: [
        '#######',
        '#..#..#',
        '#..#..#',
        '###D###',
      ],
      biomes: [],
      weight: 1,
      tier: 'common',
    };
    // The left chamber has no route to the only door.
    expect(checkReachability(broken).join(' ')).toContain('walled off');
  });

  it('passes a room that is genuinely fine', () => {
    const good: RoomPrefab = {
      id: 'test_ok',
      name: 'gut',
      layout: [
        '#####',
        '#...#',
        '#...#',
        '##D##',
      ],
      biomes: [],
      weight: 1,
      tier: 'common',
    };
    expect(checkReachability(good)).toEqual([]);
  });
});
