/**
 * Service worker — so the game starts on a phone without a network.
 *
 * Two jobs, and only two:
 *
 * 1. **Start offline.** A game on a home screen that shows a browser error page
 *    in the underground is not an app. The shell and the code are cached.
 * 2. **Never show a stale build.** This is a *test* build. A cache that serves
 *    yesterday's bug is worse than no cache at all, because the bug report is
 *    then about code nobody changed.
 *
 * Those two goals conflict only in appearance. Vite gives every built file a
 * content hash (`index-BtQtB9H3.js`), so a hashed file can be cached forever:
 * a new build produces a *different name*, never different content under the
 * same name. Only `index.html` and the asset manifest can change in place, and
 * those are fetched from the network first.
 *
 * Deliberately hand-written rather than generated. It is 80 lines, it is the
 * only thing between the player and a blank screen, and a plugin that emits
 * something similar would have to be understood too — plus it would be a build
 * dependency, which ADR-012 makes us justify rather than assume.
 */

const CACHE = 'project-echo-v1';

/** Fixed part of the shell: files whose names never change. */
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './assets/manifest.json'];

/**
 * The hashed bundles, discovered from `index.html` at install time.
 *
 * They cannot be listed here — their names change with every build — and
 * caching them lazily on first use does not work either: by the time this
 * worker is active, the page that would have requested them has already
 * finished loading. The first offline launch would then find the HTML in the
 * cache, the code missing, and show a black screen. That was the first thing
 * the offline test caught.
 *
 * Parsing HTML with a regular expression is normally a bad idea. Here the input
 * is Vite's own generated `index.html` with a fixed shape, `DOMParser` does not
 * exist in a service worker, and the alternative is a build plugin — a
 * dependency, which ADR-012 asks us to justify rather than assume.
 */
async function bundleUrls() {
  try {
    const response = await fetch('./index.html', { cache: 'no-cache' });
    if (!response.ok) return [];
    const html = await response.text();
    const found = new Set();
    for (const match of html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)) found.add(match[1]);
    return [...found];
  } catch {
    return [];
  }
}

self.addEventListener('install', (event) => {
  // A partly-populated cache is fine: every entry is re-fetchable, and failing
  // the whole install because one file 404s would leave no cache at all.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const urls = [...SHELL, ...(await bundleUrls())];
      await Promise.allSettled(urls.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** A Vite build artefact: `name-<8+ chars of base64url hash>.ext`. */
function isImmutable(url) {
  return /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(js|css|png|jpg|webp|woff2?)$/.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The HTML shell: network first, so a deploy is picked up on the next launch.
  // The cache is the fallback for being offline, not the default answer.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit ?? Response.error())),
    );
    return;
  }

  // Content-addressed and therefore safe to answer from the cache forever.
  if (isImmutable(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else - the asset manifest, icons, a balance config: fresh when
  // the network allows it, cached when it does not.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit ?? Response.error())),
  );
});
