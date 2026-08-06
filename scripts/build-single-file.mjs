#!/usr/bin/env node
/**
 * Build the whole game into one HTML file.
 *
 * Everything - the code, the styles, the emblem - ends up inside a single
 * document with no request to anything. That makes the game playable from
 * anywhere a file can be opened: a hosting environment with a strict
 * content-security policy, a file:// URL, an email attachment, a USB stick.
 *
 * Two things make it possible without a second codebase:
 *
 * 1. **One chunk.** `SINGLE_FILE=1` tells `vite.config.ts` to stop splitting
 *    PixiJS into its own chunk, so there is nothing left to import across
 *    files. The split exists to keep Pixi cached between releases, which is
 *    meaningless when the release *is* one file.
 * 2. **An injected manifest.** There is no `assets/` directory to fetch from,
 *    so the manifest is written into the page with the images as `data:` URIs.
 *    The game still knows only logical keys (ADR-008) - it just gets its
 *    manifest handed to it instead of fetching it.
 *
 * Usage:
 *   npm run build:single            # -> dist-single/project-echo.html
 *   OUT=/tmp/echo.html npm run build:single
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const OUT = resolve(process.env['OUT'] ?? 'dist-single/project-echo.html');
const DIST = resolve('dist');

console.log('\n  Bauen (eine Datei) …');
execFileSync('npx', ['vite', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, SINGLE_FILE: '1' },
});

const html = readFileSync(join(DIST, 'index.html'), 'utf8');

/** `<script type="module" src="./assets/x.js">` and the stylesheet link. */
const scriptMatch = /<script[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/.exec(html);
const styleMatch = /<link[^>]*rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/.exec(html);
if (!scriptMatch || !styleMatch) {
  console.error('\n  Konnte Skript oder Stylesheet in dist/index.html nicht finden.\n');
  process.exit(1);
}

const js = readFileSync(join(DIST, scriptMatch[1]), 'utf8');
const css = readFileSync(join(DIST, styleMatch[1]), 'utf8');

/**
 * Make text safe to inline regardless of how the page is decoded.
 *
 * A document with no charset declaration is decoded by guesswork, and a
 * browser that guesses Latin-1 turns every umlaut in this German game into two
 * characters. Inside a string literal that is ugly; inside the minified bundle
 * it is a syntax error, and the whole page is blank. That is exactly what
 * happened on the first attempt.
 *
 * Escaping to `\uXXXX` sidesteps the question: pure ASCII decodes identically
 * under every encoding a browser might pick. Per UTF-16 code unit, so surrogate
 * pairs come out as two escapes and survive the round trip.
 */
function toAscii(text) {
  return text.replace(/[^\x00-\x7f]/g, (char) =>
    `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

// The asset manifest, with every file turned into a data: URI. Read from the
// real manifest rather than hardcoded, so a new asset needs no change here.
const manifestPath = join(DIST, 'assets/manifest.json');
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : { textures: {} };

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };
let embedded = 0;
for (const entry of Object.values(manifest.textures ?? {})) {
  const file = join(DIST, 'assets', entry.src);
  if (!existsSync(file)) continue;
  const ext = entry.src.split('.').pop().toLowerCase();
  const mime = MIME[ext];
  if (!mime) continue;
  entry.src = `data:${mime};base64,${readFileSync(file).toString('base64')}`;
  embedded++;
}
delete manifest._readme;

// `</script>` inside a string literal would close the surrounding tag. JSON
// cannot contain a raw `<` in a way that matters, so escaping it is enough.
const manifestJson = toAscii(JSON.stringify(manifest)).replace(/</g, '\\u003c');

// The stylesheet is checked rather than escaped: CSS escapes are contextual
// (a `\\XXXX ` in a selector is not the same as in a content string), and Vite's
// output has never contained a non-ASCII byte. If that changes, this says so
// instead of shipping a mangled page.
if (/[^\x00-\x7f]/.test(css)) {
  console.error('\n  Stylesheet enthält Nicht-ASCII-Zeichen — bitte hier behandeln.\n');
  process.exit(1);
}

const page = `<style>
${css}
</style>

<div id="game-canvas" class="game-canvas"></div>
<div id="ui-root" class="ui-root"></div>

<script>
// Handed to the game instead of fetched: this document has no assets/ next to
// it. See scripts/build-single-file.mjs and ADR-008.
globalThis.__ECHO_ASSET_MANIFEST__ = ${manifestJson};
</script>

<script type="module">
${toAscii(js)}
</script>
`;

// The whole point of the escaping above. A single non-ASCII byte here means a
// page whose rendering depends on a guess.
const nonAscii = /[^\x00-\x7f]/.exec(page);
if (nonAscii) {
  console.error(`\n  Nicht-ASCII-Zeichen an Position ${nonAscii.index}: ${JSON.stringify(nonAscii[0])}\n`);
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, page);

const kb = (Buffer.byteLength(page) / 1024).toFixed(0);
console.log(`\n  ${OUT}`);
console.log(`  ${kb} kB · ${embedded} Asset(s) eingebettet · keine externen Anfragen\n`);
