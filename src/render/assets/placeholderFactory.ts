/**
 * Procedural placeholder textures.
 *
 * Art must never block engineering. Every logical asset key resolves to
 * *something* - derived from its prefix and drawn in the official palette
 * (docs/06-ART-DIRECTION.md), so the prototype looks deliberate rather than
 * like a programmer test pattern.
 *
 * Phase P0 of the asset pipeline (docs/07-ASSET-PIPELINE.md). Canva exports
 * (P1) and final art (P2) replace these purely through the manifest.
 */

import { Graphics, type Renderer, type Texture } from 'pixi.js';
import { findAnomaly } from '@/content/anomalies';

/** The palette from the art direction document, as numbers for Pixi. */
export const PALETTE = {
  void: 0x080a0f,
  deepSlate: 0x12161f,
  slate: 0x1c2331,
  concrete: 0x2a3344,
  fog: 0x3d4a5f,
  bone: 0xc9d1de,

  echo: 0x38e1d4,
  extraction: 0x5be37a,
  threat: 0xffb13d,
  danger: 0xff4d5e,
  rare: 0xa96bff,
} as const;

export const RARITY_COLORS: Record<string, number> = {
  common: 0x8a94a6,
  uncommon: 0x5be37a,
  rare: 0x3da9fc,
  epic: 0xa96bff,
  legendary: 0xffb13d,
};

/** Pixels per world metre along the isometric axes. Mirrors isoProjection. */
const PX_PER_METRE = 32;

export interface PlaceholderSpec {
  /** Texture size in pixels. */
  width: number;
  height: number;
  /** Anchor point, so the sprite sits correctly on the isometric floor. */
  anchorX: number;
  anchorY: number;
}

/** Which actor gets which colour, so factions read at a glance. */
const ACTOR_COLORS: Record<string, number> = {
  'actor.player': PALETTE.echo,
  'actor.scavenger': 0x9a7b5a,
  'actor.order_runner': 0x6d84a8,
  'actor.warden': PALETTE.rare,
};

const PROP_COLORS: Record<string, number> = {
  'prop.crate': 0x7a6244,
  'prop.locker': 0x4a5568,
  'prop.medcase': 0xb8535f,
  'prop.echo_cache': PALETTE.echo,
  'prop.door': 0x6b7385,
  'prop.door.locked': PALETTE.threat,
  'prop.door.open': 0x3a4252,
};

/**
 * Floor and wall colours per biome.
 *
 * Walls are deliberately much lighter than floors: in an isometric top-down
 * view, "is that a wall or just dark floor?" has to be answerable in a glance
 * (Pillar P6). Exported so the floor pass and the wall tiles stay in sync.
 */
const TILE_COLORS: Record<string, { floor: number; wall: number }> = {
  'tile.lab': { floor: 0x1c2331, wall: 0x46536b },
  'tile.forest': { floor: 0x1a2a20, wall: 0x3c5c46 },
  'tile.terminal': { floor: 0x272219, wall: 0x5c503c },
};

const DEFAULT_TILE_COLORS = { floor: PALETTE.slate, wall: PALETTE.fog };

/** Look up the palette for a tile key such as `tile.lab.floor`. */
export function tilePaletteFor(key: string): { floor: number; wall: number } {
  const biome = key.split('.').slice(0, 2).join('.');
  return TILE_COLORS[biome] ?? DEFAULT_TILE_COLORS;
}

export class PlaceholderFactory {
  private readonly cache = new Map<string, Texture>();

  constructor(private readonly renderer: Renderer) {}

  /** Get (and memoise) a placeholder for a logical asset key. */
  get(key: string): Texture {
    const cached = this.cache.get(key);
    if (cached) return cached;

    const texture = this.build(key);
    this.cache.set(key, texture);
    return texture;
  }

