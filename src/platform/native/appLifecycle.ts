/**
 * App lifecycle.
 *
 * A phone interrupts a game without asking: a call arrives, the player switches
 * apps, the system reclaims memory. The rule this module exists to enforce is
 * simple and absolute:
 *
 *   **Nothing is ever lost to an interruption.**
 *
 * The web gives us `visibilitychange` and `pagehide`; a native shell gives us
 * Capacitor's `appStateChange` and `pause`/`resume`, which fire more reliably
 * and earlier. Both are wired to the same two callbacks, so the game only has
 * to answer "what do I do when I lose focus" once.
 *
 * `pagehide` in particular is the last event an iOS web view is guaranteed to
 * deliver before being frozen or killed - saving there is not belt and braces,
 * it is the belt.
 */

import { isNative } from './nativeBridge';

export interface LifecycleHandlers {
  /** The app lost focus. Save, pause, and assume it may never come back. */
  onSuspend(): void;
  /** The app is in front again. */
  onResume(): void;
}

export interface LifecycleBinding {
  readonly name: string;
  detach(): void;
}

/**
 * Wire both the web and, when present, the native lifecycle.
 *
 * `onSuspend` may be called more than once for a single interruption - the two
 * sources overlap on purpose. Everything it does must therefore be idempotent,
 * which saving and pausing both are.
 */
export function bindLifecycle(handlers: LifecycleHandlers): LifecycleBinding {
  const detachers: Array<() => void> = [];

  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') handlers.onSuspend();
    else handlers.onResume();
  };
  document.addEventListener('visibilitychange', onVisibility);
  detachers.push(() => document.removeEventListener('visibilitychange', onVisibility));

  const onHide = (): void => handlers.onSuspend();
  window.addEventListener('pagehide', onHide);
  detachers.push(() => window.removeEventListener('pagehide', onHide));

  // Losing focus without being hidden still means the player is elsewhere -
  // a notification sheet on iOS, for instance.
  const onBlur = (): void => handlers.onSuspend();
  window.addEventListener('blur', onBlur);
  detachers.push(() => window.removeEventListener('blur', onBlur));

  if (isNative()) {
    void attachNative(handlers, detachers);
  }

  return {
    name: isNative() ? 'capacitor+web' : 'web',
    detach: () => {
      for (const detach of detachers) detach();
      detachers.length = 0;
    },
  };
}

async function attachNative(
  handlers: LifecycleHandlers,
  detachers: Array<() => void>,
): Promise<void> {
  try {
    const { App } = await import('@capacitor/app');

    const stateHandle = await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) handlers.onResume();
      else handlers.onSuspend();
    });
    detachers.push(() => void stateHandle.remove());

    // Fires on iOS when the app is about to be backgrounded, earlier than the
    // web view's own events.
    const pauseHandle = await App.addListener('pause', () => handlers.onSuspend());
    detachers.push(() => void pauseHandle.remove());

    const resumeHandle = await App.addListener('resume', () => handlers.onResume());
    detachers.push(() => void resumeHandle.remove());
  } catch {
    // No native bridge available; the web listeners above already cover us.
  }
}

/**
 * Ask the shell for a landscape lock and a dark status bar.
 *
 * Both are best-effort. The game is playable in portrait - it just wastes most
 * of the screen - so a refused lock is a cosmetic loss, not a failure, and the
 * portrait notice in the UI covers the browser case anyway.
 */
export async function applyDisplayPreferences(): Promise<void> {
  if (!isNative()) return;

  try {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation');
    await ScreenOrientation.lock({ orientation: 'landscape' });
  } catch {
    /* orientation lock unavailable */
  }

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.hide();
  } catch {
    /* status bar plugin unavailable */
  }
}
