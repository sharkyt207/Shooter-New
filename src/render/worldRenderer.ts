/**
 * The PixiJS presentation layer.
 *
 * Reads the simulation and draws it. It never writes into the world - all it
 * does is observe state and subscribe to events (ADR-002).
 *
 * Layer order (bottom to top):
 *   1. floor      static Graphics, built once per raid
 *   2. ground     zone rings and anomaly fields, painted on the floor
 *   3. entities   walls, props, actors, loot - depth-sorted every frame
 *   4. vfx        muzzle flashes, impacts, floating damage numbers
 *   5. darkness   radial mask centred on the player, scaled by the weather
 *   6. lights     additive lights punched back through the darkness
 *   7. weather    screen-space particles, on top of everything
 */

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { getAnomaly } from '@/content/anomalies';
import { LIGHT } from '@/content/balance';
import { getBiome } from '@/content/biomes';
import { findWeapon } from '@/content/weapons';
import type { EntityId } from '@/core/ecs/entity';
import { SeededRandom } from '@/core/math/random';
import { clamp01 } from '@/core/math/scalar';
import { CELL_SEAM, CELL_WALL } from '@/game/map/mapGrid';
import type { RaidSimulation } from '@/game/simulation/raidSimulation';
import type { AssetRegistry } from './assets/assetRegistry';
import { PALETTE, tilePaletteFor, type PlaceholderFactory } from './assets/placeholderFactory';
import { Camera } from './camera';
import {
  depthOf,
  heightOffset,
  ISO_X,
  ISO_Y,
  visibleWorldBounds,
  worldToScreen,
  type ScreenPoint,
} from './iso/isoProjection';

/** Pool sizes tuned to the entity budget in docs/01-ARCHITECTURE.md. */
const MAX_WALL_SPRITES = 900;
const MAX_VFX = 160;
/** Weather particles at full density. Screen-space, so this is a fixed cost. */
const MAX_WEATHER_PARTICLES = 110;

/**
 * Reusable projection targets for the per-frame loops.
 * `worldToScreen` allocates when given no target; these keep the hot paths
 * allocation-free without sharing one object across unrelated call sites.
 */
const projScratch: ScreenPoint = { x: 0, y: 0 };
const cameraScratch: ScreenPoint = { x: 0, y: 0 };

interface VfxItem {
  sprite: Sprite;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
}

interface DamageNumber {
  text: Text;
  life: number;
  worldX: number;
  worldY: number;
}

/** A drifting weather mote, positioned in screen space and wrapped at the edges. */
interface WeatherParticle {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * How far the aim line reaches, in metres.
 *
 * Deliberately shorter than any weapon's range: the line is a pointing aid,
 * not a laser sight that reveals the whole map through a doorway.
 */
const AIM_LINE_RANGE = 14;

export class WorldRenderer {
  readonly stage = new Container();
  readonly camera: Camera;

  private readonly world = new Container();
  private readonly floorLayer = new Graphics();
  private readonly groundLayer = new Container();
  private readonly entityLayer = new Container();
  private readonly vfxLayer = new Container();
  /**
   * The aim line, drawn under the entities so it reads as coming *from* the
   * character rather than lying on top of it.
   */
  private readonly aimLayer = new Graphics();
  private readonly darknessLayer = new Container();
  private readonly lightLayer = new Container();
  private readonly weatherLayer = new Container();

  private readonly entitySprites = new Map<EntityId, Sprite>();
  private readonly wallPool: Sprite[] = [];
  private wallsUsed = 0;
  private readonly vfxPool: VfxItem[] = [];
  private readonly activeVfx: VfxItem[] = [];
  private readonly damageNumbers: DamageNumber[] = [];

  private darknessSprite: Sprite | null = null;
  private readonly zoneRings = new Map<string, Sprite>();
  private readonly anomalyFields = new Map<EntityId, Sprite>();
  /** Asset key each entity sprite currently shows, so a change can swap it. */
  private readonly entityAssetKeys = new Map<EntityId, string>();
  /**
   * Outer container carries the isometric squash, inner sprite the rotation.
   * That order - scale outside, rotate inside - is what maps a world-space cone
   * onto the 2:1 projection; the reverse produces a cone that leans as it turns.
   */
  private lightConeHolder: Container | null = null;
  private lightConeSprite: Sprite | null = null;
  /** Screen-space angle offset that turns a world heading into an iso heading. */

  private readonly weatherParticles: WeatherParticle[] = [];
  private readonly unsubscribes: Array<() => void> = [];

  private sim: RaidSimulation | null = null;
  private debugEnabled = false;
  private readonly debugGraphics = new Graphics();

  /** Player position in screen pixels, needed by the desktop aim anchor. */
  playerScreenX = 0;
  playerScreenY = 0;

