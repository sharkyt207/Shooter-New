/**
 * Isometric projection: world metres <-> screen pixels.
 *
 * 2:1 isometry (26.57 degrees) as specified in docs/06-ART-DIRECTION.md.
 * A 2 m map cell projects to a 128 x 64 px diamond, which is the tile size the
 * art pipeline produces.
 *
 * Camera rotation is fixed at zero, deliberately: readability on a 6 inch
 * screen beats a rotating camera every time (Pillar P6).
 */

/** Horizontal pixels per world metre along an isometric axis. */
export const ISO_X = 32;
/** Vertical pixels per world metre along an isometric axis. */
export const ISO_Y = 16;
/** Vertical pixels per metre of entity height. */
export const HEIGHT_PX_PER_METRE = 30;

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * World (metres) -> screen (pixels), before the camera transform.
 *
 * Allocates a fresh point by default. A shared module-level scratch object
 * would be faster but is a genuine trap: code that projects several corners of
 * a shape would silently get four references to the same value. Hot loops pass
 * their own reusable `out` instead.
 */
export function worldToScreen(
  worldX: number,
  worldY: number,
  out: ScreenPoint = { x: 0, y: 0 },
): ScreenPoint {
  out.x = (worldX - worldY) * ISO_X;
  out.y = (worldX + worldY) * ISO_Y;
  return out;
}

/** Screen (pixels) -> world (metres). Inverse of `worldToScreen`. */
export function screenToWorld(
  screenX: number,
  screenY: number,
  out: ScreenPoint = { x: 0, y: 0 },
): ScreenPoint {
  out.x = (screenX / ISO_X + screenY / ISO_Y) * 0.5;
  out.y = (screenY / ISO_Y - screenX / ISO_X) * 0.5;
  return out;
}

/**
 * Depth key for painter's-algorithm sorting.
 *
 * Objects further along (x + y) are further "into" the scene and must be drawn
 * later. Height is *not* part of the key - a tall object still belongs at its
 * floor position, otherwise walls would incorrectly cover actors in front.
 */
export function depthOf(worldX: number, worldY: number): number {
  return (worldX + worldY) * 100;
}

/** Vertical screen offset for something standing `metres` above the floor. */
export function heightOffset(metres: number): number {
  return -metres * HEIGHT_PX_PER_METRE;
}

/**
 * World-space bounds currently visible, expanded by `paddingMetres`.
 *
 * Used to cull wall tiles: drawing all ~1500 of them every frame would blow the
 * draw-call budget from docs/01-ARCHITECTURE.md.
 */
export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const boundsScratch: WorldBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const cornerScratch: ScreenPoint = { x: 0, y: 0 };

export function visibleWorldBounds(
  cameraWorldX: number,
  cameraWorldY: number,
  screenWidth: number,
  screenHeight: number,
  paddingMetres = 4,
  out: WorldBounds = boundsScratch,
): WorldBounds {
  const halfW = screenWidth * 0.5;
  const halfH = screenHeight * 0.5;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  // The projection is linear, so a screen offset from the camera maps to a
  // world offset from the camera. Unprojecting the four corner offsets and
  // taking their axis-aligned hull gives the region that can be on screen.
  for (const [dx, dy] of [
    [-halfW, -halfH],
    [halfW, -halfH],
    [-halfW, halfH],
    [halfW, halfH],
  ] as const) {
    const offset = screenToWorld(dx, dy, cornerScratch);
    const wx = cameraWorldX + offset.x;
    const wy = cameraWorldY + offset.y;
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
  }

  out.minX = minX - paddingMetres;
  out.minY = minY - paddingMetres;
  out.maxX = maxX + paddingMetres;
  out.maxY = maxY + paddingMetres;
  return out;
}
