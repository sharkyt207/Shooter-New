/**
 * Hand-authored room prefabs.
 *
 * ADR-011 promised a hybrid: procedural composition of *authored* pieces. M1
 * shipped only the procedural half, and it shows — scattered wall blocks make
 * space, but they never make a *place*. Nobody remembers a random rectangle.
 *
 * A prefab is a small grid of characters stamped into a fragment. It carries
 * its own doors, loot anchors, cover and enemy posts, so a room arrives as a
 * complete idea rather than as geometry the spawner has to guess about.
 *
 * Legend:
 *   #  wall
 *   .  floor
 *   D  door (closed, unlocked)
 *   +  locked door - needs the room's key
 *   L  loot anchor
 *   V  vault loot anchor (only in locked rooms)
 *   C  cover post, for the AI
 *   E  enemy post
 *   A  anomaly anchor
 *
 * Every prefab must be enterable from outside, or the connectivity pass will
 * simply seal it off again.
 */

import type { BiomeId } from './biomes';

export type PrefabTier = 'common' | 'high' | 'vault';

export interface RoomPrefab {
  id: string;
  name: string;
  /** Rows of equal length. Width and height are derived from this. */
  layout: readonly string[];
  /** Biomes this room fits. Empty means "anywhere". */
  biomes: readonly BiomeId[];
  weight: number;
  tier: PrefabTier;
  /** Item that opens the `+` doors of this room, if it has any. */
  keyItemId?: string;
}

export const ROOM_PREFABS = {
  /** A plain storage bay: cover, a little loot, one way in. */
  pf_storage: {
    id: 'pf_storage',
    name: 'Lagerbucht',
    layout: [
      '#######',
      '#L...L#',
      '#.C.C.#',
      '#..E..#',
      '#.C.C.#',
      '###D###',
    ],
    biomes: [],
    weight: 10,
    tier: 'common',
  },

  /** Two chambers with an interior door - a genuine "what's behind it" moment. */
  pf_double_chamber: {
    id: 'pf_double_chamber',
    name: 'Doppelkammer',
    layout: [
      '#########',
      '#L.C#C.L#',
      '#...D...#',
      '#.E.#.E.#',
      '#C..#..C#',
      '##D###D##',
    ],
    biomes: [],
    weight: 7,
    tier: 'common',
  },

  /** A corridor junction. Cover on both sides, nothing to take. */
  pf_junction: {
    id: 'pf_junction',
    name: 'Kreuzung',
    layout: [
      '###D###',
      '#C...C#',
      'D.....D',
      '#C.E.C#',
      '###D###',
    ],
    biomes: [],
    weight: 8,
    tier: 'common',
  },

  /** Medical wing. Better loot, and the Order tends to be there. */
  pf_medbay: {
    id: 'pf_medbay',
    name: 'Sanitätsflügel',
    layout: [
      '#########',
      '#L.....L#',
      '#.C...C.#',
      '#...E...#',
      '#L.C.C.L#',
      '####D####',
    ],
    biomes: ['biome_lab'],
    weight: 6,
    tier: 'high',
  },

  /**
   * A locked vault.
   *
   * The key lies somewhere else in the raid, so a vault is a reason to keep
   * exploring rather than a reward for walking into the right room.
   */
  pf_vault: {
    id: 'pf_vault',
    name: 'Sicherheitskammer',
    layout: [
      '#######',
      '#V...V#',
      '#..E..#',
      '#V...V#',
      '###+###',
    ],
    biomes: [],
    weight: 3,
    tier: 'vault',
    keyItemId: 'itm_key_vault',
  },

  /** An anomaly containment cell. High reward, obvious danger. */
  pf_containment: {
    id: 'pf_containment',
    name: 'Eindämmungszelle',
    layout: [
      '#########',
      '#C.....C#',
      '#...A...#',
      '#L..A..L#',
      '#C.....C#',
      '####D####',
    ],
    biomes: ['biome_lab', 'biome_terminal'],
    weight: 4,
    tier: 'high',
  },

  /** An open clearing: cover only at the edges, nowhere to hide in the middle. */
  pf_clearing: {
    id: 'pf_clearing',
    name: 'Lichtung',
    layout: [
      '#.C...C.#',
      '........D',
      'C...L...C',
      'D.......#',
      '#.C.E.C.#',
    ],
    biomes: ['biome_forest'],
    weight: 6,
    tier: 'common',
  },

  /** Cargo racks: long sight lines broken by tall shelving. */
  pf_cargo: {
    id: 'pf_cargo',
    name: 'Frachtregale',
    layout: [
      '#########',
      'D.C###C.D',
      '#.L###L.#',
      '#...E...#',
      '#.L###L.#',
      '#.C###C.#',
      '#D#####D#',
    ],
    biomes: ['biome_terminal'],
    weight: 6,
    tier: 'high',
  },
} as const satisfies Record<string, RoomPrefab>;

export type PrefabId = keyof typeof ROOM_PREFABS;

export const ALL_PREFAB_IDS = Object.keys(ROOM_PREFABS) as PrefabId[];

export function getPrefab(id: PrefabId): RoomPrefab {
  return ROOM_PREFABS[id];
}