  /** Camera offset in screen pixels, recomputed once per frame. */
  private offsetX = 0;
  private offsetY = 0;

  constructor(
    private readonly assets: AssetRegistry,
    private readonly placeholders: PlaceholderFactory,
  ) {
    this.camera = new Camera(new SeededRandom(0xc0ffee));

    this.entityLayer.sortableChildren = true;
    this.world.addChild(
      this.floorLayer,
      this.groundLayer,
      this.aimLayer,
      this.entityLayer,
      this.vfxLayer,
    );
    this.stage.addChild(
      this.world,
      this.darknessLayer,
      this.lightLayer,
      this.weatherLayer,
      this.debugGraphics,
    );

    // The darkness mask multiplies the scene down; lights are added back on top.
    this.lightLayer.blendMode = 'add';
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /** Bind to a raid. Rebuilds all static geometry. */
  setSimulation(sim: RaidSimulation): void {
    this.teardown();
    this.sim = sim;

    this.buildFloor(sim);
    this.buildZoneRings(sim);
    this.buildDarkness(sim);
    this.buildLightCone();
    this.buildWeather(sim);

    // Weather tints the whole world in one place. Cheap, and it is the single
    // strongest cue that this raid is not the last one.
    this.world.tint = sim.weather.tint;

    this.camera.snapTo(sim.map.playerSpawn.x, sim.map.playerSpawn.y);
    this.subscribe(sim);
  }

  setDebug(enabled: boolean): void {
    this.debugEnabled = enabled;
    this.debugGraphics.visible = enabled;
    if (!enabled) this.debugGraphics.clear();
  }

  resize(width: number, height: number): void {
    this.camera.viewWidth = width;
    this.camera.viewHeight = height;
    this.stage.position.set(width * 0.5, height * 0.5);
    if (this.darknessSprite) {
      // Keep the mask comfortably larger than the viewport diagonal.
      const size = Math.hypot(width, height) * 1.25;
      this.darknessSprite.width = size;
      this.darknessSprite.height = size;
    }
  }

  teardown(): void {
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    this.unsubscribes.length = 0;

    for (const sprite of this.entitySprites.values()) sprite.destroy();
    this.entitySprites.clear();
    this.entityAssetKeys.clear();

    this.groundLayer.removeChildren();
    this.zoneRings.clear();
    this.anomalyFields.clear();

    for (const particle of this.weatherParticles) particle.sprite.destroy();
    this.weatherParticles.length = 0;
    this.weatherLayer.removeChildren();

    for (const item of this.activeVfx) item.sprite.visible = false;
    this.activeVfx.length = 0;
    for (const number of this.damageNumbers) number.text.destroy();
    this.damageNumbers.length = 0;

    this.floorLayer.clear();
    this.sim = null;
  }

  destroy(): void {
    this.teardown();
    this.stage.destroy({ children: true });
  }

  // ── Per-frame update ─────────────────────────────────────────────────────

  /**
   * @param alpha Interpolation factor between the previous and current sim tick.
   * @param dt    Real frame time in seconds (for VFX, not for gameplay).
   */
  update(alpha: number, dt: number, aimX: number, aimY: number): void {
    const sim = this.sim;
    if (!sim) return;

    this.updateCamera(sim, alpha, aimX, aimY, dt);
    this.updateWalls(sim);
    this.updateAimLine(sim, alpha);
    this.updateEntities(sim, alpha);
    this.updateZones(sim);
    this.updateAnomalyFields(sim);
    this.updateLightCone(sim, alpha);
    this.updateWeather(dt);
    this.updateVfx(dt);
    this.updateDamageNumbers(dt);
    if (this.debugEnabled) this.drawDebug(sim);
  }

  /**
   * The aim line: where the shot goes, and whether the trigger is live.
   *
   * This is the feedback the two-stage aim stick needs. Without it "aiming"
   * and "about to fire" look identical, and the player learns the threshold by
   * accidentally shooting - which in a game where noise carries is an expensive
   * lesson.
   *
   * It stops at the first wall, so it doubles as a line-of-sight readout: if
   * the line does not reach the target, neither will the bullet.
   */
  private updateAimLine(sim: RaidSimulation, alpha: number): void {
    const line = this.aimLayer;
    line.clear();

    const entity = sim.world.playerEntity;
    if (entity === null) return;
    const tag = sim.world.players.get(entity);
    const transform = sim.world.transforms.get(entity);
    if (!tag?.aiming || !transform) return;

    const x = lerp(transform.prevX, transform.x, alpha);
    const y = lerp(transform.prevY, transform.y, alpha);
    const dirX = Math.cos(transform.rotation);
    const dirY = Math.sin(transform.rotation);

    const range = sim.grid.raycastDistance(x, y, dirX, dirY, AIM_LINE_RANGE);
    const from = worldToScreen(x, y, projScratch);
    const fromX = from.x;
    const fromY = from.y;
    const to = worldToScreen(x + dirX * range, y + dirY * range, projScratch);

    // Armed reads as the weapon's own colour and a solid line; merely aiming is
    // a thin, dim guide. The difference has to be obvious at arm's length on a
    // phone, so it is both hue *and* weight - colour alone fails in sunlight.
    const armed = tag.firing;
    line.moveTo(fromX, fromY);
    line.lineTo(to.x, to.y);
    // Tuned against a screenshot on a phone viewport, not guessed: at alpha
    // 0.22 the aiming line was invisible, which defeats the point of having a
    // stage that only aims.
    line.stroke({
      width: armed ? 2.5 : 1.5,
      color: armed ? 0xff6a4d : 0x9fd0e0,
      alpha: armed ? 0.7 : 0.42,
    });

    // A small mark where the line ends, so the player can judge distance.
    line.circle(to.x, to.y, armed ? 5 : 3.5);
    line.stroke({ width: 1.5, color: armed ? 0xff6a4d : 0x9fd0e0, alpha: armed ? 0.9 : 0.55 });
  }

  private updateCamera(
    sim: RaidSimulation,
    alpha: number,
    aimX: number,
    aimY: number,
    dt: number,
  ): void {
    const player = sim.world.playerEntity;
    const transform = player !== null ? sim.world.transforms.get(player) : undefined;

    if (transform) {
      const x = lerp(transform.prevX, transform.x, alpha);
      const y = lerp(transform.prevY, transform.y, alpha);
      this.camera.follow(x, y, aimX, aimY, dt);
    }

    // One projection of the camera position per frame, reused everywhere below.
    worldToScreen(this.camera.renderX, this.camera.renderY, cameraScratch);
    this.offsetX = cameraScratch.x;
    this.offsetY = cameraScratch.y;

    if (transform) {
      const x = lerp(transform.prevX, transform.x, alpha);
      const y = lerp(transform.prevY, transform.y, alpha);
      const screen = worldToScreen(x, y, projScratch);
      this.playerScreenX = this.camera.viewWidth * 0.5 + screen.x - this.offsetX;
      this.playerScreenY = this.camera.viewHeight * 0.5 + screen.y - this.offsetY;
    }

    this.world.position.set(-this.offsetX, -this.offsetY);
    // Lights live in world space too, so a light can simply be placed at the
    // same projected coordinates as the entity carrying it.
    this.lightLayer.position.set(-this.offsetX, -this.offsetY);

    if (this.darknessSprite) {
      // The mask stays centred on the screen, so it tracks the camera for free.
      this.darknessSprite.position.set(0, 0);
    }
  }

  // ── Static geometry ──────────────────────────────────────────────────────

  /**
   * Draw the whole floor once into a single Graphics.
   *
   * Retained-mode geometry means this costs a handful of draw calls no matter
   * how large the map is - far cheaper than thousands of floor sprites.
   */
  private buildFloor(sim: RaidSimulation): void {
    const g = this.floorLayer;
    g.clear();

    // Four separate corner points - one shared object would collapse every
    // diamond into a zero-area polygon.
    const corner0: ScreenPoint = { x: 0, y: 0 };
    const corner1: ScreenPoint = { x: 0, y: 0 };
    const corner2: ScreenPoint = { x: 0, y: 0 };
    const corner3: ScreenPoint = { x: 0, y: 0 };

    const { grid } = sim;
    const fragmentColors = sim.map.fragments.map((fragment) => {
      const biome = getBiome(fragment.biomeId);
      return tilePaletteFor(biome.tiles.floor).floor;
    });

    for (let cy = 0; cy < grid.height; cy++) {
      for (let cx = 0; cx < grid.width; cx++) {
        const cell = grid.get(cx, cy);
        if (cell === CELL_WALL) continue;

        const fragmentIndex = grid.fragmentAt(cx, cy);
        const base =
          cell === CELL_SEAM
            ? PALETTE.deepSlate
            : (fragmentColors[fragmentIndex] ?? PALETTE.slate);

        // A stable per-cell tint variation breaks up large flat areas without
        // needing a texture. Deterministic, so it never shimmers.
        const noise = ((cx * 73856093) ^ (cy * 19349663)) & 0xff;
        const shade = 0.92 + (noise / 255) * 0.16;

        const wx = cx * grid.cellSize;
        const wy = cy * grid.cellSize;
        const size = grid.cellSize;

        const top = worldToScreen(wx, wy, corner0);
        const topX = top.x;
        const topY = top.y;
        const right = worldToScreen(wx + size, wy, corner1);
        const bottom = worldToScreen(wx + size, wy + size, corner2);
        const left = worldToScreen(wx, wy + size, corner3);

        g.moveTo(topX, topY)
          .lineTo(right.x, right.y)
          .lineTo(bottom.x, bottom.y)
          .lineTo(left.x, left.y)
          .closePath()
          .fill({ color: scaleColor(base, shade) });
      }
    }

    // Seam corridors get an echo-coloured edge glow: the fiction says these are
    // unstable joins between worlds, and the player should feel that.
    for (let cy = 0; cy < grid.height; cy++) {
      for (let cx = 0; cx < grid.width; cx++) {
        if (grid.get(cx, cy) !== CELL_SEAM) continue;
        const wx = cx * grid.cellSize;
        const wy = cy * grid.cellSize;
        const size = grid.cellSize;
        const top = worldToScreen(wx, wy, corner0);
        const right = worldToScreen(wx + size, wy, corner1);
        const bottom = worldToScreen(wx + size, wy + size, corner2);
        const left = worldToScreen(wx, wy + size, corner3);
        g.moveTo(top.x, top.y)
          .lineTo(right.x, right.y)
          .lineTo(bottom.x, bottom.y)
          .lineTo(left.x, left.y)
          .closePath()
          .stroke({ width: 1, color: PALETTE.echo, alpha: 0.14 });
      }
    }
  }

  private buildZoneRings(sim: RaidSimulation): void {
    for (const [entity, zone] of sim.world.extractionZones.entries()) {
      const transform = sim.world.transforms.get(entity);
      if (!transform) continue;

      const texture = this.placeholders.buildZoneRing(zone.radius, PALETTE.extraction);
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      const screen = worldToScreen(transform.x, transform.y);
      sprite.position.set(screen.x, screen.y);
      sprite.visible = false;
      this.groundLayer.addChild(sprite);
      this.zoneRings.set(zone.zoneId, sprite);
    }

    // Anomaly fields are painted on the ground too - they must be visible from
    // far away so the player can decide whether to approach, and they must be
    // told apart by colour alone, because that is the only cue at that range.
    for (const [entity, anomaly] of sim.world.anomalies.entries()) {
      const transform = sim.world.transforms.get(entity);
      if (!transform) continue;

      const def = getAnomaly(anomaly.kind);
      const sprite = new Sprite(this.assets.getTexture(`fx.anomaly.${anomaly.kind}`));
      sprite.anchor.set(0.5);
      const screen = worldToScreen(transform.x, transform.y);
      sprite.position.set(screen.x, screen.y);
      sprite.width = anomaly.radius * ISO_X * 2;
      sprite.height = anomaly.radius * ISO_Y * 2;
      sprite.tint = def.color;
      sprite.alpha = 0.55;
      sprite.blendMode = 'add';
      this.groundLayer.addChild(sprite);
      this.anomalyFields.set(entity, sprite);
    }
  }

  /**
   * The vignette that carries the game's tension (Pillar P3).
   *
   * Its strength comes from the weather: a night-side fragment closes the
   * visible circle down to almost nothing, which is what makes the flashlight -
   * and the decision to switch it on - matter at all.
   */
  private buildDarkness(sim: RaidSimulation): void {
    if (this.darknessSprite) {
      this.darknessSprite.destroy();
      this.darknessSprite = null;
    }

    const biome = getBiome(sim.map.fragments[0]?.biomeId ?? 'biome_lab');
    const intensity = Math.min(2.4, 1 / Math.max(0.2, sim.weather.lightMultiplier));
    const texture = this.placeholders.buildDarkness(
      512,
      darkenTowardVoid(biome.ambientColor),
      intensity,
    );

    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    this.darknessLayer.addChild(sprite);
    this.darknessSprite = sprite;
    this.resize(this.camera.viewWidth, this.camera.viewHeight);
  }

  private buildLightCone(): void {
    if (this.lightConeHolder) return;

    const texture = this.placeholders.buildLightCone(LIGHT.coneRange, LIGHT.coneDeg, 0xfff1c9);
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);

    const holder = new Container();
    holder.addChild(sprite);
    // The 2:1 squash lives here, outside the sprite's rotation.
    holder.scale.set(1, 0.5);
    holder.visible = false;

    this.lightLayer.addChild(holder);
    this.lightConeHolder = holder;
    this.lightConeSprite = sprite;
  }