  /** Anchor and size metadata for a key, used when no manifest entry exists. */
  static specFor(key: string): PlaceholderSpec {
    if (key.startsWith('actor.')) return { width: 44, height: 74, anchorX: 0.5, anchorY: 0.82 };
    if (key.startsWith('prop.')) return { width: 64, height: 58, anchorX: 0.5, anchorY: 0.78 };
    // Wall tiles are extruded, so their texture is taller than the floor
    // diamond and anchors at the diamond's centre, not the texture's.
    if (key.endsWith('.wall')) return { width: 64, height: 48, anchorX: 0.5, anchorY: 1 / 3 };
    if (key.startsWith('tile.')) return { width: 64, height: 32, anchorX: 0.5, anchorY: 0.5 };
    if (key.startsWith('icon.')) return { width: 64, height: 64, anchorX: 0.5, anchorY: 0.5 };
    if (key.startsWith('fx.')) return { width: 64, height: 64, anchorX: 0.5, anchorY: 0.5 };
    return { width: 64, height: 64, anchorX: 0.5, anchorY: 0.5 };
  }

  destroy(): void {
    for (const texture of this.cache.values()) texture.destroy(true);
    this.cache.clear();
  }

  private build(key: string): Texture {
    if (key.startsWith('actor.')) return this.buildActor(key);
    if (key.startsWith('prop.')) return this.buildProp(key);
    if (key.startsWith('tile.')) return this.buildTile(key);
    if (key.startsWith('icon.')) return this.buildIcon(key);
    if (key.startsWith('fx.')) return this.buildFx(key);
    return this.buildFallback();
  }

  private toTexture(graphics: Graphics): Texture {
    const texture = this.renderer.generateTexture({ target: graphics, resolution: 2 });
    graphics.destroy();
    return texture;
  }

  /**
   * Actors: a capsule silhouette with a bright rim and a facing wedge.
   * The wedge matters - without it, an isometric character's facing is
   * genuinely ambiguous, and this is a twin-stick shooter.
   */
  private buildActor(key: string): Texture {
    const color = ACTOR_COLORS[key] ?? PALETTE.fog;
    const g = new Graphics();

    // Contact shadow.
    g.ellipse(22, 66, 15, 6).fill({ color: 0x000000, alpha: 0.35 });

    // Body capsule.
    g.roundRect(8, 20, 28, 46, 14).fill({ color });
    g.roundRect(8, 20, 28, 46, 14).stroke({ width: 2, color: PALETTE.bone, alpha: 0.55 });

    // Head.
    g.circle(22, 16, 11).fill({ color: lighten(color, 0.18) });
    g.circle(22, 16, 11).stroke({ width: 2, color: PALETTE.bone, alpha: 0.55 });

    // Facing wedge, pointing right (rotation 0 in world space).
    g.moveTo(36, 16).lineTo(44, 22).lineTo(36, 28).closePath().fill({ color: PALETTE.bone, alpha: 0.8 });

    return this.toTexture(g);
  }

  /** Props: an isometric box with a lit top face and two shaded sides. */
  private buildProp(key: string): Texture {
    if (key.startsWith('prop.door')) return this.buildDoor(key);

    const color = PROP_COLORS[key] ?? PALETTE.concrete;
    const g = new Graphics();

    g.ellipse(32, 52, 22, 8).fill({ color: 0x000000, alpha: 0.3 });

    // Top face (diamond).
    g.moveTo(32, 8).lineTo(58, 22).lineTo(32, 36).lineTo(6, 22).closePath();
    g.fill({ color: lighten(color, 0.25) });

    // Left and right side faces.
    g.moveTo(6, 22).lineTo(32, 36).lineTo(32, 52).lineTo(6, 38).closePath();
    g.fill({ color: darken(color, 0.25) });
    g.moveTo(58, 22).lineTo(32, 36).lineTo(32, 52).lineTo(58, 38).closePath();
    g.fill({ color: darken(color, 0.1) });

    g.moveTo(32, 8).lineTo(58, 22).lineTo(32, 36).lineTo(6, 22).closePath();
    g.stroke({ width: 1.5, color: PALETTE.bone, alpha: 0.35 });

    return this.toTexture(g);
  }

