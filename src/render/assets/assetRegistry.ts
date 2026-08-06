/**
 * Logical asset key -> texture (ADR-008).
 *
 * The rest of the codebase only ever names things like `actor.player` or
 * `icon.item.medkit`. File paths exist in exactly one place: the manifest at
 * `public/assets/manifest.json`. A key with no manifest entry - or whose file
 * fails to load - silently falls back to a procedural placeholder.
 *
 * That fallback is the whole point: replacing Canva placeholders with final art
 * is a manifest edit, and a missing file is never a crash.
 */

import { Assets, Texture } from 'pixi.js';
import { createLogger } from '@/core/util/logger';
import { PlaceholderFactory, type PlaceholderSpec } from './placeholderFactory';

const log = createLogger('assets');

export interface TextureManifestEntry {
  src: string;
  /** Anchor as [x, y] in 0..1. Defaults to the placeholder's anchor. */
  anchor?: [number, number];
  /** 9-slice insets [left, top, right, bottom] for scalable UI panels. */
  slice9?: [number, number, number, number];
}

export interface AssetManifest {
  version: number;
  textures: Record<string, TextureManifestEntry>;
}

export interface ResolvedAsset {
  texture: Texture;
  anchorX: number;
  anchorY: number;
  /** True when this is a procedural stand-in rather than real art. */
  isPlaceholder: boolean;
}

const EMPTY_MANIFEST: AssetManifest = { version: 0, textures: {} };

export class AssetRegistry {
  private manifest: AssetManifest = EMPTY_MANIFEST;
  private readonly resolved = new Map<string, ResolvedAsset>();
  private readonly missingKeys = new Set<string>();

  constructor(
    private readonly placeholders: PlaceholderFactory,
    private readonly basePath = 'assets/',
  ) {}

  /**
   * Load the manifest and pre-load every referenced texture.
   * Failures are logged and degrade to placeholders - never thrown.
   */
  async load(): Promise<void> {
    try {
      const response = await fetch(`${this.basePath}manifest.json`, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.manifest = (await response.json()) as AssetManifest;
    } catch (error) {
      log.info('Kein Asset-Manifest gefunden - es werden Platzhalter verwendet.', error);
      this.manifest = EMPTY_MANIFEST;
      return;
    }

    const entries = Object.entries(this.manifest.textures ?? {});
    if (entries.length === 0) return;

    await Promise.all(
      entries.map(async ([key, entry]) => {
        try {
          const texture = await Assets.load<Texture>(`${this.basePath}${entry.src}`);
          const spec = PlaceholderFactory.specFor(key);
          this.resolved.set(key, {
            texture,
            anchorX: entry.anchor?.[0] ?? spec.anchorX,
            anchorY: entry.anchor?.[1] ?? spec.anchorY,
            isPlaceholder: false,
          });
        } catch (error) {
          log.warn(`Asset "${key}" (${entry.src}) konnte nicht geladen werden.`, error);
        }
      }),
    );

    log.info(`${this.resolved.size} von ${entries.length} Assets geladen.`);
  }

  /** Resolve a key. Always returns something drawable. */
  get(key: string): ResolvedAsset {
    const existing = this.resolved.get(key);
    if (existing) return existing;

    if (!this.missingKeys.has(key)) {
      this.missingKeys.add(key);
      log.debug(`Platzhalter für "${key}".`);
    }

    const spec: PlaceholderSpec = PlaceholderFactory.specFor(key);
    const asset: ResolvedAsset = {
      texture: this.placeholders.get(key),
      anchorX: spec.anchorX,
      anchorY: spec.anchorY,
      isPlaceholder: true,
    };
    this.resolved.set(key, asset);
    return asset;
  }

  getTexture(key: string): Texture {
    return this.get(key).texture;
  }

  /** Register a texture built at runtime (darkness mask, zone rings, ...). */
  register(key: string, texture: Texture, anchorX = 0.5, anchorY = 0.5): void {
    this.resolved.set(key, { texture, anchorX, anchorY, isPlaceholder: true });
  }

  /**
   * Keys that fell back to placeholders.
   * Feeds the asset report so the art team can see exactly what is still open.
   */
  getMissingKeys(): readonly string[] {
    return [...this.missingKeys].sort();
  }

  destroy(): void {
    this.resolved.clear();
    this.missingKeys.clear();
  }
}