  /**
   * Weather particles live in screen space.
   *
   * Anchoring them to the world would mean spawning and culling thousands as
   * the camera moves; drifting them across the viewport looks the same and
   * costs a fixed number of sprites no matter how large the map is.
   */
  private buildWeather(sim: RaidSimulation): void {
    const density = sim.weather.particleDensity;
    if (density <= 0) return;

    const count = Math.round(MAX_WEATHER_PARTICLES * density);
    const rng = new SeededRandom(sim.seed ^ 0x5eed);
    const storm = sim.weather.id === 'storm';

    for (let i = 0; i < count; i++) {
      const sprite = new Sprite(this.assets.getTexture('fx.anomaly.stillness'));
      sprite.anchor.set(0.5);
      sprite.tint = sim.weather.tint;
      sprite.alpha = storm ? 0.24 : 0.16;
      const size = storm ? rng.range(2, 5) : rng.range(14, 34);
      sprite.width = size * (storm ? 1 : 2.2);
      sprite.height = size;
      sprite.blendMode = storm ? 'normal' : 'add';
      this.weatherLayer.addChild(sprite);

      this.weatherParticles.push({
        sprite,
        x: rng.range(-900, 900),
        y: rng.range(-700, 700),
        // A storm drives hard and diagonally; fog barely moves at all.
        vx: storm ? rng.range(-420, -260) : rng.range(-16, 16),
        vy: storm ? rng.range(320, 520) : rng.range(-9, 9),
      });
    }
  }

