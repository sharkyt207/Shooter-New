/**
 * 2D vector math.
 *
 * Design: vectors are plain `{ x, y }` objects so they serialise straight into
 * save games and stay ECS-friendly. Every operation takes an explicit `out`
 * target where it makes sense, so hot loops can run allocation-free.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function set(out: Vec2, x: number, y: number): Vec2 {
  out.x = x;
  out.y = y;
  return out;
}

export function copy(out: Vec2, source: Readonly<Vec2>): Vec2 {
  out.x = source.x;
  out.y = source.y;
  return out;
}

export function clone(source: Readonly<Vec2>): Vec2 {
  return { x: source.x, y: source.y };
}

export function add(out: Vec2, a: Readonly<Vec2>, b: Readonly<Vec2>): Vec2 {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  return out;
}

export function subtract(out: Vec2, a: Readonly<Vec2>, b: Readonly<Vec2>): Vec2 {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  return out;
}

export function scale(out: Vec2, a: Readonly<Vec2>, factor: number): Vec2 {
  out.x = a.x * factor;
  out.y = a.y * factor;
  return out;
}

/** out = a + b * factor. The single most used operation in movement code. */
export function addScaled(out: Vec2, a: Readonly<Vec2>, b: Readonly<Vec2>, factor: number): Vec2 {
  out.x = a.x + b.x * factor;
  out.y = a.y + b.y * factor;
  return out;
}

export function lengthSq(a: Readonly<Vec2>): number {
  return a.x * a.x + a.y * a.y;
}

export function length(a: Readonly<Vec2>): number {
  return Math.sqrt(a.x * a.x + a.y * a.y);
}

export function distanceSq(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

export function distance(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
  return Math.sqrt(distanceSq(a, b));
}

/** Normalise in place into `out`. A zero vector stays zero (never NaN). */
export function normalize(out: Vec2, a: Readonly<Vec2>): Vec2 {
  const len = length(a);
  if (len < 1e-9) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  out.x = a.x / len;
  out.y = a.y / len;
  return out;
}

/** Clamp a vector's magnitude to `max`. */
export function limit(out: Vec2, a: Readonly<Vec2>, max: number): Vec2 {
  const lenSq = lengthSq(a);
  if (lenSq <= max * max || lenSq < 1e-12) {
    out.x = a.x;
    out.y = a.y;
    return out;
  }
  const factor = max / Math.sqrt(lenSq);
  out.x = a.x * factor;
  out.y = a.y * factor;
  return out;
}

export function dot(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
  return a.x * b.x + a.y * b.y;
}

/** 2D cross product (z component). Positive = b is counter-clockwise from a. */
export function cross(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
  return a.x * b.y - a.y * b.x;
}

export function angleOf(a: Readonly<Vec2>): number {
  return Math.atan2(a.y, a.x);
}

export function fromAngle(out: Vec2, radians: number, magnitude = 1): Vec2 {
  out.x = Math.cos(radians) * magnitude;
  out.y = Math.sin(radians) * magnitude;
  return out;
}

export function rotate(out: Vec2, a: Readonly<Vec2>, radians: number): Vec2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const x = a.x * cos - a.y * sin;
  const y = a.x * sin + a.y * cos;
  out.x = x;
  out.y = y;
  return out;
}

export function lerpVec(out: Vec2, a: Readonly<Vec2>, b: Readonly<Vec2>, t: number): Vec2 {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  return out;
}

export function equalsApprox(a: Readonly<Vec2>, b: Readonly<Vec2>, epsilon = 1e-6): boolean {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

export function isFinite2(a: Readonly<Vec2>): boolean {
  return Number.isFinite(a.x) && Number.isFinite(a.y);
}

/**
 * Scratch vectors for hot loops.
 *
 * Rule of use: a scratch vector is valid only within the function that grabbed
 * it, and must never be stored on a component or returned to a caller.
 */
export const scratch = {
  a: vec2(),
  b: vec2(),
  c: vec2(),
  d: vec2(),
} as const;
