/**
 * Scalar math helpers.
 *
 * All functions are pure and allocation-free - they are called from hot loops.
 */

export const TAU = Math.PI * 2;
export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Inverse lerp: where does `value` sit between `a` and `b`, as 0..1. */
export function inverseLerp(a: number, b: number, value: number): number {
  if (a === b) return 0;
  return clamp01((value - a) / (b - a));
}

/** Remap a value from one range to another, clamped to the output range. */
export function remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return lerp(outMin, outMax, inverseLerp(inMin, inMax, value));
}

/** Move `current` towards `target` by at most `maxDelta`. Frame-rate safe. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return target;
}

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(radians: number): number {
  let a = radians % TAU;
  if (a > Math.PI) a -= TAU;
  else if (a <= -Math.PI) a += TAU;
  return a;
}

/** Shortest signed angular distance from `from` to `to`, in (-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  return wrapAngle(to - from);
}

/** Rotate `from` towards `to` by at most `maxDelta` radians, taking the short way around. */
export function approachAngle(from: number, to: number, maxDelta: number): number {
  const delta = angleDelta(from, to);
  if (Math.abs(delta) <= maxDelta) return wrapAngle(to);
  return wrapAngle(from + Math.sign(delta) * maxDelta);
}

/** Smoothstep easing between edges. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = inverseLerp(edge0, edge1, x);
  return t * t * (3 - 2 * t);
}

/**
 * Frame-rate independent exponential damping.
 * `halfLife` is the time in seconds for the gap to halve.
 */
export function damp(current: number, target: number, halfLife: number, dt: number): number {
  if (halfLife <= 0) return target;
  return lerp(target, current, Math.pow(2, -dt / halfLife));
}

export function roundTo(value: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}
