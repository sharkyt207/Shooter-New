/**
 * Persistence behind an interface.
 *
 * The async signature was deliberate from M1 even though localStorage is
 * synchronous - every native storage API is async, and retrofitting that later
 * would have rippled through the whole save flow. M6 collected on that: the
 * native adapter below dropped in without a single call site changing.
 *
 * Why native storage matters here specifically: a web view's localStorage is
 * *evictable*. iOS clears it when the device is low on space, and a player who
 * loses a stash to a storage sweep does not come back. Capacitor Preferences
 * writes to `UserDefaults` / `SharedPreferences`, which the system treats as
 * app data rather than as cache.
 */

import { isNative } from '@/platform/native/nativeBridge';

export interface StorageAdapter {
  readonly name: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class LocalStorageAdapter implements StorageAdapter {
  readonly name = 'localStorage';

  constructor(private readonly prefix = 'project-echo:') {}

  async get(key: string): Promise<string | null> {
    try {
      return globalThis.localStorage?.getItem(this.prefix + key) ?? null;
    } catch {
      // Private browsing modes can throw on access. A missing save is
      // recoverable; a crash on startup is not.
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      globalThis.localStorage?.setItem(this.prefix + key, value);
    } catch {
      // Quota exceeded or storage disabled - the game continues, unsaved.
    }
  }

  async remove(key: string): Promise<void> {
    try {
      globalThis.localStorage?.removeItem(this.prefix + key);
    } catch {
      // Nothing sensible to do; deletion failing is harmless.
    }
  }
}

/** In-memory adapter for tests and for environments without storage. */
export class MemoryStorageAdapter implements StorageAdapter {
  readonly name = 'memory';
  private readonly data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }
}

/**
 * Native key-value storage through Capacitor Preferences.
 *
 * The plugin is imported lazily so a browser build never downloads a bridge it
 * cannot use. If the import fails for any reason the caller falls back to
 * localStorage - an evictable save is still far better than no save.
 */
export class NativePreferencesAdapter implements StorageAdapter {
  readonly name = 'capacitor-preferences';
  private plugin: typeof import('@capacitor/preferences') | null = null;

  async load(): Promise<void> {
    this.plugin = await import('@capacitor/preferences');
  }

  async get(key: string): Promise<string | null> {
    if (!this.plugin) return null;
    try {
      const { value } = await this.plugin.Preferences.get({ key });
      return value ?? null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.plugin) return;
    try {
      await this.plugin.Preferences.set({ key, value });
    } catch {
      // Nothing sensible to do mid-raid; the next save will try again.
    }
  }

  async remove(key: string): Promise<void> {
    if (!this.plugin) return;
    try {
      await this.plugin.Preferences.remove({ key });
    } catch {
      /* deletion failing is harmless */
    }
  }
}

/** The best storage this build can reach. */
export async function createStorage(): Promise<StorageAdapter> {
  if (!isNative()) return new LocalStorageAdapter();

  const native = new NativePreferencesAdapter();
  try {
    await native.load();
    return native;
  } catch {
    return new LocalStorageAdapter();
  }
}

export const SAVE_KEY = 'profile';
