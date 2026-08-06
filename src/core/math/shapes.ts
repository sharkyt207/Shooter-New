/**
 * Collision primitives.
 *
 * PROJECT ECHO deliberately ships no physics engine (ADR-012). The simulation
 * needs exactly three things: circle-vs-circle for actors, circle-vs-AABB for
 * walls, and a segment raycast for line of sight. All of them are cheap,
 * deterministic and fully under our control.
 */

import type { Vec2 } from './vec2';
import { clamp } from './scalar';

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

/** Axis-aligned bounding box, stored as min/max for cheap tests. */
export interface Aabb {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function aabbFromCenter(cx: number, cy: number, halfW: number, halfH: number): Aabb {
  return { minX: cx - halfW, minY: cy - halfH, maxX: cx + halfW, maxY: cy + halfH };
}

export function aabbContains(box: Readonly<Aabb>, x: number, y: number): boolean {
  return x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
}

export function aabbOverlaps(a: Readonly<Aabb>, b: Readonly<Aabb>): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function circlesOverlap(
  ax: number, ay: number, ar: number,
  bx: number, by: number, br: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

export interface Penetration {
  /** Depth of overlap along the resolution normal. Zero means no contact. */
  depth: number;
  /** Unit normal pointing away from the obstacle. */
  normalX: number;
  normalY: number;
}

const NO_PENETRATION: Penetration = { depth: 0, normalX: 0, normalY: 0 };

/**
 * Resolve a circle against an AABB.
 *
 * Returns how far the circle must be pushed, and in which direction, to leave
 * the box. Handles the deep-inside case by ejecting through the nearest face,
 * which keeps an actor from getting stuck inside geometry.
 */
export function circleVsAabb(
  cx: number, cy: number, radius: number,
  box: Readonly<Aabb>,
  out: Penetration = { depth: 0, normalX: 0, normalY: 0 },
): Penetration {
  const closestX = clamp(cx, box.minX, box.maxX);
  const closestY = clamp(cy, box.minY, box.maxY);
  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq > radius * radius) {
    out.depth = 0;
    out.normalX = 0;
    out.normalY = 0;
    return out;
  }

  if (distSq > 1e-12) {
    // Centre is outside the box: push straight out along the contact normal.
    const dist = Math.sqrt(distSq);
    out.depth = radius - dist;
    out.normalX = dx / dist;
    out.normalY = dy / dist;
    return out;
  }

  // Centre is inside the box: eject through whichever face is nearest.
  const toLeft = cx - box.minX;
  const toRight = box.maxX - cx;
  const toTop = cy - box.minY;
  const toBottom = box.maxY - cy;
  const min = Math.min(toLeft, toRight, toTop, toBottom);

  out.depth = min + radius;
  out.normalX = min === toLeft ? -1 : min === toRight ? 1 : 0;
  out.normalY = min === toTop ? -1 : min === toBottom ? 1 : 0;
  if (out.normalX !== 0 && out.normalY !== 0) out.normalY = 0;
  return out;
}

export function noPenetration(): Readonly<Penetration> {
  return NO_PENETRATION;
}

/**
 * Segment vs AABB (slab method).
 * Returns the entry parameter t in 0..1, or -1 when there is no hit.
 */
export function segmentVsAabb(
  x0: number, y0: number, x1: number, y1: number,
  box: Readonly<Aabb>,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;

  let tMin = 0;
  let tMax = 1;

  // X slab
  if (Math.abs(dx) < 1e-9) {
    if (x0 < box.minX || x0 > box.maxX) return -1;
  } else {
    const inv = 1 / dx;
    let t1 = (box.minX - x0) * inv;
    let t2 = (box.maxX - x0) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return -1;
  }

  // Y slab
  if (Math.abs(dy) < 1e-9) {
    if (y0 < box.minY || y0 > box.maxY) return -1;
  } else {
    const inv = 1 / dy;
    let t1 = (box.minY - y0) * inv;
    let t2 = (box.maxY - y0) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return -1;
  }

  return tMin;
}

/**
 * Is `point` inside a view cone?
 *
 * @param halfAngle Half the cone's opening angle, in radians.
 */
export function isInCone(
  originX: number, originY: number,
  facing: number,
  halfAngle: number,
  range: number,
  point: Readonly<Vec2>,
): boolean {
  const dx = point.x - originX;
  const dy = point.y - originY;
  const distSq = dx * dx + dy * dy;
  if (distSq > range * range) return false;
  if (distSq < 1e-9) return true;

  // Compare against the facing direction without an atan2 call.
  const dist = Math.sqrt(distSq);
  const dotFacing = (dx / dist) * Math.cos(facing) + (dy / dist) * Math.sin(facing);
  return dotFacing >= Math.cos(halfAngle);
}