  /**
   * Doors: a standing slab, not a box.
   *
   * The three states have to be distinguishable across the room, because the
   * whole point of a locked door is that the player recognises it as a promise
   * before walking all the way over to it: grey is shut, amber is locked, and
   * an open door is a dark frame with the leaf swung aside.
   */
  private buildDoor(key: string): Texture {
    const color = PROP_COLORS[key] ?? PALETTE.concrete;
    const g = new Graphics();
    const open = key.endsWith('.open');

    g.ellipse(32, 54, 20, 7).fill({ color: 0x000000, alpha: 0.3 });

    // Frame, always drawn - an opened door still reads as a doorway.
    g.moveTo(10, 46).lineTo(10, 12).lineTo(54, 12).lineTo(54, 46);
    g.stroke({ width: 3, color: darken(color, 0.35), alpha: 0.9 });

    if (open) {
      // Leaf swung aside, plus the dark opening it left behind.
      g.rect(14, 14, 36, 32).fill({ color: PALETTE.void, alpha: 0.75 });
      g.moveTo(50, 14).lineTo(58, 20).lineTo(58, 44).lineTo(50, 44).closePath();
      g.fill({ color: darken(color, 0.15) });
      return this.toTexture(g);
    }

    g.rect(13, 13, 38, 34).fill({ color });
    g.rect(13, 13, 38, 34).stroke({ width: 2, color: lighten(color, 0.25), alpha: 0.8 });
    // Handle side, so the leaf has a direction rather than being a rectangle.
    g.rect(44, 26, 4, 8).fill({ color: lighten(color, 0.45) });

    if (key.endsWith('.locked')) {
      // A hard, bright bar across the middle: readable at any zoom level.
      g.rect(17, 27, 30, 6).fill({ color: PALETTE.threat });
      g.rect(17, 27, 30, 6).stroke({ width: 1, color: PALETTE.void, alpha: 0.6 });
    }

    return this.toTexture(g);
  }

  /**
   * Tiles.
   *
   * Floors are a flat diamond. Walls are extruded into a block with a lit top
   * and two shaded faces - without that vertical cue an isometric wall is
   * indistinguishable from a differently coloured floor.
   */
  private buildTile(key: string): Texture {
    const colors = tilePaletteFor(key);
    return key.endsWith('.wall') ? this.buildWallTile(colors.wall) : this.buildFloorTile(colors.floor);
  }

  private buildFloorTile(color: number): Texture {
    const g = new Graphics();
    g.moveTo(32, 0).lineTo(64, 16).lineTo(32, 32).lineTo(0, 16).closePath();
    g.fill({ color });
    g.moveTo(32, 3).lineTo(60, 16).lineTo(32, 29).lineTo(4, 16).closePath();
    g.stroke({ width: 1, color: lighten(color, 0.3), alpha: 0.35 });
    return this.toTexture(g);
  }

  private buildWallTile(color: number): Texture {
    const g = new Graphics();
    const extrude = 16;

    // Side faces first, so the top face draws over their shared edge.
    g.moveTo(0, 16).lineTo(32, 32).lineTo(32, 32 + extrude).lineTo(0, 16 + extrude).closePath();
    g.fill({ color: darken(color, 0.38) });
    g.moveTo(64, 16).lineTo(32, 32).lineTo(32, 32 + extrude).lineTo(64, 16 + extrude).closePath();
    g.fill({ color: darken(color, 0.2) });

    // Lit top face.
    g.moveTo(32, 0).lineTo(64, 16).lineTo(32, 32).lineTo(0, 16).closePath();
    g.fill({ color });
    g.moveTo(32, 0).lineTo(64, 16).lineTo(32, 32).lineTo(0, 16).closePath();
    g.stroke({ width: 1, color: lighten(color, 0.35), alpha: 0.5 });

    return this.toTexture(g);
  }

  /** Icons: a rounded square with a rarity-coloured border and a glyph block. */
  private buildIcon(key: string): Texture {
    const color = iconColorFor(key);
    const g = new Graphics();

    g.roundRect(2, 2, 60, 60, 10).fill({ color: PALETTE.deepSlate });
    g.roundRect(2, 2, 60, 60, 10).stroke({ width: 2, color, alpha: 0.9 });
    g.roundRect(18, 18, 28, 28, 6).fill({ color, alpha: 0.85 });

    return this.toTexture(g);
  }

