/**
 * Haptics.
 *
 * On a touch screen the player has no trigger to feel and no controller to
 * rumble, so a short tap of vibration is the only physical feedback the game
 * can give. Used sparingly and always for something that *happened to the
 * player*, never for something they did on purpose - a buzz on every shot is
 * noise, a buzz on being hit is information.
 *
 * Web builds fall back to the Vibration API, which desktop browsers and iOS
 * Safari simply ignore. That is the correct behaviour: haptics are a bonus,
 * never a channel the game depends on.
 */

import { isNative } from './nativeBridge';

export type HapticStrength = 'light' | 'medium' | 'heavy';

export interface HapticsService {
  readonly name: string;
  /** A single tap. */
  impact(strength: HapticStrength): void;
  /** Two quick taps - used for a warning, never for a reward. */
  warn(): void;
  setEnabled(enabled: boolean): void;
}

/** Milliseconds per strength for the web Vibration API. */
const WEB_PATTERN: Record<HapticStrength, number> = {
  light: 10,
  medium: 22,
  heavy: 40,
};

export class WebHaptics implements HapticsService {
  readonly name = 'web';
  private enabled = true;

  impact(strength: HapticStrength): void {
    if (!this.enabled) return;
    try {
      globalThis.navigator?.vibrate?.(WEB_PATTERN[strength]);
    } catch {
      // Vibration is unsupported or blocked by a permissions policy.
    }
  }

  warn(): void {
    if (!this.enabled) return;
    try {
      globalThis.navigator?.vibrate?.([18, 60, 18]);
    } catch {
      /* see above */
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

/**
 * Silence, with the full signature.
 *
 * The parameters are declared even though nothing is done with them: a null
 * implementation should be substitutable for the real one at the concrete type,
 * not only through the interface.
 */
export class NullHaptics implements HapticsService {
  readonly name = 'null';

  impact(strength: HapticStrength): void {
    void strength;
  }

  warn(): void {
    /* intentionally silent */
  }

  setEnabled(enabled: boolean): void {
    void enabled;
  }
}

/**
 * Native haptics through Capacitor.
 *
 * The plugin is imported lazily: a browser build must never pay to download a
 * native bridge it will not use, and the import is only reached when the app is
 * actually running inside a shell.
 */
export class NativeHaptics implements HapticsService {
  readonly name = 'capacitor';
  private enabled = true;
  private plugin: typeof import('@capacitor/haptics') | null = null;

  async load(): Promise<void> {
    this.plugin = await import('@capacitor/haptics');
  }

  impact(strength: HapticStrength): void {
    if (!this.enabled || !this.plugin) return;
    const style = this.plugin.ImpactStyle;
    void this.plugin.Haptics.impact({
      style: strength === 'heavy' ? style.Heavy : strength === 'medium' ? style.Medium : style.Light,
    }).catch(() => {
      // A failed vibration is never worth interrupting a raid for.
    });
  }

  warn(): void {
    if (!this.enabled || !this.plugin) return;
    void this.plugin.Haptics.notification({
      type: this.plugin.NotificationType.Warning,
    }).catch(() => {
      /* see above */
    });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

/** The right implementation for wherever this build is running. */
export async function createHaptics(): Promise<HapticsService> {
  if (!isNative()) return new WebHaptics();
  const haptics = new NativeHaptics();
  try {
    await haptics.load();
    return haptics;
  } catch {
    return new WebHaptics();
  }
}
