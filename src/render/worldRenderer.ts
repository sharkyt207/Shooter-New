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
 *   5. darkness   radial mask centred on the player
 *   6. overlay    additive lights punched back through the darkness
 */

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { ANOMALY } from '@/content/balance';
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

export class WorldRenderer {
  readonly stage = new Container();
  readonly camera: Camera;

  private readonly world = new Container();
  private readonly floorLayer = new Graphics();
  private readonly groundLayer = new Container();
  private readonly entityLayer = new Container();
  private readonly vfxLayer = new Container();
  private readonly darknessLayer = new Container();
  private readonly lightLayer = new Container();

  private readonly entitySprites = new Map<EntityId, Sprite>();
  private readonly wallPool: Sprite[] = [];
  private wallsUsed = 0;
  private readonly vfxPool: VfxItem[] = [];
  private readonly activeVfx: VfxItem[] = [];
  private readonly damageNumbers: DamageNumber[] = [];

  private darknessSprite: Sprite | null = null;
  private readonly zoneRings = new Map<string, Sprite>();
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
    this.world.addChild(this.floorLayer, this.groundLayer, this.entityLayer, this.vfxLayer);
    this.stage.addChild(this.world, this.darknessLayer, this.lightLayer, this.debugGraphics);

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

    this.groundLayer.removeChildren();
    this.zoneRings.clear();

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
    this.updateEntities(sim, alpha);
    this.updateZones(sim);
    this.updateVfx(dt);
    this.updateDamageNumbers(dt);
    if (this.debugEnabled) this.drawDebug(sim);
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
    // far away so the player can decide whether to approach.
    for (const [entity, anomaly] of sim.world.anomalies.entries()) {
      const transform = sim.world.transforms.get(entity);
      if (!transform) continue;

      const sprite = new Sprite(this.assets.getTexture('fx.anomaly.core'));
      sprite.anchor.set(0.5);
      const screen = worldToScreen(transform.x, transform.y);
      sprite.position.set(screen.x, screen.y);
      sprite.width = anomaly.radius * ISO_X * 2;
      sprite.height = anomaly.radius * ISO_Y * 2;
      sprite.alpha = 0.55;
      sprite.blendMode = 'add';
      this.groundLayer.addChild(sprite);
    }
  }

  private buildDarkness(sim: RaidSimulation): void {
    if (!this.darknessSprite) {
      const biome = getBiome(sim.map.fragments[0]?.biomeId ?? 'biome_lab');
      const texture = this.placeholders.buildDarkness(512, darkenTowardVoid(biome.ambientColor));
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      this.darknessLayer.addChild(sprite);
      this.darknessSprite = sprite;
      this.resize(this.camera.viewWidth, this.camera.viewHeight);
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

    this.unsubscribes.push(
      sim.bus.on('loot:pickedUp', (event) => {
        this.spawnVfx('fx.pickup', event.x, event.y, 0.35, 0.5, 1.1);
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
      const core = anomaly.radius * ANOMALY.stillnessCoreFraction;
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
