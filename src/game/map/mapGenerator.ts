/**
 * Procedural fragment composition (ADR-011).
 *
 * A raid map is a chain of biome fragments joined by seam corridors - the
 * mechanical expression of the setting: an Echo rift stitches pieces of
 * different worlds together, so no two raids are the same (Pillar P2).
 *
 * Generation is fully deterministic: the same seed always produces the same
 * map, down to the last container.
 *
 * M4 completes the hybrid ADR-011 promised. Until now only the procedural half
 * existed, and it showed: scattered wall blocks make *space*, but they never
 * make a *place*, and nobody remembers a random rectangle. Hand-authored room
 * prefabs are now stamped into the noise, and they bring their own doors, loot
 * anchors, cover and enemy posts - so a room arrives as a complete idea instead
 * of as geometry the spawner has to guess about.
 *
 * Pipeline:
 *   1. Lay fragments out on a coarse lattice (right/down walk)
 *   2. Carve each fragment: open area, then scattered wall blocks
 *   3. Stamp hand-authored room prefabs, collecting their anchors
 *   4. Carve seam corridors between consecutive fragments
 *   5. Flood fill and seal off anything unreachable - guarantees a playable map
 *   6. Place spawn, extractions, containers, enemies, anomalies and keys
 *   7. Roll the weather
 */

import { MAP, RAID } from '@/content/balance';
import { ANOMALY_WEIGHTS, getAnomaly, type AnomalyKind } from '@/content/anomalies';
import { ALL_BIOME_IDS, getBiome, type BiomeId } from '@/content/biomes';
import {
  prefabHeight,
  prefabWidth,
  prefabsForBiome,
  type RoomPrefab,
} from '@/content/prefabs';
import { ALL_WEATHER_IDS, getWeather, type WeatherDef } from '@/content/weather';
import type { SeededRandom } from '@/core/math/random';
import {
  CELL_DOOR,
  CELL_OPEN,
  CELL_SEAM,
  CELL_WALL,
  DOOR_CLOSED,
  DOOR_LOCKED,
  MapGrid,
} from './mapGrid';

/** Cells of empty space reserved between two fragments for the seam. */
const SEAM_GAP_CELLS = 6;
/** Half-width of a seam corridor, in cells. */
const SEAM_HALF_WIDTH = 2;
/** Border thickness of a fragment, in cells. */
const FRAGMENT_BORDER = 1;

export interface FragmentInfo {
  index: number;
  biomeId: BiomeId;
  /** Cell-space bounds, inclusive of the border. */
  minCx: number;
  minCy: number;
  maxCx: number;
  maxCy: number;
}

export interface SpawnPoint {
  x: number;
  y: number;
}

export interface ContainerSpawn {
  containerId: string;
  x: number;
  y: number;
  /**
   * Items this container is guaranteed to hold on top of its rolled loot.
   * Used for keycards: a key that depends on a loot roll is a key that
   * sometimes does not exist, and a vault nobody can ever open.
   */
  guaranteed?: Array<{ itemId: string; quantity: number }>;
}

export interface EnemySpawn {
  enemyId: string;
  x: number;
  y: number;
  /** Bosses are placed deliberately and never grouped into ordinary squads. */
  isBoss?: boolean;
}

export interface AnomalySpawn {
  kind: AnomalyKind;
  x: number;
  y: number;
  radius: number;
}

export interface DoorSpawn {
  cx: number;
  cy: number;
  x: number;
  y: number;
  locked: boolean;
  keyItemId: string | null;
}

export interface CoverPoint {
  x: number;
  y: number;
}

/** A prefab actually stamped into the map, for debugging and the briefing. */
export interface PlacedPrefab {
  prefabId: string;
  name: string;
  fragmentIndex: number;
  minCx: number;
  minCy: number;
  width: number;
  height: number;
}

export interface ExtractionSpawn {
  zoneId: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  opensAtTick: number;
  closesAtTick: number;
}

