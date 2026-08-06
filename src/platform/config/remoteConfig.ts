/**
 * Fetching a balance patch — the only outbound request this game makes.
 *
 * Off unless `VITE_BALANCE_CONFIG_URL` is set at build time, and there is no
 * default URL: a build that was not deliberately pointed at a config server
 * talks to nobody. That matters beyond taste. "Does the app make network
 * requests" is a question both stores ask, and the honest answer for the
 * shipped build has to be reachable by reading this file.
 *
 * Nothing is *sent*. This is a GET of a static document; no identifier, no
 * profile, no telemetry (ADR-017). The request is anonymous in the strict
 * sense that the server learns an IP address and nothing else.
 *
 * Every failure path returns `null`, and `null` means "play with the shipped
 * numbers". A config server that is down, slow, blocked by a captive portal or
 * serving nonsense must never be the reason a player cannot start a raid -
 * which is also why `TIMEOUT_MS` is short enough to be invisible.
 */

import { createLogger } from '@/core/util/logger';

const log = createLogger('config');

/** How long a boot may wait for balance numbers before starting without them. */
const TIMEOUT_MS = 2500;

/** Reject anything larger unread. A patch is a few kilobytes of numbers. */
const MAX_BYTES = 64 * 1024;

export interface RemoteConfigSource {
  /** Returns parsed JSON, or null if there is nothing usable. */
  fetch(): Promise<unknown>;
}

/** The URL this build was pointed at, or null when it was pointed at nobody. */
export function configuredUrl(): string | null {
  const url = import.meta.env['VITE_BALANCE_CONFIG_URL'];
  return typeof url === 'string' && url.length > 0 ? url : null;
}

export function createRemoteConfig(url: string | null = configuredUrl()): RemoteConfigSource {
  if (url === null) return { fetch: async () => null };

  return {
    async fetch() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await globalThis.fetch(url, {
          signal: controller.signal,
          // No cookies, no credentials, ever. There is no session to carry.
          credentials: 'omit',
          cache: 'no-cache',
        });
        if (!response.ok) return null;

        const length = Number(response.headers.get('content-length') ?? 0);
        if (length > MAX_BYTES) {
          log.warn(`Balance-Konfiguration zu groß (${length} Bytes), ignoriert.`);
          return null;
        }

        const text = await response.text();
        if (text.length > MAX_BYTES) return null;
        return JSON.parse(text);
      } catch {
        // Offline, timed out, blocked, malformed. All the same answer.
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
