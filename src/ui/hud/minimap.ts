/**
 * Minimap.
 *
 * Drawn on its own small 2D canvas: the map geometry is static, so it is
 * rasterised once into an offscreen canvas and only the moving markers are
 * redrawn each frame. That keeps a per-frame cost that would otherwise be
 * surprisingly high down to a single blit plus a few dots.
 *
 * Deliberately shows terrain, the player and extraction zones - but never
 * enemies. Knowing where everything is would dissolve the tension the whole
 * game is built on (Pillar P3).
 */

import type { HudViewModel } from '@/ui/viewModel';
import { el } from '@/ui/components/dom';
import type { MinimapGrid } from './hud';

const COLOR_FLOOR = '#1c2331';
const COLOR_WALL = '#0b0e14';
const COLOR_PLAYER = '#38e1d4';
const COLOR_ZONE_OPEN = '#5be37a';
const COLOR_ZONE_CLOSING = '#ffb13d';
const COLOR_ZONE_LOCKED = '#3d4a5f';

export class Minimap {
  readonly root: HTMLElement;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private terrain: HTMLCanvasElement | null = null;
  private terrainKey = '';

  constructor(private readonly size: number) {
    this.canvas = document.createElement('canvas');
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;

    this.ctx = this.canvas.getContext('2d');
    this.ctx?.scale(dpr, dpr);

    this.root = el('div', { className: 'hud__minimap' });
    this.root.appendChild(this.canvas);
  }

  update(vm: HudViewModel, grid: MinimapGrid): void {
    const ctx = this.ctx;
    if (!ctx) return;

    this.ensureTerrain(grid);

    ctx.clearRect(0, 0, this.size, this.size);
    if (this.terrain) ctx.drawImage(this.terrain, 0, 0, this.size, this.size);

    const scale = this.size / Math.max(grid.width, grid.height);
    const worldToMap = (x: number, y: number): [number, number] => [
      (x / grid.cellSize) * scale,
      (y / grid.cellSize) * scale,
    ];

    for (const zone of vm.zones) {
      if (zone.phase === 'closed' || zone.phase === 'used') continue;
      const [mx, my] = worldToMap(zone.x, zone.y);
      ctx.fillStyle =
        zone.phase === 'available'
          ? COLOR_ZONE_OPEN
          : zone.phase === 'closing'
            ? COLOR_ZONE_CLOSING
            : COLOR_ZONE_LOCKED;
      // A locked zone is drawn hollow: the player knows where it is, but also
      // that it is not an option yet.
      ctx.beginPath();
      ctx.arc(mx, my, zone.phase === 'locked' ? 2 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const [px, py] = worldToMap(vm.playerX, vm.playerY);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(vm.playerRotation);
    ctx.fillStyle = COLOR_PLAYER;
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(-3, 3.5);
    ctx.lineTo(-3, -3.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Rasterise the static terrain once per map. */
  private ensureTerrain(grid: MinimapGrid): void {
    const key = `${grid.width}x${grid.height}`;
    if (this.terrain && this.terrainKey === key) return;

    const canvas = document.createElement('canvas');
    canvas.width = grid.width;
    canvas.height = grid.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = COLOR_WALL;
    ctx.fillRect(0, 0, grid.width, grid.height);
    ctx.fillStyle = COLOR_FLOOR;
    for (let cy = 0; cy < grid.height; cy++) {
      for (let cx = 0; cx < grid.width; cx++) {
        if (!grid.isWall(cx, cy)) ctx.fillRect(cx, cy, 1, 1);
      }
    }

    this.terrain = canvas;
    this.terrainKey = key;

    // Nearest-neighbour keeps the map crisp rather than a blurry smear.
    if (this.ctx) this.ctx.imageSmoothingEnabled = false;
  }
}
