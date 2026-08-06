/**
 * Registering the service worker.
 *
 * A platform adapter like every other native capability (ADR-015): the app asks
 * once, and everything that can go wrong is handled here rather than at the
 * call site. A browser without service workers, a page served over plain HTTP,
 * a registration the user has blocked — none of those are errors the game needs
 * to know about. It simply runs online-only.
 *
 * Not registered in development. A cached bundle during development is a bug
 * that looks like a mystery: the file on disk is right, the browser is wrong,
 * and the reason is invisible.
 */

import { createLogger } from '@/core/util/logger';

const log = createLogger('pwa');

export async function registerServiceWorker(): Promise<void> {
  if (import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;

  try {
    // Relative, so the same build works at a domain root, in a repository
    // subpath on GitHub Pages, and inside a Capacitor web view.
    await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (error) {
    // Blocked, unsupported, or served from a context that forbids it. The game
    // works without it; only the offline start is lost.
    log.warn('Service Worker nicht registriert.', error);
  }
}