  /** Effects: a soft radial blob, approximated with concentric circles. */
  private buildFx(key: string): Texture {
    const color = fxColorFor(key);
    const g = new Graphics();

    if (key.startsWith('fx.throwable.')) {
      // A small solid object, not a glow - it has to read as something lying
      // on the floor that is about to go off.
      g.circle(32, 32, 9).fill({ color });
      g.circle(32, 32, 9).stroke({ width: 2, color: PALETTE.bone, alpha: 0.7 });
      g.circle(32, 32, 16).fill({ color, alpha: 0.22 });
      return this.toTexture(g);
    }

    if (key === 'fx.projectile') {
      g.circle(32, 32, 5).fill({ color: 0xfff4d6 });
      g.circle(32, 32, 10).fill({ color, alpha: 0.35 });
      return this.toTexture(g);
    }

    // Pixi has no gradient fill primitive, so a handful of stacked circles
    // stands in - at these sizes it is visually indistinguishable.
    for (let i = 10; i >= 1; i--) {
      const radius = (i / 10) * 32;
      g.circle(32, 32, radius).fill({ color, alpha: 0.09 });
    }
    g.circle(32, 32, 7).fill({ color: lighten(color, 0.5), alpha: 0.9 });

    return this.toTexture(g);
  }

  private buildFallback(): Texture {
    const g = new Graphics();
    g.roundRect(2, 2, 60, 60, 8).fill({ color: PALETTE.concrete });
    g.roundRect(2, 2, 60, 60, 8).stroke({ width: 2, color: PALETTE.danger });
    g.moveTo(12, 12).lineTo(52, 52).stroke({ width: 3, color: PALETTE.danger });
    g.moveTo(52, 12).lineTo(12, 52).stroke({ width: 3, color: PALETTE.danger });
    return this.toTexture(g);
  }

  /**
   * A radial darkness mask: transparent at the centre, opaque at the edge.
   * Drawn over the world and centred on the player, it produces the limited
   * visibility that carries the game's tension (Pillar P3).
   */
  buildDarkness(radiusPx: number, color: number, intensity = 1): Texture {
    const g = new Graphics();
    const steps = 24;
    // At night the clear core shrinks and the falloff bites harder, so the
    // world closes in around the player instead of merely getting greyer.
    const core = 0.25 / intensity;

    for (let i = steps; i >= 1; i--) {
      const t = i / steps;
      const radius = radiusPx * t;
      // Alpha rises with distance and stays fully transparent near the centre.
      const alpha = Math.pow(Math.max(0, (t - core) / (1 - core)), 1.6) * 0.055 * intensity;
      g.circle(radiusPx, radiusPx, radius).fill({ color, alpha });
    }

    return this.toTexture(g);
  }

