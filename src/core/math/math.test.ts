import { describe, expect, it } from 'vitest';
import { angleDelta, approach, approachAngle, clamp, damp, lerp, remap, wrapAngle } from './scalar';
import { add, distance, length, limit, normalize, rotate, vec2 } from './vec2';
import { aabbFromCenter, circleVsAabb, isInCone, segmentVsAabb } from './shapes';

describe('scalar', () => {
  it('clamps to the given range', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(1.5, 0, 3)).toBe(1.5);
  });

  it('interpolates linearly', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(-4, 4, 0.25)).toBe(-2);
  });

  it('remaps between ranges and clamps the output', () => {
    expect(remap(5, 0, 10, 0, 100)).toBe(50);
    expect(remap(-5, 0, 10, 0, 100)).toBe(0);
    expect(remap(50, 0, 10, 0, 100)).toBe(100);
  });

  it('approaches a target without overshooting', () => {
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(0, 2, 3)).toBe(2);
    expect(approach(10, 0, 3)).toBe(7);
  });

  it('wraps angles into (-PI, PI]', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 6);
    expect(wrapAngle(-Math.PI * 3)).toBeCloseTo(Math.PI, 6);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5, 6);
  });

  it('takes the short way around when turning', () => {
    // From 170 deg to -170 deg is 20 deg the short way, not 340 the long way.
    const from = (170 * Math.PI) / 180;
    const to = (-170 * Math.PI) / 180;
    expect(angleDelta(from, to)).toBeCloseTo((20 * Math.PI) / 180, 5);

    const stepped = approachAngle(from, to, (5 * Math.PI) / 180);
    expect(angleDelta(from, stepped)).toBeCloseTo((5 * Math.PI) / 180, 5);
  });

  it('damps frame-rate independently', () => {
    // One half-life must halve the gap regardless of how it is stepped.
    const oneStep = damp(0, 10, 1, 1);
    let stepped = 0;
    for (let i = 0; i < 100; i++) stepped = damp(stepped, 10, 1, 0.01);
    expect(stepped).toBeCloseTo(oneStep, 4);
  });
});

describe('vec2', () => {
  it('adds and measures', () => {
    const out = vec2();
    add(out, vec2(1, 2), vec2(3, 4));
    expect(out).toEqual({ x: 4, y: 6 });
    expect(length(vec2(3, 4))).toBe(5);
    expect(distance(vec2(0, 0), vec2(0, 7))).toBe(7);
  });

  it('normalises without producing NaN for a zero vector', () => {
    const out = vec2();
    normalize(out, vec2(0, 0));
    expect(out).toEqual({ x: 0, y: 0 });

    normalize(out, vec2(10, 0));
    expect(out.x).toBeCloseTo(1, 6);
  });

  it('limits magnitude but leaves shorter vectors untouched', () => {
    const out = vec2();
    limit(out, vec2(10, 0), 4);
    expect(length(out)).toBeCloseTo(4, 6);

    limit(out, vec2(1, 0), 4);
    expect(length(out)).toBeCloseTo(1, 6);
  });

  it('rotates by 90 degrees', () => {
    const out = vec2();
    rotate(out, vec2(1, 0), Math.PI / 2);
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.y).toBeCloseTo(1, 6);
  });
});

describe('shapes', () => {
  it('reports no penetration when a circle is clear of the box', () => {
    const box = aabbFromCenter(0, 0, 1, 1);
    expect(circleVsAabb(5, 5, 0.5, box).depth).toBe(0);
  });

  it('pushes a circle out along the contact normal', () => {
    const box = aabbFromCenter(0, 0, 1, 1);
    const pen = circleVsAabb(1.4, 0, 0.5, box);
    expect(pen.depth).toBeCloseTo(0.1, 6);
    expect(pen.normalX).toBeCloseTo(1, 6);
    expect(pen.normalY).toBeCloseTo(0, 6);
  });

  it('ejects a circle whose centre is inside the box', () => {
    const box = aabbFromCenter(0, 0, 1, 1);
    // Just inside the right face - it must be pushed out to the right.
    const pen = circleVsAabb(0.8, 0, 0.3, box);
    expect(pen.depth).toBeGreaterThan(0);
    expect(pen.normalX).toBe(1);
  });

  it('detects segment/box intersection', () => {
    const box = aabbFromCenter(0, 0, 1, 1);
    expect(segmentVsAabb(-5, 0, 5, 0, box)).toBeGreaterThanOrEqual(0);
    expect(segmentVsAabb(-5, 5, 5, 5, box)).toBe(-1);
  });

  it('tests view cones by angle and range', () => {
    const halfAngle = (45 * Math.PI) / 180;
    expect(isInCone(0, 0, 0, halfAngle, 10, { x: 5, y: 0 })).toBe(true);
    expect(isInCone(0, 0, 0, halfAngle, 10, { x: 0, y: 5 })).toBe(false);
    expect(isInCone(0, 0, 0, halfAngle, 3, { x: 5, y: 0 })).toBe(false);
  });
});
