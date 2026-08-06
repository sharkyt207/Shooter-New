/**
 * Twin-stick touch input.
 *
 * Both sticks use a *dynamic origin*: the stick appears wherever the thumb
 * lands, rather than at a fixed spot the player has to find. On a phone that
 * single decision is the difference between "controls fine" and "controls
 * badly" (docs/08-UI-UX.md).
 *
 * Left half of the screen moves, right half aims and fires. The split follows
 * the touch that started the gesture, so a thumb sliding across the midline
 * never switches roles mid-drag.
 */

import { INPUT } from '@/content/balance';
import { createInputState, type InputSource, type InputState } from './inputSource';

export interface StickVisual {
  active: boolean;
  /** Origin in CSS pixels, relative to the viewport. */
  originX: number;
  originY: number;
  /** Knob offset from the origin, already clamped to the stick radius. */
  knobX: number;
  knobY: number;
}

export interface TouchVisuals {
  move: StickVisual;
  aim: StickVisual;
}

interface ActiveStick {
  pointerId: number;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
}

export class TouchInput implements InputSource {
  readonly name = 'touch';

  private readonly state = createInputState();
  private moveStick: ActiveStick | null = null;
  private aimStick: ActiveStick | null = null;
  private buttons = { fire: false, reload: false, interact: false, sprint: false };
  private oneShots = { toggleInventory: false, pause: false };

  private readonly visuals: TouchVisuals = {
    move: { active: false, originX: 0, originY: 0, knobX: 0, knobY: 0 },
    aim: { active: false, originX: 0, originY: 0, knobX: 0, knobY: 0 },
  };

  /** Mirrors the stick halves for left-handed players. */
  leftHanded = false;

  constructor(private readonly element: HTMLElement) {
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
  }

  attach(): void {
    this.element.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    this.element.addEventListener('pointermove', this.onPointerMove, { passive: false });
    this.element.addEventListener('pointerup', this.onPointerUp, { passive: false });
    this.element.addEventListener('pointercancel', this.onPointerUp, { passive: false });
  }

  detach(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerUp);
    this.moveStick = null;
    this.aimStick = null;
  }

  /** Called by HUD buttons, which live in the DOM overlay. */
  setButton(name: 'fire' | 'reload' | 'interact' | 'sprint', pressed: boolean): void {
    this.buttons[name] = pressed;
  }

  requestInventory(): void {
    this.oneShots.toggleInventory = true;
  }

  requestPause(): void {
    this.oneShots.pause = true;
  }

  getVisuals(): Readonly<TouchVisuals> {
    return this.visuals;
  }

  read(): Readonly<InputState> {
    const out = this.state;

    const move = this.readStick(this.moveStick);
    out.moveX = move.x;
    out.moveY = move.y;

    const aim = this.readStick(this.aimStick);
    out.aimX = aim.x;
    out.aimY = aim.y;

    // Deflecting the aim stick fires: on touch, a separate fire button costs a
    // finger the player does not have.
    const aimStrength = Math.hypot(aim.x, aim.y);
    out.fire = this.buttons.fire || aimStrength >= INPUT.autoFireThreshold;

    out.sprint = this.buttons.sprint;
    out.reload = this.buttons.reload;
    out.interact = this.buttons.interact;
    out.toggleInventory = this.oneShots.toggleInventory;
    out.pause = this.oneShots.pause;

    return out;
  }

  endFrame(): void {
    this.oneShots.toggleInventory = false;
    this.oneShots.pause = false;
    // Reload is a tap, not a hold.
    this.buttons.reload = false;
  }

  // ── Pointer handling ─────────────────────────────────────────────────────

  private isMoveHalf(clientX: number): boolean {
    const rect = this.element.getBoundingClientRect();
    const leftHalf = clientX - rect.left < rect.width * 0.5;
    return this.leftHanded ? !leftHalf : leftHalf;
  }

  private onPointerDown(event: PointerEvent): void {
    // Ignore touches that started on a HUD button - those handle themselves.
    if ((event.target as HTMLElement | null)?.closest('[data-ui-control]')) return;

    event.preventDefault();
    const stick: ActiveStick = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
    };

    if (this.isMoveHalf(event.clientX)) {
      if (this.moveStick === null) this.moveStick = stick;
    } else if (this.aimStick === null) {
      this.aimStick = stick;
    }
    this.updateVisuals();
  }

  private onPointerMove(event: PointerEvent): void {
    let changed = false;
    if (this.moveStick?.pointerId === event.pointerId) {
      this.moveStick.currentX = event.clientX;
      this.moveStick.currentY = event.clientY;
      changed = true;
    }
    if (this.aimStick?.pointerId === event.pointerId) {
      this.aimStick.currentX = event.clientX;
      this.aimStick.currentY = event.clientY;
      changed = true;
    }
    if (changed) {
      event.preventDefault();
      this.updateVisuals();
    }
  }

  private onPointerUp(event: PointerEvent): void {
    if (this.moveStick?.pointerId === event.pointerId) this.moveStick = null;
    if (this.aimStick?.pointerId === event.pointerId) this.aimStick = null;
    this.updateVisuals();
  }

  /**
   * Convert a stick's pixel offset into a normalised axis.
   *
   * Below the deadzone the stick reads zero; at `fullThrottleAt` it reads full
   * deflection. The ramp between them is what makes slow, deliberate movement
   * possible with a thumb.
   */
  private readStick(stick: ActiveStick | null): { x: number; y: number } {
    if (!stick) return ZERO;

    const dx = stick.currentX - stick.originX;
    const dy = stick.currentY - stick.originY;
    const distance = Math.hypot(dx, dy);
    if (distance < 1e-3) return ZERO;

    const normalized = Math.min(1, distance / INPUT.stickRadiusPx);
    if (normalized < INPUT.deadzone) return ZERO;

    const ramped = Math.min(
      1,
      (normalized - INPUT.deadzone) / (INPUT.fullThrottleAt - INPUT.deadzone),
    );

    scratch.x = (dx / distance) * ramped;
    scratch.y = (dy / distance) * ramped;
    return scratch;
  }

  private updateVisuals(): void {
    applyVisual(this.visuals.move, this.moveStick);
    applyVisual(this.visuals.aim, this.aimStick);
  }
}

const ZERO = { x: 0, y: 0 } as const;
const scratch = { x: 0, y: 0 };

function applyVisual(visual: StickVisual, stick: ActiveStick | null): void {
  if (!stick) {
    visual.active = false;
    return;
  }

  const dx = stick.currentX - stick.originX;
  const dy = stick.currentY - stick.originY;
  const distance = Math.hypot(dx, dy);
  const clamped = Math.min(distance, INPUT.stickRadiusPx);
  const scale = distance > 1e-3 ? clamped / distance : 0;

  visual.active = true;
  visual.originX = stick.originX;
  visual.originY = stick.originY;
  visual.knobX = dx * scale;
  visual.knobY = dy * scale;
}
