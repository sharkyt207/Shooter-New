#!/usr/bin/env node
/**
 * PROJECT ECHO - PWA smoke test.
 *
 * Answers the two questions that decide whether the thing on a phone's home
 * screen is an app or a bookmark:
 *
 *   1. Does it install? Manifest parses, icons resolve, service worker active.
 *   2. Does it start with no network?
 *
 * Both are invisible to unit tests and to `smoke-browser.mjs`, which drives a
 * dev server at a domain root. This script serves the real `dist/` under a
 * **subpath**, exactly as GitHub Pages does at `/Shooter-New/`, because a
 * single absolute path anywhere in the build breaks there and nowhere else.
 *
 * It has already earned its place: the first run found a black screen offline.
 * The worker had cached the HTML but not the hashed bundles - by the time it
 * was active, the page had finished loading them, so its fetch handler never
 * saw them. It now reads them out of `index.html` at install time.
 *
 * Usage:
 *   npm run build && npm run smoke:pwa
 *
 * Options (environment variables):
 *   CHROMIUM_PATH  explicit Chromium binary, for preinstalled browsers
 *   PORT           static server port (default 4180)
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const PORT = Number(process.env['PORT'] ?? 4180);
/** The repository name, so the served path matches the GitHub Pages URL. */
const BASE = '/Shooter-New/';
const DIST = resolve('dist');

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('\n  dist/ fehlt. Zuerst `npm run build`.\n');
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    '\n  Playwright ist nicht installiert.\n' +
      '  npm install --no-save playwright && npx playwright install chromium\n',
  );
  process.exit(2);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.map': 'application/json; charset=utf-8',
};

// A dependency-free static server. `http-server` would do the same thing and be
// one more thing to install for one command (ADR-012).
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(404).end('not found');
    return;
  }

  let relative = url.pathname.slice(BASE.length) || 'index.html';
  if (relative.endsWith('/')) relative += 'index.html';

  // Path traversal is not a threat here, but a request that escapes `dist/`
  // would silently succeed and make the test meaningless.
  const file = join(DIST, normalize(relative).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }

  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  createReadStream(file).pipe(res);
});

await new Promise((done) => server.listen(PORT, done));
const target = `http://localhost:${PORT}${BASE}`;
console.log(`\n  Ziel: ${target}\n`);

const launchOptions = process.env['CHROMIUM_PATH']
  ? { executablePath: process.env['CHROMIUM_PATH'] }
  : {};
const browser = await chromium.launch(launchOptions);

// A phone in landscape with a coarse pointer - the target form factor.
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'de-DE',
});

const failures = [];
const page = await context.newPage();
page.on('pageerror', (error) => failures.push(`Seitenfehler: ${error}`));
page.on('console', (message) => {
  if (message.type() === 'error') failures.push(`Konsole: ${message.text()}`);
});
page.on('requestfailed', (request) => {
  failures.push(`Anfrage fehlgeschlagen: ${request.url()}`);
});

try {
  console.log('  1/3 Installierbarkeit');
  await page.goto(target, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const href = await page.getAttribute('link[rel=manifest]', 'href');
  if (!href) throw new Error('Kein <link rel="manifest"> im Dokument.');

  const manifest = await page.evaluate(async (url) => {
    const response = await fetch(url);
    return response.ok ? await response.json() : null;
  }, href);
  if (!manifest) throw new Error('Manifest nicht ladbar.');

  for (const field of ['name', 'start_url', 'display', 'icons']) {
    if (!manifest[field]) failures.push(`Manifest ohne "${field}"`);
  }

  const iconResults = await page.evaluate(
    async (sources) =>
      Promise.all(sources.map(async (src) => ({ src, status: (await fetch(src)).status }))),
    manifest.icons.map((icon) => icon.src),
  );
  for (const icon of iconResults) {
    if (icon.status !== 200) failures.push(`Icon fehlt: ${icon.src} (${icon.status})`);
  }
  // An installable icon needs 192 and 512; iOS additionally reads the
  // apple-touch-icon out of the document, which the manifest never covers.
  const sizes = new Set(manifest.icons.map((icon) => icon.sizes));
  for (const required of ['192x192', '512x512']) {
    if (!sizes.has(required)) failures.push(`Manifest ohne Icon ${required}`);
  }
  const appleIcon = await page.getAttribute('link[rel=apple-touch-icon]', 'href');
  if (!appleIcon) failures.push('Kein apple-touch-icon - iOS zeigt sonst einen Screenshot.');

  console.log(`      ${manifest.name} · ${manifest.display} · ${manifest.orientation ?? 'frei'}`);
  console.log(`      Icons: ${iconResults.map((i) => i.status).join(' ')} · Apple: ${appleIcon ?? '—'}`);

  console.log('  2/3 Service Worker');
  await page.waitForFunction(
    async () => (await navigator.serviceWorker.getRegistration())?.active != null,
    null,
    { timeout: 15000 },
  );
  console.log('      aktiv');

  // Walk one screen further so anything loaded lazily is loaded now.
  await page.getByRole('button', { name: 'Riss betreten' }).tap();
  await page.waitForTimeout(1500);

  console.log('  3/3 Start ohne Netz');
  await context.setOffline(true);
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);

  const playable = await page.getByRole('button', { name: 'Riss betreten' }).count();
  if (playable !== 1) {
    failures.push('Offline kein spielbares Hauptmenü - der Cache trägt den Start nicht.');
  }
  await page.screenshot({ path: '.smoke/pwa-offline.png' });
  console.log(`      ${playable === 1 ? 'Hauptmenü da' : 'FEHLGESCHLAGEN'} · screenshot: .smoke/pwa-offline.png`);
} catch (error) {
  failures.push(String(error));
} finally {
  await browser.close();
  server.close();
}

console.log(`\n  Fehler: ${failures.length}`);
for (const failure of failures) console.log(`    - ${failure}`);
console.log('');
process.exit(failures.length > 0 ? 1 : 0);