  // ── Dynamic geometry ─────────────────────────────────────────────────────

  /**
   * Walls are sprites in the depth-sorted layer, culled to the visible region.
   * Only the pool slots actually needed are made visible each frame.
   */
  private updateWalls(sim: RaidSimulation): void {
    const { grid } = sim;
    const bounds = visibleWorldBounds(
      this.camera.renderX,
      this.camera.renderY,
      this.camera.viewWidth,
      this.camera.viewHeight,
      6,
    );

    const minCx = Math.max(0, grid.worldToCellX(bounds.minX));
    const maxCx = Math.min(grid.width - 1, grid.worldToCellX(bounds.maxX));
    const minCy = Math.max(0, grid.worldToCellY(bounds.minY));
    const maxCy = Math.min(grid.height - 1, grid.worldToCellY(bounds.maxY));

    let used = 0;

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        if (grid.get(cx, cy) !== CELL_WALL) continue;
        // Interior walls are never visible; skipping them saves a lot of sprites.
        if (isEnclosed(grid, cx, cy)) continue;
        if (used >= MAX_WALL_SPRITES) break;

        const sprite = this.acquireWall(used, cx, cy, sim);
        const wx = grid.cellCenterX(cx);
        const wy = grid.cellCenterY(cy);
        const screen = worldToScreen(wx, wy, projScratch);
        sprite.position.set(screen.x, screen.y);
        sprite.zIndex = depthOf(wx, wy);
        sprite.visible = true;
        used++;
      }
    }

