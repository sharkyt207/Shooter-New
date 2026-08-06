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
 * Pipeline:
 *   1. Lay fragments out on a coarse lattice (right/down walk)
 *   2. Carve each fragment: open area, then scattered wall blocks
 *   3. Carve seam corridors between consecutive fragments
 *   4. Flood fill and seal off anything unreachable - guarantees a playable map
 *   5. Place spawn, extraction zones, containers, enemies and anomalies
 */

import { MAP, RAID } from '@/content/balance';
import { ALL_BIOME_IDS, getBiome, type BiomeId } from '@/content/biomes';
import type { SeededRandom } from '@/core/math/random';
import { CELL_OPEN, CELL_SEAM, CELL_WALL, MapGrid } from './mapGrid';

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
}

export interface EnemySpawn {
  enemyId: string;
  x: number;
  y: number;
}

export interface AnomalySpawn {
  kind: 'stillness';
  x: number;
  y: number;
  radius: number;
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
  /** Biome mix, for the briefing screen. */
  biomeNames: string[];
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

  // ── 3. Carve seams ───────────────────────────────────────────────────────
  for (let i = 1; i < fragments.length; i++) {
    carveSeam(grid, fragments[i - 1] as FragmentInfo, fragments[i] as FragmentInfo);
  }

  // ── 4. Guarantee connectivity ────────────────────────────────────────────
  const anchor = findAnchorCell(grid, fragments[0] as FragmentInfo);
  const reachable = grid.floodFill(anchor);
  for (let i = 0; i < grid.cells.length; i++) {
    if (grid.cells[i] !== CELL_WALL && reachable[i] !== 1) {
      grid.cells[i] = CELL_WALL;
      grid.fragmentOf[i] = -1;
    }
  }

  // ── 5. Populate ──────────────────────────────────────────────────────────
  const openByFragment = groupOpenCellsByFragment(grid, fragments.length);

  const playerSpawn = pickPlayerSpawn(grid, openByFragment[0] ?? [], rng);
  const extractions = placeExtractions(grid, fragments, openByFragment, playerSpawn, rng);
  const containers = placeContainers(grid, fragments, openByFragment, rng);
  const enemies = placeEnemies(grid, fragments, openByFragment, playerSpawn, rng);
  const anomalies = placeAnomalies(grid, fragments, openByFragment, rng);

  return {
    grid,
    fragments,
    playerSpawn,
    containers,
    enemies,
    anomalies,
    extractions,
    biomeNames: fragments.map((f) => getBiome(f.biomeId).name),
  };
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
    if (grid.cells[i] === CELL_WALL) continue;
    const fragment = grid.fragmentOf[i] as number;
    if (fragment >= 0 && fragment < fragmentCount) (groups[fragment] as number[]).push(i);
  }
  return groups;
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

function placeContainers(
  grid: MapGrid,
  fragments: FragmentInfo[],
  openByFragment: number[][],
  rng: SeededRandom,
): ContainerSpawn[] {
  const spawns: ContainerSpawn[] = [];
  const cellArea = grid.cellSize * grid.cellSize;

  for (const fragment of fragments) {
    const biome = getBiome(fragment.biomeId);
    const cells = openByFragment[fragment.index] ?? [];
    const areaSqm = cells.length * cellArea;
    const count = Math.round((areaSqm / 100) * biome.containerDensity);

    const used = new Set<number>();
    for (let i = 0; i < count; i++) {
      const index = pickClearCell(grid, cells, rng);
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

function placeEnemies(
  grid: MapGrid,
  fragments: FragmentInfo[],
  openByFragment: number[][],
  spawn: SpawnPoint,
  rng: SeededRandom,
): EnemySpawn[] {
  const spawns: EnemySpawn[] = [];
  const cellArea = grid.cellSize * grid.cellSize;
  /** Metres of breathing room around the player's spawn. */
  const safeRadiusSq = 14 * 14;

  for (const fragment of fragments) {
    const biome = getBiome(fragment.biomeId);
    const cells = openByFragment[fragment.index] ?? [];
    const areaSqm = cells.length * cellArea;
    const count = Math.round((areaSqm / 100) * biome.enemyDensity);

    for (let i = 0; i < count; i++) {
      const index = pickClearCell(grid, cells, rng);
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

function placeAnomalies(
  grid: MapGrid,
  fragments: FragmentInfo[],
  openByFragment: number[][],
  rng: SeededRandom,
): AnomalySpawn[] {
  const spawns: AnomalySpawn[] = [];

  for (const fragment of fragments) {
    const biome = getBiome(fragment.biomeId);
    if (!rng.chance(biome.anomalyChance)) continue;

    const cells = openByFragment[fragment.index] ?? [];
    const index = pickClearCell(grid, cells, rng);
    if (index === null) continue;

    const position = cellToWorld(grid, index);
    spawns.push({
      kind: 'stillness',
      x: position.x,
      y: position.y,
      radius: rng.range(3.5, 5.5),
    });
  }

  return spawns;
}
