/**
 * Persistence behind an interface.
 *
 * LocalStorage today; Capacitor Preferences or SQLite from M6 without touching
 * a single call site. The async signature is deliberate even though
 * localStorage is synchronous - every native storage API is async, and
 * retrofitting that later would ripple through the whole save flow.
 */

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

export const SAVE_KEY = 'profile';
