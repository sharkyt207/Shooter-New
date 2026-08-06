/**
 * Camera: smooth follow, aim lead and shake.
 *
 * Frame-rate independent damping (not a fixed lerp factor), so the camera feels
 * identical at 30 and 60 FPS - which matters, because the same build ships to
 * both.
 */

import { CAMERA } from '@/content/balance';
import { damp } from '@/core/math/scalar';
import type { SeededRandom } from '@/core/math/random';

export class Camera {
  /** Camera position in world metres. */
  x = 0;
  y = 0;

  private shakeIntensity = 0;
  private shakeOffsetX = 0;
  private shakeOffsetY = 0;

  /** Screen size in CSS pixels; the renderer keeps this current. */
  viewWidth = 0;
  viewHeight = 0;

  constructor(private readonly rng: SeededRandom) {}

  /** Jump to a position without easing. Used on raid start. */
  snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /**
   * Follow a target, leading slightly in the aim direction so the player sees
   * more of where they are pointing than of where they came from.
   */
  follow(targetX: number, targetY: number, aimX: number, aimY: number, dt: number): void {
    const lead = CAMERA.aimLeadDistance;
    const desiredX = targetX + aimX * lead;
    const desiredY = targetY + aimY * lead;

    this.x = damp(this.x, desiredX, CAMERA.followHalfLife, dt);
    this.y = damp(this.y, desiredY, CAMERA.followHalfLife, dt);

    if (this.shakeIntensity > 0) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - CAMERA.shakeDecayPerSecond * dt);
      const magnitude = this.shakeIntensity * CAMERA.maxShake;
      this.shakeOffsetX = this.rng.range(-magnitude, magnitude);
      this.shakeOffsetY = this.rng.range(-magnitude, magnitude);
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }
  }

  /** Add shake. Intensity 0..1; the strongest request wins. */
  addShake(intensity: number): void {
    this.shakeIntensity = Math.min(1, Math.max(this.shakeIntensity, intensity));
  }

  /** Effective world position including shake. */
  get renderX(): number {
    return this.x + this.shakeOffsetX;
  }

  get renderY(): number {
    return this.y + this.shakeOffsetY;
  }
}
