/**
 * M6: the platform layer.
 *
 * These are the seams between the game and a phone. What they all have to get
 * right is the *absence* case: every one of them runs in a browser, in a unit
 * test and inside a native shell, and only the last one has any of the APIs.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { INPUT } from '@/content/balance';
import { TouchInput } from '@/platform/input/touchInput';
import { LocalStorageAdapter, createStorage } from '@/platform/storage/storageAdapter';
import { NullHaptics, WebHaptics, createHaptics } from './haptics';
import { isNative, isTouchDevice, platformName, resetPlatformCache } from './nativeBridge';

type Mutable = { Capacitor?: { getPlatform?: () => string } };

function injectCapacitor(platform: string | null): void {
  const target = globalThis as Mutable;
  if (platform === null) delete target.Capacitor;
  else target.Capacitor = { getPlatform: () => platform };
  resetPlatformCache();
}

afterEach(() => {
  injectCapacitor(null);
  vi.unstubAllGlobals();
});

describe('platform detection', () => {
  it('reports web when there is no native runtime', () => {
    injectCapacitor(null);
    expect(platformName()).toBe('web');
    expect(isNative()).toBe(false);
  });

  it('reads the platform Capacitor injects', () => {
    injectCapacitor('ios');
    expect(platformName()).toBe('ios');
    expect(isNative()).toBe(true);

    injectCapacitor('android');
    expect(platformName()).toBe('android');
  });

  it('treats an unknown platform string as web', () => {
    // Better to fall back to the implementation that always works than to
    // guess at a shell we know nothing about.
    injectCapacitor('electron');
    expect(platformName()).toBe('web');
  });

  it('survives a runtime that throws', () => {
    (globalThis as Mutable).Capacitor = {
      getPlatform: () => {
        throw new Error('sandboxed');
      },
    };
    resetPlatformCache();
    expect(platformName()).toBe('web');
  });

  it('counts a native build as a touch device without asking matchMedia', () => {
    injectCapacitor('ios');
    expect(isTouchDevice()).toBe(true);
  });
});

describe('storage selection', () => {
  it('uses localStorage in a browser', async () => {
    injectCapacitor(null);
    const storage = await createStorage();
    expect(storage.name).toBe('localStorage');
  });

  it('never throws when storage is unavailable', async () => {
    // Private browsing and some embeddings throw on access. A missing save is
    // recoverable; a crash on startup is not.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });

    const storage = new LocalStorageAdapter();
    await expect(storage.get('profile')).resolves.toBeNull();
    await expect(storage.set('profile', 'x')).resolves.toBeUndefined();
    await expect(storage.remove('profile')).resolves.toBeUndefined();
  });
});

describe('haptics', () => {
  it('falls back to the web implementation off-device', async () => {
    injectCapacitor(null);
    const haptics = await createHaptics();
    expect(haptics.name).toBe('web');
  });

  it('vibrates through the web API and respects the setting', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });

    const haptics = new WebHaptics();
    haptics.impact('heavy');
    expect(vibrate).toHaveBeenCalledTimes(1);

    haptics.setEnabled(false);
    haptics.impact('heavy');
    haptics.warn();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('is silent, not broken, where vibration does not exist', () => {
    vi.stubGlobal('navigator', {});
    const haptics = new WebHaptics();
    expect(() => {
      haptics.impact('light');
      haptics.warn();
    }).not.toThrow();

    const nothing = new NullHaptics();
    expect(() => {
      nothing.impact('heavy');
      nothing.warn();
    }).not.toThrow();
  });
});

describe('touch stick sizing', () => {
  const stub = { addEventListener() {}, removeEventListener() {} } as unknown as HTMLElement;

  it('scales with the short screen edge', () => {
    const input = new TouchInput(stub);

    input.resize(1180, 820);
    const tablet = input.stickRadius;

    input.resize(844, 390);
    const phone = input.stickRadius;

    // A thumb sweep is a physical distance: the bigger screen gets the bigger
    // circle, but neither is a fixed pixel count.
    expect(tablet).toBeGreaterThan(phone);
    expect(phone).toBeCloseTo(390 * INPUT.stickRadiusFraction, 5);
  });

  it('clamps at both ends so extreme screens stay playable', () => {
    const input = new TouchInput(stub);

    input.resize(320, 200);
    expect(input.stickRadius).toBe(INPUT.stickRadiusMinPx);

    input.resize(4000, 3000);
    expect(input.stickRadius).toBe(INPUT.stickRadiusMaxPx);
  });

  it('starts from a sane default before the first resize', () => {
    expect(new TouchInput(stub).stickRadius).toBe(INPUT.stickRadiusPx);
  });
});