export function findPrefab(id: string): RoomPrefab | undefined {
  return (ROOM_PREFABS as Record<string, RoomPrefab>)[id];
}

export function prefabWidth(prefab: RoomPrefab): number {
  return prefab.layout[0]?.length ?? 0;
}

export function prefabHeight(prefab: RoomPrefab): number {
  return prefab.layout.length;
}

/** Prefabs that may be stamped into a given biome. */
export function prefabsForBiome(biomeId: BiomeId): RoomPrefab[] {
  return ALL_PREFAB_IDS.map((id) => ROOM_PREFABS[id]).filter(
    (prefab) => prefab.biomes.length === 0 || (prefab.biomes as readonly string[]).includes(biomeId),
  );
}

/**
 * Validate every prefab at module load.
 *
 * A ragged layout or a sealed room is a content bug that would otherwise
 * surface as a silently unreachable part of a map - the worst kind, because the
 * player never learns they missed something.
 */
export function validatePrefabs(): string[] {
  const problems: string[] = [];

  for (const id of ALL_PREFAB_IDS) {
    // Read through the interface, not the narrowed literal type, so optional
    // fields and empty layouts are actually checkable.
    const prefab: RoomPrefab = ROOM_PREFABS[id];
    const width = prefabWidth(prefab);

    if (width === 0 || prefab.layout.length === 0) {
      problems.push(`${id}: empty layout`);
      continue;
    }
    for (const [index, row] of prefab.layout.entries()) {
      if (row.length !== width) {
        problems.push(`${id}: row ${index} has length ${row.length}, expected ${width}`);
      }
    }

    const flat = prefab.layout.join('');
    if (!/[D+]/.test(flat)) problems.push(`${id}: no door, the room would be sealed`);
    problems.push(...checkReachability(prefab));
    if (prefab.tier === 'vault' && !prefab.keyItemId) {
      problems.push(`${id}: vault without a key item`);
    }
    if (/\+/.test(flat) && !prefab.keyItemId) {
      problems.push(`${id}: locked door without a key item`);
    }
    if (/V/.test(flat) && prefab.tier !== 'vault') {
      problems.push(`${id}: vault loot outside a vault room`);
    }
  }

  return problems;
}

/**
 * Every door must open into the room, and every part of the room must be
 * reachable from a door.
 *
 * This is not theory. The first draft of `pf_double_chamber` put its exterior
 * door directly beneath the interior dividing wall: the room looked correct,
 * stamped correctly, and then the map's connectivity pass quietly deleted the
 * entire fragment around it, because nothing could ever reach the rest of the
 * map from inside. A sealed room is invisible in the layout string and obvious
 * here, which is exactly the kind of bug that belongs in a validator.
 */
export function checkReachability(prefab: RoomPrefab): string[] {
  const problems: string[] = [];
  const width = prefabWidth(prefab);
  const height = prefabHeight(prefab);
  const at = (cx: number, cy: number): string =>
    cx < 0 || cy < 0 || cx >= width || cy >= height ? '#' : ((prefab.layout[cy] as string)[cx] as string);

  const walkable = (cx: number, cy: number): boolean => at(cx, cy) !== '#';

  const doors: Array<{ cx: number; cy: number }> = [];
  for (let cy = 0; cy < height; cy++) {
    for (let cx = 0; cx < width; cx++) {
      const symbol = at(cx, cy);
      if (symbol === 'D' || symbol === '+') doors.push({ cx, cy });
    }
  }

  // A door needs floor on the inside, or it opens into masonry.
  for (const door of doors) {
    const inside =
      (walkable(door.cx + 1, door.cy) && at(door.cx + 1, door.cy) !== 'D') ||
      (walkable(door.cx - 1, door.cy) && at(door.cx - 1, door.cy) !== 'D') ||
      (walkable(door.cx, door.cy + 1) && at(door.cx, door.cy + 1) !== 'D') ||
      (walkable(door.cx, door.cy - 1) && at(door.cx, door.cy - 1) !== 'D');
    if (!inside) {
      problems.push(`${prefab.id}: door at ${door.cx},${door.cy} opens into a wall`);
    }
  }

  if (doors.length === 0) return problems;

  // Flood the walkable cells from every door; anything left over is a pocket
  // the player could see through a gap and never enter.
  const seen = new Uint8Array(width * height);
  const queue: number[] = [];
  for (const door of doors) {
    const index = door.cy * width + door.cx;
    if (seen[index] === 1) continue;
    seen[index] = 1;
    queue.push(index);
  }

  for (let head = 0; head < queue.length; head++) {
    const index = queue[head] as number;
    const cx = index % width;
    const cy = (index - cx) / width;
    const neighbours = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ] as const;
    for (const [nx, ny] of neighbours) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (seen[ni] === 1 || !walkable(nx, ny)) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }

  for (let cy = 0; cy < height; cy++) {
    for (let cx = 0; cx < width; cx++) {
      if (walkable(cx, cy) && seen[cy * width + cx] !== 1) {
        problems.push(`${prefab.id}: cell ${cx},${cy} is walled off from every door`);
      }
    }
  }

  return problems;
}