export interface GeneratedMap {
  grid: MapGrid;
  fragments: FragmentInfo[];
  playerSpawn: SpawnPoint;
  containers: ContainerSpawn[];
  enemies: EnemySpawn[];
  anomalies: AnomalySpawn[];
  extractions: ExtractionSpawn[];
  doors: DoorSpawn[];
  /** Cover positions authored into the room prefabs; used by the squad AI. */
  coverPoints: CoverPoint[];
  prefabs: PlacedPrefab[];
  /** Weather for this raid. Fixed at generation time, from the seed. */
  weather: WeatherDef;
  /** Biome mix, for the briefing screen. */
  biomeNames: string[];
}

/** Everything a stamped prefab contributes to the population pass. */
interface PrefabAnchors {
  loot: number[];
  vaultLoot: number[];
  cover: number[];
  enemies: number[];
  anomalies: number[];
  doors: DoorSpawn[];
  placed: PlacedPrefab[];
  /** Keys that must be findable somewhere else on the map. */
  keyItemIds: string[];
}

export interface MapGenOptions {
  fragmentCount?: number;
  /** Force a specific biome order. Random when omitted. */
  biomeIds?: BiomeId[];
}

const EXTRACTION_NAMES = ['Nahtzone Nord', 'Bergungspunkt Ost', 'Riss-Ausgang Süd', 'Notausstieg West'];

export function generateMap(
  rng: SeededRandom,
  options: MapGenOptions = {},
): GeneratedMap {
  const fragmentCount = options.fragmentCount ?? MAP.fragmentCount;
  const biomeIds = options.biomeIds ?? pickBiomes(rng, fragmentCount);

  // ── 1. Lattice layout ────────────────────────────────────────────────────
  const stride = MAP.fragmentCells + SEAM_GAP_CELLS;
  const lattice = walkLattice(rng, fragmentCount);
  const maxLx = Math.max(...lattice.map((p) => p.lx));
  const maxLy = Math.max(...lattice.map((p) => p.ly));

  const grid = new MapGrid(
    (maxLx + 1) * stride - SEAM_GAP_CELLS + 2,
    (maxLy + 1) * stride - SEAM_GAP_CELLS + 2,
    MAP.cellSize,
  );

  const fragments: FragmentInfo[] = lattice.map((pos, index) => ({
    index,
    biomeId: biomeIds[index] ?? (biomeIds[0] as BiomeId),
    minCx: pos.lx * stride + 1,
    minCy: pos.ly * stride + 1,
    maxCx: pos.lx * stride + MAP.fragmentCells,
    maxCy: pos.ly * stride + MAP.fragmentCells,
  }));

  // ── 2. Carve fragments ───────────────────────────────────────────────────
  for (const fragment of fragments) {
    carveFragment(grid, fragment, rng);
  }

  // ── 3. Stamp room prefabs ────────────────────────────────────────────────
  const anchors: PrefabAnchors = {
    loot: [],
    vaultLoot: [],
    cover: [],
    enemies: [],
    anomalies: [],
    doors: [],
    placed: [],
    keyItemIds: [],
  };
  for (const fragment of fragments) {
    stampPrefabs(grid, fragment, rng, anchors);
  }

  // ── 4. Carve seams ───────────────────────────────────────────────────────
  for (let i = 1; i < fragments.length; i++) {
    carveSeam(grid, fragments[i - 1] as FragmentInfo, fragments[i] as FragmentInfo);
  }

  // ── 5. Guarantee connectivity ────────────────────────────────────────────
  // Doors count as passable here, so a vault is never sealed off by the very
  // pass that is supposed to keep the map playable.
  const anchor = findAnchorCell(grid, fragments[0] as FragmentInfo);
  const reachable = grid.floodFill(anchor);
  for (let i = 0; i < grid.cells.length; i++) {
    if (grid.cells[i] !== CELL_WALL && reachable[i] !== 1) {
      grid.cells[i] = CELL_WALL;
      grid.fragmentOf[i] = -1;
      grid.doorOf[i] = 0;
    }
  }
  const doors = anchors.doors.filter((door) => grid.isDoor(door.cx, door.cy));

  // ── 6. Populate ──────────────────────────────────────────────────────────
  const openByFragment = groupOpenCellsByFragment(grid, fragments.length);
  const survives = (index: number): boolean => grid.cells[index] !== CELL_WALL;

  const playerSpawn = pickPlayerSpawn(grid, openByFragment[0] ?? [], rng);
  const extractions = placeExtractions(grid, fragments, openByFragment, playerSpawn, rng);
  const containers = placeContainers(
    grid,
    fragments,
    openByFragment,
    anchors.loot.filter(survives),
    anchors.vaultLoot.filter(survives),
    rng,
  );
  const enemies = placeEnemies(
    grid,
    fragments,
    openByFragment,
    anchors.enemies.filter(survives),
    playerSpawn,
    rng,
  );
  const anomalies = placeAnomalies(
    grid,
    fragments,
    openByFragment,
    anchors.anomalies.filter(survives),
    rng,
  );
  placeWarden(grid, fragments, openByFragment, playerSpawn, enemies, rng);
  placeKeys(anchors.keyItemIds, doors, containers, rng);

  return {
    grid,
    fragments,
    playerSpawn,
    containers,
    enemies,
    anomalies,
    extractions,
    doors,
    coverPoints: anchors.cover.filter(survives).map((index) => cellToWorld(grid, index)),
    prefabs: anchors.placed,
    weather: pickWeather(rng),
    biomeNames: fragments.map((f) => getBiome(f.biomeId).name),
  };
}