  /**
   * The flashlight cone, drawn once and rotated by the renderer.
   *
   * Bright at the mouth, fading to nothing at the end of its reach, with a soft
   * spill at the character's feet so the player is never standing in a hole.
   * Additive when composited, which is why it is drawn in flat white here and
   * tinted at use.
   */
  buildLightCone(rangeMetres: number, coneDeg: number, color: number): Texture {
    const range = rangeMetres * PX_PER_METRE;
    // Drawn as a true circular sector around the texture centre, pointing +X.
    // The isometric squash is *not* baked in: the renderer applies it with a
    // container scale outside the sprite's rotation, which is the only order
    // that maps a world-space cone onto the 2:1 projection correctly.
    const size = range * 2;
    const origin = range;
    const half = (coneDeg * 0.5 * Math.PI) / 180;
    const g = new Graphics();

    // `generateTexture` crops to the drawn geometry, and a sector's bounding
    // box is nowhere near centred on its apex - so an anchor of 0.5 would put
    // the light source somewhere off to the side of the character holding it.
    // A transparent full-size square forces symmetric bounds around the apex.
    g.rect(0, 0, size, size).fill({ color, alpha: 0.0001 });

    // Two nested loops: radial steps build the falloff along the beam, angular
    // bands build it across the beam. A single cone reads as a hard-edged
    // wedge, which looks like a UI element rather than like light.
    const radialSteps = 12;
    const bands = [1, 0.72, 0.45, 0.22];

    for (const band of bands) {
      for (let i = radialSteps; i >= 1; i--) {
        const t = i / radialSteps;
        const reach = range * t * (0.35 + 0.65 * band ** 0.25);
        const alpha = ((1 - t) * 0.05 + 0.008) * (0.5 + band * 0.5);
        g.moveTo(origin, origin);
        g.arc(origin, origin, reach, -half * band, half * band);
        g.closePath();
        g.fill({ color, alpha });
      }
    }

    // Spill at the feet, so the carrier is lit even when facing away.
    for (let i = 6; i >= 1; i--) {
      g.circle(origin, origin, i * 7).fill({ color, alpha: 0.03 });
    }

    return this.toTexture(g);
  }

  /** Extraction zone marker: a pulsing ground ring. */
  buildZoneRing(radiusMetres: number, color: number): Texture {
    const rx = radiusMetres * PX_PER_METRE;
    const ry = rx * 0.5;
    const g = new Graphics();

    g.ellipse(rx + 6, ry + 6, rx, ry).fill({ color, alpha: 0.12 });
    g.ellipse(rx + 6, ry + 6, rx, ry).stroke({ width: 3, color, alpha: 0.85 });
    g.ellipse(rx + 6, ry + 6, rx * 0.72, ry * 0.72).stroke({ width: 1.5, color, alpha: 0.4 });

    return this.toTexture(g);
  }
}

function lighten(color: number, amount: number): number {
  const r = Math.min(255, ((color >> 16) & 0xff) + 255 * amount);
  const g = Math.min(255, ((color >> 8) & 0xff) + 255 * amount);
  const b = Math.min(255, (color & 0xff) + 255 * amount);
  return (r << 16) | (g << 8) | b;
}

function darken(color: number, amount: number): number {
  const r = Math.max(0, ((color >> 16) & 0xff) * (1 - amount));
  const g = Math.max(0, ((color >> 8) & 0xff) * (1 - amount));
  const b = Math.max(0, (color & 0xff) * (1 - amount));
  return (r << 16) | (g << 8) | b;
}

function iconColorFor(key: string): number {
  if (key.includes('ammo')) return RARITY_COLORS['common'] as number;
  if (key.includes('wpn')) return RARITY_COLORS['uncommon'] as number;
  if (key.includes('medkit') || key.includes('bandage') || key.includes('stim')) return 0xb8535f;
  if (key.includes('echoshard') || key.includes('datacore')) return PALETTE.echo;
  if (key.includes('risscore')) return PALETTE.threat;
  if (key.includes('armor')) return RARITY_COLORS['rare'] as number;
  if (key.includes('bag')) return 0x8a7b5a;
  return RARITY_COLORS['common'] as number;
}

function fxColorFor(key: string): number {
  if (key.startsWith('fx.anomaly.')) {
    // Anomaly colour is content, not a render decision: telling a Bleiche from
    // a Stillstand at a glance is a gameplay requirement (ADR-008).
    const kind = key.slice('fx.anomaly.'.length);
    return findAnomaly(kind)?.color ?? PALETTE.echo;
  }
  if (key.includes('anomaly')) return PALETTE.echo;
  if (key.includes('muzzle')) return 0xffe6a8;
  if (key.includes('flesh')) return PALETTE.danger;
  if (key.includes('extraction')) return PALETTE.extraction;
  // Throwables read by colour: red is lethal, white blinds, cyan is a decoy.
  if (key.includes('throwable.frag')) return PALETTE.danger;
  if (key.includes('throwable.flash')) return 0xfff6dc;
  if (key.includes('throwable.lure')) return PALETTE.echo;
  return PALETTE.bone;
}