    for (let i = used; i < this.wallsUsed; i++) {
      const sprite = this.wallPool[i];
      if (sprite) sprite.visible = false;
    }
    this.wallsUsed = used;
  }

  private acquireWall(index: number, cx: number, cy: number, sim: RaidSimulation): Sprite {
    let sprite = this.wallPool[index];

    if (!sprite) {
      sprite = new Sprite();
      this.entityLayer.addChild(sprite);
      this.wallPool[index] = sprite;
    }

    // Pick the wall texture from whichever fragment this cell borders.
    const fragmentIndex = nearestFragment(sim, cx, cy);
    const biome = getBiome(sim.map.fragments[fragmentIndex]?.biomeId ?? 'biome_lab');
    const asset = this.assets.get(biome.tiles.wall);
    sprite.texture = asset.texture;
    sprite.anchor.set(asset.anchorX, asset.anchorY);

    // A cell of `cellSize` metres projects to a diamond 2*cellSize*ISO_X wide;
    // the extruded texture keeps its own aspect ratio on top of that.
    const width = 2 * sim.grid.cellSize * ISO_X;
    sprite.width = width;
    sprite.height = (width * asset.texture.height) / asset.texture.width;
    return sprite;
  }

  private updateEntities(sim: RaidSimulation, alpha: number): void {
    const seen = new Set<EntityId>();

    for (const [entity, renderable] of sim.world.renderables.entries()) {
      const transform = sim.world.transforms.get(entity);
      if (!transform) continue;

      seen.add(entity);
      let sprite = this.entitySprites.get(entity);
      if (!sprite) {
        const asset = this.assets.get(renderable.assetKey);
        sprite = new Sprite(asset.texture);
        sprite.anchor.set(asset.anchorX, asset.anchorY);
        this.entityLayer.addChild(sprite);
        this.entitySprites.set(entity, sprite);
        this.entityAssetKeys.set(entity, renderable.assetKey);
      } else if (this.entityAssetKeys.get(entity) !== renderable.assetKey) {
        // The simulation changed what this entity *is* - a door that just swung
        // open. Swap the texture rather than rebuilding the sprite.
        const asset = this.assets.get(renderable.assetKey);
        sprite.texture = asset.texture;
        sprite.anchor.set(asset.anchorX, asset.anchorY);
        this.entityAssetKeys.set(entity, renderable.assetKey);
      }

      const x = lerp(transform.prevX, transform.x, alpha);
      const y = lerp(transform.prevY, transform.y, alpha);
      const screen = worldToScreen(x, y, projScratch);

      sprite.position.set(screen.x, screen.y + heightOffset(0));
      sprite.zIndex = depthOf(x, y);

      // A hit flash reads instantly, even on a small screen.
      const flash = sim.world.hitFlashes.get(entity);
      sprite.tint = flash ? 0xffffff : renderable.tint;

      // Actors keep their upright silhouette; only projectiles are scaled down.
      if (sim.world.projectiles.has(entity)) {
        sprite.scale.set(0.5);
      }

      // Loot drops bob gently so they read as pickups rather than scenery.
      if (sim.world.lootDrops.has(entity)) {
        const bob = Math.sin((sim.tick + entity) * 0.06) * 3;
        sprite.position.y += bob - 10;
        sprite.scale.set(0.42);
      }
    }

    for (const [entity, sprite] of this.entitySprites) {
      if (seen.has(entity)) continue;
      sprite.destroy();
      this.entitySprites.delete(entity);
      this.entityAssetKeys.delete(entity);
    }
  }

  /**
   * Breathe the anomaly fields.
   *
   * `phase` is advanced by the simulation, not by frame time, so every client
   * of the same seed sees the same rhythm - and a Rückstoß, whose pulse is a
   * timing puzzle, is never a frame ahead of the damage it deals.
   */
  private updateAnomalyFields(sim: RaidSimulation): void {
    for (const [entity, sprite] of this.anomalyFields) {
      const anomaly = sim.world.anomalies.get(entity);
      if (!anomaly) {
        sprite.visible = false;
        continue;
      }

      if (anomaly.kind === 'recoil') {
        // Wind-up: the field swells towards the pulse and snaps back after it,
        // so the player can read the rhythm instead of memorising a number.
        const t = clamp01(anomaly.timer / 3.2);
        sprite.alpha = 0.32 + t * t * 0.55;
        const swell = 1 + t * 0.12;
        sprite.width = anomaly.radius * ISO_X * 2 * swell;
        sprite.height = anomaly.radius * ISO_Y * 2 * swell;
        continue;
      }

      sprite.alpha = 0.42 + Math.sin(anomaly.phase) * 0.16;
    }
  }

  /**
   * Position and orient the flashlight.
   *
   * The holder carries the isometric squash and the sprite carries the
   * rotation, so the cone is the world-space cone mapped through the projection
   * rather than a screen-space wedge that happens to point roughly right.
   */
  private updateLightCone(sim: RaidSimulation, alpha: number): void {
    const holder = this.lightConeHolder;
    const sprite = this.lightConeSprite;
    if (!holder || !sprite) return;

    const player = sim.world.playerEntity;
    const tag = player !== null ? sim.world.players.get(player) : undefined;
    const transform = player !== null ? sim.world.transforms.get(player) : undefined;

    if (!tag?.lightOn || !transform) {
      holder.visible = false;
      return;
    }

    holder.visible = true;

    const x = lerp(transform.prevX, transform.x, alpha);
    const y = lerp(transform.prevY, transform.y, alpha);
    const screen = worldToScreen(x, y, projScratch);
    holder.position.set(screen.x, screen.y);

    const rotation = lerpAngle(transform.prevRotation, transform.rotation, alpha);
    // +45 degrees: the isometric map is a rotation by a quarter turn followed
    // by the non-uniform scale the holder applies.
    sprite.rotation = rotation + Math.PI / 4;
  }

  private updateWeather(dt: number): void {
    if (this.weatherParticles.length === 0) return;

    const halfW = this.camera.viewWidth * 0.5 + 60;
    const halfH = this.camera.viewHeight * 0.5 + 60;

    for (const particle of this.weatherParticles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;

      // Wrap rather than respawn: no allocation, and no visible popping.
      if (particle.x < -halfW) particle.x += halfW * 2;
      if (particle.x > halfW) particle.x -= halfW * 2;
      if (particle.y < -halfH) particle.y += halfH * 2;
      if (particle.y > halfH) particle.y -= halfH * 2;

      particle.sprite.position.set(particle.x, particle.y);
    }
  }

  private updateZones(sim: RaidSimulation): void {
    for (const zone of sim.world.extractionZones.values()) {
      const sprite = this.zoneRings.get(zone.zoneId);
      if (!sprite) continue;

      const open = zone.phase === 'available' || zone.phase === 'closing';
      sprite.visible = open;
      if (!open) continue;

      const pulse = 0.75 + Math.sin(sim.tick * 0.05) * 0.25;
      // A closing zone blinks faster and shifts towards the warning colour.
      sprite.alpha = zone.phase === 'closing' ? 0.5 + Math.sin(sim.tick * 0.18) * 0.5 : pulse;
      sprite.tint = zone.phase === 'closing' ? PALETTE.threat : 0xffffff;
    }
  }

  // ── Effects ──────────────────────────────────────────────────────────────

  private subscribe(sim: RaidSimulation): void {
    this.unsubscribes.push(
      sim.bus.on('weapon:fired', (event) => {
        const weapon = findWeapon(event.weaponId);
        this.spawnVfx('fx.muzzleflash', event.x, event.y, 0.1, 0.55, 0.2);
        this.camera.addShake(weapon?.weaponClass === 'shotgun' ? 0.35 : 0.12);
      }),
    );

    this.unsubscribes.push(
      sim.bus.on('projectile:impact', (event) => {
        const key = event.surface === 'actor' ? 'fx.impact.flesh' : 'fx.impact.wall';
        this.spawnVfx(key, event.x, event.y, 0.22, 0.3, 0.5);
      }),
    );

    this.unsubscribes.push(
      sim.bus.on('damage:dealt', (event) => {
        if (event.isPlayerTarget) return;
        this.spawnDamageNumber(event.amount, event.x, event.y, event.wasUnaware);
      }),
    );

    this.unsubscribes.push(
      sim.bus.on('entity:died', (event) => {
        this.spawnVfx('fx.impact.flesh', event.x, event.y, 0.5, 0.6, 1.4);
      }),
    );

    // A Rückstoß pulse is a timing puzzle, so it needs an unmistakable tell:
    // a shockwave the size of the field, plus a shake that scales with it.
    this.unsubscribes.push(
      sim.bus.on('anomaly:pulsed', (event) => {
        this.spawnVfx('fx.anomaly.recoil', event.x, event.y, 0.55, event.radius * 0.35, event.radius * 1.1);
        this.camera.addShake(0.4);
      }),
    );

    // An echo is a ghost, not an explosion: faint, brief, and gone.
    this.unsubscribes.push(
      sim.bus.on('anomaly:echo', (event) => {
        this.spawnVfx('fx.anomaly.echoshadow', event.x, event.y, 1.1, 0.5, 0.85);
      }),
    );

    this.unsubscribes.push(
      sim.bus.on('door:opened', (event) => {
        this.spawnVfx('fx.impact.wall', event.x, event.y, 0.3, 0.3, 0.7);
        if (event.wasLocked) this.camera.addShake(0.16);
      }),
    );

    this.unsubscribes.push(
      sim.bus.on('loot:pickedUp', (event) => {
        this.spawnVfx('fx.pickup', event.x, event.y, 0.35, 0.5, 1.1);
      }),
    );

    this.unsubscribes.push(
      sim.bus.on('throwable:detonated', (event) => {
        // Scale the flash with the blast so a frag reads bigger than a lure.
        this.spawnVfx('fx.impact.wall', event.x, event.y, 0.45, 0.4, event.radius * 0.9);
        if (event.kind === 'frag') this.camera.addShake(0.8);
        if (event.kind === 'flash') this.camera.addShake(0.45);
      }),
    );

    this.unsubscribes.push(
      sim.bus.on('melee:swing', (event) => {
        this.spawnVfx('fx.muzzleflash', event.x, event.y, 0.14, 0.3, 0.6);
      }),
    );

    this.unsubscribes.push(
      sim.bus.on('camera:shake', (event) => this.camera.addShake(event.intensity)),
    );
  }

  private spawnVfx(
    key: string,
    worldX: number,
    worldY: number,
    life: number,
    startScale: number,
    endScale: number,
  ): void {
    if (this.activeVfx.length >= MAX_VFX) return;

    let item = this.vfxPool.pop();
    if (!item) {
      const sprite = new Sprite();
      sprite.anchor.set(0.5);
      sprite.blendMode = 'add';
      this.vfxLayer.addChild(sprite);
      item = { sprite, life: 0, maxLife: 1, startScale: 1, endScale: 1 };
    }

    const asset = this.assets.get(key);
    item.sprite.texture = asset.texture;
    const screen = worldToScreen(worldX, worldY);
    item.sprite.position.set(screen.x, screen.y - 18);
    item.sprite.visible = true;
    item.sprite.alpha = 1;
    item.sprite.scale.set(startScale);
    item.life = life;
    item.maxLife = life;
    item.startScale = startScale;
    item.endScale = endScale;

    this.activeVfx.push(item);
  }

  private updateVfx(dt: number): void {
    for (let i = this.activeVfx.length - 1; i >= 0; i--) {
      const item = this.activeVfx[i] as VfxItem;
      item.life -= dt;

      if (item.life <= 0) {
        item.sprite.visible = false;
        this.activeVfx.splice(i, 1);
        this.vfxPool.push(item);
        continue;
      }

      const t = 1 - item.life / item.maxLife;
      item.sprite.alpha = 1 - t;
      const scale = item.startScale + (item.endScale - item.startScale) * t;
      item.sprite.scale.set(scale);
    }
  }

  private spawnDamageNumber(amount: number, worldX: number, worldY: number, critical: boolean): void {
    if (amount < 1 || this.damageNumbers.length > 24) return;

    const text = new Text({
      text: Math.round(amount).toString(),
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: critical ? 22 : 17,
        fontWeight: '700',
        fill: critical ? PALETTE.threat : PALETTE.bone,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    text.anchor.set(0.5);

    const screen = worldToScreen(worldX, worldY);
    text.position.set(screen.x, screen.y - 40);
    this.vfxLayer.addChild(text);

    this.damageNumbers.push({ text, life: 0.75, worldX, worldY });
  }

  private updateDamageNumbers(dt: number): void {
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const number = this.damageNumbers[i] as DamageNumber;
      number.life -= dt;

      if (number.life <= 0) {
        number.text.destroy();
        this.damageNumbers.splice(i, 1);
        continue;
      }

      number.text.position.y -= 34 * dt;
      number.text.alpha = clamp01(number.life / 0.4);
    }
  }

  // ── Debug ────────────────────────────────────────────────────────────────

  /** Draws AI perception state. Invaluable when tuning enemy behaviour. */
  private drawDebug(sim: RaidSimulation): void {
    const g = this.debugGraphics;
    g.clear();
    g.position.set(-this.offsetX, -this.offsetY);

    for (const [entity, agent] of sim.world.agents.entries()) {
      const transform = sim.world.transforms.get(entity);
      if (!transform) continue;

      const screen = worldToScreen(transform.x, transform.y);
      const color =
        agent.state === 'attack' || agent.state === 'chase'
          ? PALETTE.danger
          : agent.state === 'investigate'
            ? PALETTE.threat
            : PALETTE.extraction;

      g.circle(screen.x, screen.y, 8).stroke({ width: 2, color });

      // Squad role, so group behaviour is readable while tuning it.
      const member = sim.world.squadMembers.get(entity);
      if (member) {
        const roleColor =
          member.role === 'flank'
            ? PALETTE.rare
            : member.role === 'suppress'
              ? PALETTE.echo
              : PALETTE.bone;
        g.circle(screen.x, screen.y, 12).stroke({ width: 1, color: roleColor, alpha: 0.8 });
      }

      if (agent.target !== null) {
        const target = sim.world.transforms.get(agent.target);
        if (target) {
          const targetScreen = worldToScreen(target.x, target.y);
          g.moveTo(screen.x, screen.y)
            .lineTo(targetScreen.x, targetScreen.y)
            .stroke({ width: 1, color, alpha: 0.4 });
        }
      }
    }

    for (const [entity, anomaly] of sim.world.anomalies.entries()) {
      const transform = sim.world.transforms.get(entity);
      if (!transform) continue;
      const screen = worldToScreen(transform.x, transform.y);
      g.ellipse(screen.x, screen.y, anomaly.radius * ISO_X, anomaly.radius * ISO_Y).stroke({
        width: 1,
        color: PALETTE.echo,
        alpha: 0.6,
      });
      const core = anomaly.radius * getAnomaly(anomaly.kind).coreFraction;
      g.ellipse(screen.x, screen.y, core * ISO_X, core * ISO_Y).stroke({
        width: 1,
        color: PALETTE.danger,
        alpha: 0.7,
      });
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolate a heading the short way round, so it never spins on wrap. */
function lerpAngle(a: number, b: number, t: number): number {
  let delta = b - a;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}

function scaleColor(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

function darkenTowardVoid(color: number): number {
  return scaleColor(color, 0.35);
}

/** A wall completely surrounded by other walls can never be seen. */
function isEnclosed(
  grid: { isWall(cx: number, cy: number): boolean },
  cx: number,
  cy: number,
): boolean {
  return (
    grid.isWall(cx + 1, cy) &&
    grid.isWall(cx - 1, cy) &&
    grid.isWall(cx, cy + 1) &&
    grid.isWall(cx, cy - 1) &&
    grid.isWall(cx + 1, cy + 1) &&
    grid.isWall(cx - 1, cy - 1)
  );
}

/** Nearest fragment index for a wall cell, so it takes on that biome's look. */
function nearestFragment(sim: RaidSimulation, cx: number, cy: number): number {
  for (let radius = 1; radius <= 2; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const fragment = sim.grid.fragmentAt(cx + dx, cy + dy);
        if (fragment >= 0) return fragment;
      }
    }
  }
  return 0;
}
