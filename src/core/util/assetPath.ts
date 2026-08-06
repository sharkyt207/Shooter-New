/**
 * Resolving an asset manifest entry to something loadable.
 *
 * The manifest stores paths relative to `public/assets/` (ADR-008), and the
 * usual answer is to glue the base path in front. That breaks for an entry that
 * is *already* a complete reference - a `data:` URI in a single-file build, an
 * absolute path, a CDN address - where prefixing produces
 * `assets/data:image/png;base64,…` and a silently missing texture.
 *
 * One rule, in one place, because the two loaders that need it (`render` for
 * textures, `ui` for DOM images) would otherwise drift apart.
 */

/** A reference that already stands on its own and must not be prefixed. */
const ABSOLUTE = /^(?:data:|blob:|https?:|\/\/|\/)/i;

export function resolveAssetSrc(basePath: string, src: string): string {
  return ABSOLUTE.test(src) ? src : `${basePath}${src}`;
}
