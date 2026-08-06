/**
 * Logical asset keys for the DOM overlay.
 *
 * The renderer resolves keys to Pixi textures; the UI needs the same keys to
 * resolve to *URLs*, because a menu is HTML and an `<img>` needs a `src`.
 *
 * The reason this file exists rather than a path in a stylesheet: ADR-008 says
 * file paths live in exactly one place, the manifest. A logo hardcoded into
 * CSS would be the second place, and the second place is where the rule starts
 * to rot. So the UI reads the same manifest, and a missing entry produces no
 * image rather than a broken one — the menu still works, it just has no mark.
 */

const BASE_PATH = 'assets/';

interface ManifestEntry {
  src: string;
}

interface Manifest {
  textures?: Record<string, ManifestEntry>;
}

let manifest: Manifest = {};

/** Load the manifest once at startup. Never throws; a failure means placeholders. */
export async function loadUiAssets(): Promise<void> {
  try {
    const response = await fetch(`${BASE_PATH}manifest.json`, { cache: 'no-cache' });
    if (!response.ok) return;
    manifest = (await response.json()) as Manifest;
  } catch {
    // No manifest is a normal state: the game shipped playable without one.
    manifest = {};
  }
}

/** URL for a logical key, or null when no real asset is registered for it. */
export function assetUrl(key: string): string | null {
  const entry = manifest.textures?.[key];
  return entry ? `${BASE_PATH}${entry.src}` : null;
}

export function hasAsset(key: string): boolean {
  return assetUrl(key) !== null;
}
