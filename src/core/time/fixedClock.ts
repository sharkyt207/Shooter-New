/**
 * Fixed-timestep clock (ADR-004).
 *
 * The simulation runs at exactly 60 Hz regardless of display refresh rate.
 * Rendering runs as fast as the device allows and interpolates between the two
 * most recent simulation states using `alpha`.
 *
 * The catch-up cap prevents the death spiral where a long frame (tab switch,
 * incoming call, GC pause) queues so many ticks that the next frame is even
 * longer.
 */

export const SIM_HZ = 60;
export const FIXED_DT = 1 / SIM_HZ;
const MAX_CATCHUP_TICKS = 5;
/** Ignore frame deltas beyond this: the app was suspended, not slow. */
const MAX_FRAME_SECONDS = 0.25;

export class FixedClock {
  private accumulator = 0;
  private elapsedSeconds = 0;
  private tickCount = 0;

  constructor(
    public readonly fixedDelta: number = FIXED_DT,
    private readonly maxCatchupTicks: number = MAX_CATCHUP_TICKS,
  ) {}

  /** Total simulated time in seconds. */
  get elapsed(): number {
    return this.elapsedSeconds;
  }

  /** Number of fixed steps simulated so far. The simulation's canonical time. */
  get ticks(): number {
    return this.tickCount;
  }

  /**
   * Interpolation factor in [0, 1) between the previous and current sim state.
   * Renderers use this to draw smooth motion between discrete ticks.
   */
  get alpha(): number {
    return this.accumulator / this.fixedDelta;
  }

  /**
   * Feed a real frame delta and run the simulation.
   *
   * @param frameSeconds Wall-clock time since the previous frame.
   * @param step Called once per fixed tick.
   * @returns How many ticks were run.
   */
  advance(frameSeconds: number, step: (dt: number) => void): number {
    const clamped = Math.min(Math.max(frameSeconds, 0), MAX_FRAME_SECONDS);
    this.accumulator += clamped;

    let ticksRun = 0;
    while (this.accumulator >= this.fixedDelta && ticksRun < this.maxCatchupTicks) {
      step(this.fixedDelta);
      this.accumulator -= this.fixedDelta;
      this.elapsedSeconds += this.fixedDelta;
      this.tickCount++;
      ticksRun++;
    }

    // Fell too far behind: drop the backlog rather than compound the stutter.
    if (this.accumulator > this.fixedDelta * this.maxCatchupTicks) {
      this.accumulator = 0;
    }

    return ticksRun;
  }

  reset(): void {
    this.accumulator = 0;
    this.elapsedSeconds = 0;
    this.tickCount = 0;
  }
}

/** Convert seconds to whole simulation ticks (rounded up). */
export function secondsToTicks(seconds: number): number {
  return Math.ceil(seconds * SIM_HZ);
}

export function ticksToSeconds(ticks: number): number {
  return ticks / SIM_HZ;
}

/** Format seconds as `M:SS` for HUD timers. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
