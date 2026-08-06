/**
 * The one place that knows whether we are running inside a native shell.
 *
 * Everything else asks this module, so "is this a phone?" never leaks into game
 * code, and a browser build never pays for a native import it cannot use.
 *
 * **Why the injected global instead of `import { Capacitor }`.** Importing
 * `@capacitor/core` for this answer put 43 kB of native bridge into the web
 * bundle - for a string comparison. On native, Capacitor injects
 * `window.Capacitor` before any application code runs, and `getPlatform()` reads
 * exactly the value used here. Everything heavier (haptics, preferences, the
 * app lifecycle) is imported lazily and only ever on a device, so the browser
 * build downloads none of it.
 */

export type NativePlatform = 'ios' | 'android' | 'web';

/** The shape Capacitor injects on a native platform. */
interface CapacitorGlobal {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
}

let cachedPlatform: NativePlatform | null = null;

export function platformName(): NativePlatform {
  if (cachedPlatform) return cachedPlatform;
  try {
    const injected = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
    const name = injected?.getPlatform?.();
    cachedPlatform = name === 'ios' || name === 'android' ? name : 'web';
  } catch {
    // No runtime at all - unit tests, or an embedding that blocks globals.
    cachedPlatform = 'web';
  }
  return cachedPlatform;
}

/** Reset the memoised answer. Tests only. */
export function resetPlatformCache(): void {
  cachedPlatform = null;
}

export function isNative(): boolean {
  return platformName() !== 'web';
}

export function isIos(): boolean {
  return platformName() === 'ios';
}

/**
 * True for a device that is *probably* a phone or tablet, native or not.
 *
 * Used for choosing input defaults and HUD scale, so it deliberately also
 * catches a browser on a phone - the controls have to fit a thumb either way.
 */
export function isTouchDevice(): boolean {
  if (isNative()) return true;
  if (typeof globalThis.matchMedia !== 'function') return false;
  return globalThis.matchMedia('(pointer: coarse)').matches;
}