/**
 * Weather for the raid.
 *
 * One dial that turns the same map into a different problem: how far anyone
 * sees, how far sound carries, how dark it is. Never purely bad - fog hides the
 * player exactly as well as it hides everyone else.
 */
function pickWeather(rng: SeededRandom): WeatherDef {
  const table = ALL_WEATHER_IDS.map((id) => getWeather(id));
  return rng.pickWeighted(table, (entry) => entry.weight) ?? (table[0] as WeatherDef);
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────

function pickBiomes(rng: SeededRandom, count: number): BiomeId[] {
  const pool = [...ALL_BIOME_IDS];
  const result: BiomeId[] = [];
  for (let i = 0; i < count; i++) {
    // Reshuffle whenever the pool runs dry so adjacent fragments rarely repeat.
    if (pool.length === 0) pool.push(...ALL_BIOME_IDS);
    const index = rng.int(0, pool.length - 1);
    result.push(pool[index] as BiomeId);
    pool.splice(index, 1);
  }
  return result;
}

/** Walk right or down, producing an L-shaped or straight chain of fragments. */
function walkLattice(rng: SeededRandom, count: number): Array<{ lx: number; ly: number }> {
  const positions: Array<{ lx: number; ly: number }> = [{ lx: 0, ly: 0 }];
  let lx = 0;
  let ly = 0;
  for (let i = 1; i < count; i++) {
    if (rng.chance(0.6)) lx++;
    else ly++;
    positions.push({ lx, ly });
  }
  return positions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Carving
// ─────────────────────────────────────────────────────────────────────────────

function carveFragment(grid: MapGrid, fragment: FragmentInfo, rng: SeededRandom): void {
  const biome = getBiome(fragment.biomeId);

  // Open the interior, keeping a solid border.
  for (let cy = fragment.minCy + FRAGMENT_BORDER; cy <= fragment.maxCy - FRAGMENT_BORDER; cy++) {
    for (let cx = fragment.minCx + FRAGMENT_BORDER; cx <= fragment.maxCx - FRAGMENT_BORDER; cx++) {
      grid.set(cx, cy, CELL_OPEN, fragment.index);
    }
  }

  // Scatter rectangular wall blocks for cover and sightline breaks. Blocks read
  // far better in isometric view than single-cell noise, and they give the AI
  // something meaningful to lose line of sight behind.
  const interiorW = fragment.maxCx - fragment.minCx - 2 * FRAGMENT_BORDER + 1;
  const interiorH = fragment.maxCy - fragment.minCy - 2 * FRAGMENT_BORDER + 1;
  const interiorArea = interiorW * interiorH;
  const targetWallCells = Math.floor(interiorArea * biome.wallDensity);

  let placed = 0;
  let attempts = 0;
  const maxAttempts = targetWallCells * 4 + 40;

  while (placed < targetWallCells && attempts < maxAttempts) {
    attempts++;
    const w = rng.int(1, 4);
    const h = rng.int(1, 4);
    // Keep a 2-cell margin from the border so seam entries stay reachable.
    const cx = rng.int(fragment.minCx + FRAGMENT_BORDER + 1, fragment.maxCx - FRAGMENT_BORDER - w - 1);
    const cy = rng.int(fragment.minCy + FRAGMENT_BORDER + 1, fragment.maxCy - FRAGMENT_BORDER - h - 1);

    for (let y = cy; y < cy + h; y++) {
      for (let x = cx; x < cx + w; x++) {
        if (grid.get(x, y) === CELL_OPEN) {
          grid.set(x, y, CELL_WALL, -1);
          placed++;
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Room prefabs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stamp one to three hand-authored rooms into a fragment.
 *
 * The margin around each room is cleared to floor before stamping. That is not
 * cosmetic: it guarantees every door opens onto walkable space, which is the
 * difference between a room and a sealed box the connectivity pass deletes.
 */
function stampPrefabs(
  grid: MapGrid,
  fragment: FragmentInfo,
  rng: SeededRandom,
  anchors: PrefabAnchors,
): void {
  const candidates = prefabsForBiome(fragment.biomeId);
  if (candidates.length === 0) return;

  const margin = MAP.prefabMargin;
  const count = rng.int(MAP.prefabsPerFragment.min, MAP.prefabsPerFragment.max);
  const taken: Array<{ minCx: number; minCy: number; maxCx: number; maxCy: number }> = [];

  for (let i = 0; i < count; i++) {
    const prefab = rng.pickWeighted(candidates, (entry) => entry.weight);
    if (!prefab) continue;

    const width = prefabWidth(prefab);
    const height = prefabHeight(prefab);

    const minCx = fragment.minCx + FRAGMENT_BORDER + margin;
    const minCy = fragment.minCy + FRAGMENT_BORDER + margin;
    const maxCx = fragment.maxCx - FRAGMENT_BORDER - margin - width + 1;
    const maxCy = fragment.maxCy - FRAGMENT_BORDER - margin - height + 1;
    if (maxCx < minCx || maxCy < minCy) continue;

    let placedAt: { cx: number; cy: number } | null = null;
    for (let attempt = 0; attempt < 24; attempt++) {
      const cx = rng.int(minCx, maxCx);
      const cy = rng.int(minCy, maxCy);
      const box = { minCx: cx, minCy: cy, maxCx: cx + width - 1, maxCy: cy + height - 1 };

      // Keep a full margin between rooms, so two prefabs never share a wall and
      // the space between them stays walkable.
      const overlaps = taken.some(
        (other) =>
          box.minCx <= other.maxCx + margin &&
          box.maxCx >= other.minCx - margin &&
          box.minCy <= other.maxCy + margin &&
          box.maxCy >= other.minCy - margin,
      );
      if (overlaps) continue;

      taken.push(box);
      placedAt = { cx, cy };
      break;
    }
    if (!placedAt) continue;

    stampOne(grid, fragment, prefab, placedAt.cx, placedAt.cy, margin, anchors);
  }
}

function stampOne(
  grid: MapGrid,
  fragment: FragmentInfo,
  prefab: RoomPrefab,
  originCx: number,
  originCy: number,
  margin: number,
  anchors: PrefabAnchors,
): void {
  const width = prefabWidth(prefab);
  const height = prefabHeight(prefab);

  // Clear the approach first: whatever the wall scatter left around this spot
  // would otherwise be free to seal the door we are about to place.
  for (let cy = originCy - margin; cy < originCy + height + margin; cy++) {
    for (let cx = originCx - margin; cx < originCx + width + margin; cx++) {
      if (!grid.inBounds(cx, cy)) continue;
      if (cx < fragment.minCx + FRAGMENT_BORDER || cx > fragment.maxCx - FRAGMENT_BORDER) continue;
      if (cy < fragment.minCy + FRAGMENT_BORDER || cy > fragment.maxCy - FRAGMENT_BORDER) continue;
      grid.set(cx, cy, CELL_OPEN, fragment.index);
    }
  }

  let hasLockedDoor = false;

  for (let row = 0; row < height; row++) {
    const line = prefab.layout[row] as string;
    for (let col = 0; col < width; col++) {
      const cx = originCx + col;
      const cy = originCy + row;
      const symbol = line[col] as string;
      const index = grid.index(cx, cy);

      switch (symbol) {
        case '#':
          grid.set(cx, cy, CELL_WALL, -1);
          break;

        case 'D':
          grid.setDoor(cx, cy, DOOR_CLOSED, fragment.index);
          anchors.doors.push({
            cx,
            cy,
            x: grid.cellCenterX(cx),
            y: grid.cellCenterY(cy),
            locked: false,
            keyItemId: null,
          });
          break;

        case '+':
          grid.setDoor(cx, cy, DOOR_LOCKED, fragment.index);
          anchors.doors.push({
            cx,
            cy,
            x: grid.cellCenterX(cx),
            y: grid.cellCenterY(cy),
            locked: true,
            keyItemId: prefab.keyItemId ?? null,
          });
          hasLockedDoor = true;
          break;

        case 'L':
          grid.set(cx, cy, CELL_OPEN, fragment.index);
          anchors.loot.push(index);
          break;

        case 'V':
          grid.set(cx, cy, CELL_OPEN, fragment.index);
          anchors.vaultLoot.push(index);
          break;

        case 'C':
          grid.set(cx, cy, CELL_OPEN, fragment.index);
          anchors.cover.push(index);
          break;

        case 'E':
          grid.set(cx, cy, CELL_OPEN, fragment.index);
          anchors.enemies.push(index);
          break;

        case 'A':
          grid.set(cx, cy, CELL_OPEN, fragment.index);
          anchors.anomalies.push(index);
          break;

        default:
          grid.set(cx, cy, CELL_OPEN, fragment.index);
          break;
      }
    }
  }

  if (hasLockedDoor && prefab.keyItemId) anchors.keyItemIds.push(prefab.keyItemId);

  anchors.placed.push({
    prefabId: prefab.id,
    name: prefab.name,
    fragmentIndex: fragment.index,
    minCx: originCx,
    minCy: originCy,
    width,
    height,
  });
}

function carveSeam(grid: MapGrid, from: FragmentInfo, to: FragmentInfo): void {
  const horizontal = to.minCx > from.minCx;

  if (horizontal) {
    const cy = Math.floor((from.minCy + from.maxCy + to.minCy + to.maxCy) / 4);
    for (let cx = from.maxCx - FRAGMENT_BORDER; cx <= to.minCx + FRAGMENT_BORDER; cx++) {
      for (let y = cy - SEAM_HALF_WIDTH; y <= cy + SEAM_HALF_WIDTH; y++) {
        grid.set(cx, y, CELL_SEAM, -1);
      }
    }
  } else {
    const cx = Math.floor((from.minCx + from.maxCx + to.minCx + to.maxCx) / 4);
    for (let cy = from.maxCy - FRAGMENT_BORDER; cy <= to.minCy + FRAGMENT_BORDER; cy++) {
      for (let x = cx - SEAM_HALF_WIDTH; x <= cx + SEAM_HALF_WIDTH; x++) {
        grid.set(x, cy, CELL_SEAM, -1);
      }
    }
  }
}

function findAnchorCell(grid: MapGrid, fragment: FragmentInfo): number {
  const midX = Math.floor((fragment.minCx + fragment.maxCx) / 2);
  const midY = Math.floor((fragment.minCy + fragment.maxCy) / 2);

  // Spiral outward from the centre until an open cell turns up.
  for (let radius = 0; radius < MAP.fragmentCells; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const cx = midX + dx;
        const cy = midY + dy;
        if (grid.isOpen(cx, cy)) return grid.index(cx, cy);
      }
    }
  }
  return grid.index(midX, midY);
}

// ─────────────────────────────────────────────────────────────────────────────
// Population
// ─────────────────────────────────────────────────────────────────────────────

function groupOpenCellsByFragment(grid: MapGrid, fragmentCount: number): number[][] {
  const groups: number[][] = Array.from({ length: fragmentCount }, () => []);
  for (let i = 0; i < grid.cells.length; i++) {
    // Doorways are excluded: anything spawned in one would block the door.
    if (grid.cells[i] === CELL_WALL || grid.cells[i] === CELL_DOOR) continue;
    const fragment = grid.fragmentOf[i] as number;
    if (fragment >= 0 && fragment < fragmentCount) (groups[fragment] as number[]).push(i);
  }
  return groups;
}

/** Split anchor cells by the fragment they ended up in. */
function anchorsByFragment(grid: MapGrid, anchors: number[], fragmentCount: number): number[][] {
  const groups: number[][] = Array.from({ length: fragmentCount }, () => []);
  for (const index of anchors) {
    const fragment = grid.fragmentOf[index] as number;
    if (fragment >= 0 && fragment < fragmentCount) (groups[fragment] as number[]).push(index);
  }
  return groups;
}

/** Take from `pool` while it lasts, then fall back to a random clear cell. */
function takeAnchorOrRandom(
  grid: MapGrid,
  pool: number[],
  cells: number[],
  rng: SeededRandom,
): number | null {
  const anchor = pool.pop();
  if (anchor !== undefined) return anchor;
  return pickClearCell(grid, cells, rng);
}

function cellToWorld(grid: MapGrid, index: number): SpawnPoint {
  return {
    x: grid.cellCenterX(grid.cellXOf(index)),
    y: grid.cellCenterY(grid.cellYOf(index)),
  };
}

/**
 * Reject cells whose neighbours are walls: an actor with a real radius would
 * be stuck in the corner. Cheap, and it eliminates a whole class of bugs.
 */
function hasClearance(grid: MapGrid, index: number): boolean {
  const cx = grid.cellXOf(index);
  const cy = grid.cellYOf(index);
  return (
    grid.isOpen(cx + 1, cy) &&
    grid.isOpen(cx - 1, cy) &&
    grid.isOpen(cx, cy + 1) &&
    grid.isOpen(cx, cy - 1)
  );
}

function pickClearCell(grid: MapGrid, cells: number[], rng: SeededRandom): number | null {
  if (cells.length === 0) return null;
  for (let attempt = 0; attempt < 32; attempt++) {
    const index = cells[rng.int(0, cells.length - 1)] as number;
    if (hasClearance(grid, index)) return index;
  }
  return cells[rng.int(0, cells.length - 1)] as number;
}

function pickPlayerSpawn(grid: MapGrid, cells: number[], rng: SeededRandom): SpawnPoint {
  const index = pickClearCell(grid, cells, rng);
  if (index === null) return { x: grid.worldWidth / 2, y: grid.worldHeight / 2 };
  return cellToWorld(grid, index);
}

function placeExtractions(
  grid: MapGrid,
  fragments: FragmentInfo[],
  openByFragment: number[][],
  spawn: SpawnPoint,
  rng: SeededRandom,
): ExtractionSpawn[] {
  const zones: ExtractionSpawn[] = [];
  const minDistSq = RAID.minSpawnToExtractionDistance ** 2;

  // One zone per fragment, opening later the further it sits from the spawn.
  // That is the core risk decision: the safe exit closes, the far one opens.
  const order = fragments.map((f) => f.index).sort((a, b) => b - a);

  for (let slot = 0; slot < order.length; slot++) {
    const fragmentIndex = order[slot] as number;
    const cells = openByFragment[fragmentIndex] ?? [];
    if (cells.length === 0) continue;

    let chosen: number | null = null;
    for (let attempt = 0; attempt < 48; attempt++) {
      const candidate = pickClearCell(grid, cells, rng);
      if (candidate === null) break;
      const p = cellToWorld(grid, candidate);
      const dx = p.x - spawn.x;
      const dy = p.y - spawn.y;
      if (dx * dx + dy * dy >= minDistSq) {
        chosen = candidate;
        break;
      }
      chosen ??= candidate;
    }
    if (chosen === null) continue;

    const position = cellToWorld(grid, chosen);
    const opensAtSeconds = RAID.firstExtractionAtSeconds + slot * RAID.extractionIntervalSeconds;
    const closesAtSeconds = Math.min(
      opensAtSeconds + RAID.extractionOpenSeconds,
      RAID.durationSeconds,
    );

    zones.push({
      zoneId: `zone_${slot}`,
      name: EXTRACTION_NAMES[slot % EXTRACTION_NAMES.length] as string,
      x: position.x,
      y: position.y,
      radius: RAID.extractionRadius,
      opensAtTick: Math.round(opensAtSeconds * 60),
      closesAtTick: Math.round(closesAtSeconds * 60),
    });
  }

  return zones;
}

/**
 * Containers, authored anchors first.
 *
 * A prefab's loot anchors are used before the random scatter, so the rooms the
 * player can actually recognise are the rooms worth entering. Vault anchors
 * always get the best container in the game - that is the whole reason to go
 * looking for the key.
 */
function placeContainers(
  grid: MapGrid,
  fragments: FragmentInfo[],
  openByFragment: number[][],
  lootAnchors: number[],
  vaultAnchors: number[],
  rng: SeededRandom,
): ContainerSpawn[] {
  const spawns: ContainerSpawn[] = [];
  const cellArea = grid.cellSize * grid.cellSize;
  const anchorsPerFragment = anchorsByFragment(grid, lootAnchors, fragments.length);

  for (const vault of vaultAnchors) {
    const position = cellToWorld(grid, vault);
    spawns.push({ containerId: 'cnt_echo_cache', x: position.x, y: position.y });
  }

  for (const fragment of fragments) {
    const biome = getBiome(fragment.biomeId);
    const cells = openByFragment[fragment.index] ?? [];
    const anchorPool = anchorsPerFragment[fragment.index] ?? [];
    const areaSqm = cells.length * cellArea;
    const count = Math.round((areaSqm / 100) * biome.containerDensity);

    const used = new Set<number>();
    for (let i = 0; i < count; i++) {
      const index = takeAnchorOrRandom(grid, anchorPool, cells, rng);
      if (index === null || used.has(index)) continue;
      used.add(index);

      const pick = rng.pickWeighted(biome.containerWeights, (entry) => entry.weight);
      if (!pick) continue;
      const position = cellToWorld(grid, index);
      spawns.push({ containerId: pick.containerId, x: position.x, y: position.y });
    }
  }

  return spawns;
}

/**
 * Hide every vault key in a container far from the door it opens.
 *
 * The key is what turns a locked room from an obstacle into a reason to keep
 * exploring. It is placed as guaranteed container contents rather than as a
 * loot-table entry, because a key that depends on a roll is a vault that
 * sometimes cannot be opened at all.
 */
function placeKeys(
  keyItemIds: string[],
  doors: DoorSpawn[],
  containers: ContainerSpawn[],
  rng: SeededRandom,
): void {
  if (keyItemIds.length === 0 || containers.length === 0) return;

  const taken = new Set<number>();

  for (const keyItemId of keyItemIds) {
    const lock = doors.find((door) => door.keyItemId === keyItemId);
    if (!lock) continue;

    // Furthest-first, then a random pick among the far half: always reachable,
    // never the same locker twice in a row.
    const ranked = containers
      .map((container, index) => ({
        index,
        distance: Math.hypot(container.x - lock.x, container.y - lock.y),
      }))
      .filter((entry) => !taken.has(entry.index))
      .sort((a, b) => b.distance - a.distance);
    if (ranked.length === 0) return;

    const window = Math.max(1, Math.floor(ranked.length / 2));
    const chosen = ranked[rng.int(0, window - 1)] as { index: number };
    taken.add(chosen.index);

    const container = containers[chosen.index] as ContainerSpawn;
    container.guaranteed = [...(container.guaranteed ?? []), { itemId: keyItemId, quantity: 1 }];
  }
}

function placeEnemies(
  grid: MapGrid,
  fragments: FragmentInfo[],
  openByFragment: number[][],
  enemyPosts: number[],
  spawn: SpawnPoint,
  rng: SeededRandom,
): EnemySpawn[] {
  const spawns: EnemySpawn[] = [];
  const cellArea = grid.cellSize * grid.cellSize;
  /** Metres of breathing room around the player's spawn. */
  const safeRadiusSq = 14 * 14;
  const postsPerFragment = anchorsByFragment(grid, enemyPosts, fragments.length);

  for (const fragment of fragments) {
    const biome = getBiome(fragment.biomeId);
    const cells = openByFragment[fragment.index] ?? [];
    // Authored posts first: a room somebody built is a room somebody guards.
    const postPool = postsPerFragment[fragment.index] ?? [];
    const areaSqm = cells.length * cellArea;
    const count = Math.round((areaSqm / 100) * biome.enemyDensity);

    for (let i = 0; i < count; i++) {
      const index = takeAnchorOrRandom(grid, postPool, cells, rng);
      if (index === null) continue;
      const position = cellToWorld(grid, index);

      const dx = position.x - spawn.x;
      const dy = position.y - spawn.y;
      if (dx * dx + dy * dy < safeRadiusSq) continue;

      const pick = rng.pickWeighted(biome.enemyWeights, (entry) => entry.weight);
      if (!pick) continue;
      spawns.push({ enemyId: pick.enemyId, x: position.x, y: position.y });
    }
  }

  return spawns;
}

/**
 * Place a Warden in the fragment furthest from the spawn.
 *
 * Not guaranteed: a boss in every raid would make it routine. When one is
 * there, it sits far from the entrance so meeting it is always a decision to
 * have pushed deep, never an accident on the way in.
 */
function placeWarden(
  grid: MapGrid,
  fragments: FragmentInfo[],
  openByFragment: number[][],
  spawn: SpawnPoint,
  enemies: EnemySpawn[],
  rng: SeededRandom,
): void {
  if (!rng.chance(MAP.wardenChance)) return;

  const lastFragment = fragments[fragments.length - 1];
  if (!lastFragment) return;

  const cells = openByFragment[lastFragment.index] ?? [];
  const minDistSq = 30 * 30;

  for (let attempt = 0; attempt < 40; attempt++) {
    const index = pickClearCell(grid, cells, rng);
    if (index === null) return;

    const position = cellToWorld(grid, index);
    const dx = position.x - spawn.x;
    const dy = position.y - spawn.y;
    if (dx * dx + dy * dy < minDistSq) continue;

    enemies.push({ enemyId: 'enm_warden', x: position.x, y: position.y, isBoss: true });
    return;
  }
}

/**
 * Anomalies: one roll per fragment, plus every containment cell that got
 * stamped - a room built to hold something should have something in it.
 */
function placeAnomalies(
  grid: MapGrid,
  fragments: FragmentInfo[],
  openByFragment: number[][],
  anomalyAnchors: number[],
  rng: SeededRandom,
): AnomalySpawn[] {
  const spawns: AnomalySpawn[] = [];

  for (const index of anomalyAnchors) {
    spawns.push(makeAnomaly(grid, index, rng));
  }

  for (const fragment of fragments) {
    const biome = getBiome(fragment.biomeId);
    if (!rng.chance(biome.anomalyChance)) continue;

    const cells = openByFragment[fragment.index] ?? [];
    const index = pickClearCell(grid, cells, rng);
    if (index === null) continue;

    spawns.push(makeAnomaly(grid, index, rng));
  }

  return spawns;
}

function makeAnomaly(grid: MapGrid, index: number, rng: SeededRandom): AnomalySpawn {
  const pick = rng.pickWeighted(ANOMALY_WEIGHTS, (entry) => entry.weight);
  const kind: AnomalyKind = pick?.kind ?? 'stillness';
  const def = getAnomaly(kind);
  const position = cellToWorld(grid, index);

  return {
    kind,
    x: position.x,
    y: position.y,
    // Vary the radius a little so two of the same kind never read as copies.
    radius: def.radius * rng.range(0.85, 1.15),
  };
}
