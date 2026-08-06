/**
 * The aim stick's two stages.
 *
 * This is the one input behaviour a unit test can actually pin down: the
 * geometry from thumb position to "is the weapon firing" is pure arithmetic,
 * and it is exactly the arithmetic that was wrong before - the gun started
 * firing a few pixels outside the deadzone, so aiming without shooting was
 * impossible.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { INPUT } from '@/content/balance';
import { TouchInput } from './touchInput';

const RADIUS = 100;
const ORIGIN = { x: 700, y: 300 };

/** A DOM element stub: the class only needs listeners and a bounding box. */
function stubElement(width = 900, height = 400) {
  const listeners = new Map<string, (event: PointerEvent) => void>();
  const element = {
    addEventListener: (type: string, fn: (event: PointerEvent) => void) => {
      listeners.set(type, fn);
    },
    removeEventListener: (type: string) => listeners.delete(type),
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
  } as unknown as HTMLElement;
  return { element, listeners };
}

function pointer(x: number, y: number, id = 1): PointerEvent {
  return {
    pointerId: id,
    clientX: x,
    clientY: y,
    target: null,
    preventDefault: () => {},
  } as unknown as PointerEvent;
}

describe('aim stick', () => {
  let input: TouchInput;
  let listeners: Map<string, (event: PointerEvent) => void>;

  beforeEach(() => {
    const stub = stubElement();
    input = new TouchInput(stub.element);
    listeners = stub.listeners;
    input.attach();
    // 900x400 -> short edge 400 -> 400 * 0.19 = 76, clamped up to the minimum.
    // Pin it instead, so the thresholds under test are the subject rather than
    // the resize arithmetic.
    input.resize(RADIUS / INPUT.stickRadiusFraction, RADIUS / INPUT.stickRadiusFraction);
  });

  /** Touch down on the right half, then drag to `deflection` of the radius. */
  function aimAt(deflection: number): void {
    listeners.get('pointerdown')!(pointer(ORIGIN.x, ORIGIN.y));
    listeners.get('pointermove')!(pointer(ORIGIN.x + input.stickRadius * deflection, ORIGIN.y));
  }

  it('does not fire from touching alone', () => {
    listeners.get('pointerdown')!(pointer(ORIGIN.x, ORIGIN.y));
    const state = input.read();
    expect(state.aimActive).toBe(true);
    expect(state.fire).toBe(false);
  });

  it('aims without firing below the threshold', () => {
    aimAt(INPUT.fireAtDeflection - 0.1);
    const state = input.read();
    expect(state.aimActive).toBe(true);
    expect(state.fire).toBe(false);
    // Still a usable direction: aiming is the point of this stage.
    expect(Math.hypot(state.aimX, state.aimY)).toBeGreaterThan(0);
  });

  it('fires past the threshold', () => {
    aimAt(INPUT.fireAtDeflection + 0.05);
    expect(input.read().fire).toBe(true);
  });

  it('points where the thumb points', () => {
    listeners.get('pointerdown')!(pointer(ORIGIN.x, ORIGIN.y));
    listeners.get('pointermove')!(pointer(ORIGIN.x, ORIGIN.y + input.stickRadius));
    const state = input.read();
    // Screen-down is +y in both spaces, so straight down reads as +y.
    expect(state.aimY).toBeGreaterThan(0.9);
    expect(Math.abs(state.aimX)).toBeLessThan(0.05);
  });

  describe('hysteresis', () => {
    it('keeps firing between the two thresholds once armed', () => {
      aimAt(INPUT.fireAtDeflection + 0.05);
      expect(input.read().fire).toBe(true);

      // Drift back into the band between release and arm: still firing.
      const between = (INPUT.fireAtDeflection + INPUT.fireReleaseDeflection) / 2;
      listeners.get('pointermove')!(pointer(ORIGIN.x + input.stickRadius * between, ORIGIN.y));
      expect(input.read().fire).toBe(true);
    });

    it('stops below the release threshold', () => {
      aimAt(INPUT.fireAtDeflection + 0.05);
      input.read();
      listeners.get('pointermove')!(
        pointer(ORIGIN.x + input.stickRadius * (INPUT.fireReleaseDeflection - 0.05), ORIGIN.y),
      );
      expect(input.read().fire).toBe(false);
    });

    it('does not re-arm in the band after releasing', () => {
      aimAt(INPUT.fireAtDeflection + 0.05);
      input.read();
      listeners.get('pointermove')!(pointer(ORIGIN.x, ORIGIN.y));
      expect(input.read().fire).toBe(false);

      const between = (INPUT.fireAtDeflection + INPUT.fireReleaseDeflection) / 2;
      listeners.get('pointermove')!(pointer(ORIGIN.x + input.stickRadius * between, ORIGIN.y));
      expect(input.read().fire).toBe(false);
    });

    it('disarms when the thumb lifts', () => {
      aimAt(INPUT.fireAtDeflection + 0.2);
      expect(input.read().fire).toBe(true);
      listeners.get('pointerup')!(pointer(ORIGIN.x, ORIGIN.y));
      const state = input.read();
      expect(state.fire).toBe(false);
      expect(state.aimActive).toBe(false);
    });
  });

  it('arms at the same fraction of the stick on any screen size', () => {
    // The whole reason the threshold reads raw deflection: the firing point has
    // to sit at the same place on the stick whatever the device.
    for (const radius of [62, 90, 130]) {
      const stub = stubElement();
      const fresh = new TouchInput(stub.element);
      fresh.attach();
      fresh.resize(radius / INPUT.stickRadiusFraction, radius / INPUT.stickRadiusFraction);

      stub.listeners.get('pointerdown')!(pointer(ORIGIN.x, ORIGIN.y));
      stub.listeners.get('pointermove')!(
        pointer(ORIGIN.x + fresh.stickRadius * (INPUT.fireAtDeflection - 0.05), ORIGIN.y),
      );
      expect(fresh.read().fire, `radius ${radius}`).toBe(false);

      stub.listeners.get('pointermove')!(
        pointer(ORIGIN.x + fresh.stickRadius * (INPUT.fireAtDeflection + 0.05), ORIGIN.y),
      );
      expect(fresh.read().fire, `radius ${radius}`).toBe(true);
    }
  });

  it('exposes the armed state so the HUD can draw it', () => {
    aimAt(INPUT.fireAtDeflection + 0.1);
    input.read();
    expect(input.getVisuals().aim.armed).toBe(true);
    expect(input.getVisuals().move.armed).toBe(false);
  });

  it('leaves the fire button working on its own', () => {
    input.setButton('fire', true);
    expect(input.read().fire).toBe(true);
  });
});

describe('move stick', () => {
  it('reads the left half and never arms the weapon', () => {
    const { element, listeners } = stubElement();
    const input = new TouchInput(element);
    input.attach();
    input.resize(RADIUS / INPUT.stickRadiusFraction, RADIUS / INPUT.stickRadiusFraction);

    listeners.get('pointerdown')!(pointer(100, 300));
    listeners.get('pointermove')!(pointer(100 + input.stickRadius, 300));

    const state = input.read();
    expect(state.moveX).toBeGreaterThan(0.9);
    expect(state.fire).toBe(false);
    expect(state.aimActive).toBe(false);
  });

  it('mirrors the halves for a left-handed player', () => {
    const { element, listeners } = stubElement();
    const input = new TouchInput(element);
    input.leftHanded = true;
    input.attach();
    input.resize(RADIUS / INPUT.stickRadiusFraction, RADIUS / INPUT.stickRadiusFraction);

    // Right half now moves.
    listeners.get('pointerdown')!(pointer(700, 300));
    listeners.get('pointermove')!(pointer(700 + input.stickRadius, 300));
    expect(input.read().moveX).toBeGreaterThan(0.9);
  });
});
