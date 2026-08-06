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
 *
 * **Aiming and firing are two stages of the same thumb, not one.** Touching the
 * right side turns the character and shows the aim line; the weapon only fires
 * once the stick is pushed past `INPUT.fireAtDeflection`. Before that change
 * the gun started firing barely outside the deadzone, so there was no way to
 * look somewhere without shooting at it - and in an extraction shooter, where
 * a shot is heard across half the map, that is not a rough edge but a wrong
 * game.
 *
 * Since M6 the stick radius scales with the screen instead of being a fixed
 * number of pixels. A thumb sweep is a physical distance, not a pixel count:
 * 90 px is comfortable on a phone and a twitch on a tablet.
 */

import { INPUT } from '@/content/balance';
import { createInputState, type InputSource, type InputState } from './inputSource';

export interface StickVisual {
  active: boolean;
  /** Aim stick only: true while the deflection is past the firing point. */
  armed: boolean;
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
  /**
   * Latched firing state for the aim stick's hysteresis.
   *
   * Held here rather than recomputed per frame because hysteresis *is* memory:
   * whether the current deflection fires depends on whether it was already
   * firing.
   */
  private aimArmed = false;
  private oneShots = { toggleInventory: false, pause: false, melee: false };

  private readonly visuals: TouchVisuals = {
    move: { active: false, originX: 0, originY: 0, knobX: 0, knobY: 0, armed: false },
    aim: { active: false, originX: 0, originY: 0, knobX: 0, knobY: 0, armed: false },
  };

  /** Mirrors the stick halves for left-handed players. */
  leftHanded = false;

  /** Current stick radius in CSS pixels, derived from the viewport. */
  private radiusPx: number = INPUT.stickRadiusPx;

  constructor(private readonly element: HTMLElement) {
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
  }

  /**
   * Recompute the stick radius for a new viewport.
   *
   * Driven by the short edge so the gesture stays the same physical size in
   * landscape on a phone and on a tablet.
   */
  resize(width: number, height: number): void {
    const shortEdge = Math.min(width, height);
    this.radiusPx = Math.max(
      INPUT.stickRadiusMinPx,
      Math.min(INPUT.stickRadiusMaxPx, shortEdge * INPUT.stickRadiusFraction),
    );
  }

  /** Read by the HUD so the drawn stick matches the one being read. */
  get stickRadius(): number {
    return this.radiusPx;
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
    out.aimActive = this.aimStick !== null;

    // Raw deflection, not the ramped value the axes use. The ramp exists to
    // make slow movement possible; the firing point has to sit at the same
    // physical place on the screen every time, or the player cannot learn it.
    const deflection = this.rawDeflection(this.aimStick);
    if (this.aimArmed) {
      if (deflection < INPUT.fireReleaseDeflection) this.aimArmed = false;
    } else if (deflection >= INPUT.fireAtDeflection) {
      this.aimArmed = true;
    }
    if (this.aimStick === null) this.aimArmed = false;

    // The HUD draws the aim stick differently once it is firing, so the player
    // sees the threshold rather than discovering it by shooting. Set here, next
    // to the decision it mirrors.
    this.visuals.aim.armed = this.aimArmed;

    out.fire = this.buttons.fire || this.aimArmed;

    out.sprint = this.buttons.sprint;
    out.reload = this.buttons.reload;
    out.interact = this.buttons.interact;
    out.toggleInventory = this.oneShots.toggleInventory;
    out.pause = this.oneShots.pause;
    out.melee = this.oneShots.melee;

    return out;
  }

  endFrame(): void {
    this.oneShots.toggleInventory = false;
    this.oneShots.pause = false;
    this.oneShots.melee = false;
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

    const normalized = Math.min(1, distance / this.radiusPx);
    if (normalized < INPUT.deadzone) return ZERO;

    const ramped = Math.min(
      1,
      (normalized - INPUT.deadzone) / (INPUT.fullThrottleAt - INPUT.deadzone),
    );

    scratch.x = (dx / distance) * ramped;
    scratch.y = (dy / distance) * ramped;
    return scratch;
  }

  /** Aim-stick deflection as a fraction of the stick radius, unramped. */
  private rawDeflection(stick: ActiveStick | null): number {
    if (!stick) return 0;
    const dx = stick.currentX - stick.originX;
    const dy = stick.currentY - stick.originY;
    return Math.min(1, Math.hypot(dx, dy) / this.radiusPx);
  }

  private updateVisuals(): void {
    applyVisual(this.visuals.move, this.moveStick, this.radiusPx);
    applyVisual(this.visuals.aim, this.aimStick, this.radiusPx);
    // `armed` is deliberately not set here. It is computed in `read()`, and
    // writing it from a pointer handler made the ring lag the trigger by one
    // event - the stick looked unarmed on the frame it started firing.
  }
}

const ZERO = { x: 0, y: 0 } as const;
const scratch = { x: 0, y: 0 };

function applyVisual(visual: StickVisual, stick: ActiveStick | null, radiusPx: number): void {
  if (!stick) {
    visual.active = false;
    visual.armed = false;
    return;
  }

  const dx = stick.currentX - stick.originX;
  const dy = stick.currentY - stick.originY;
  const distance = Math.hypot(dx, dy);
  const clamped = Math.min(distance, radiusPx);
  const scale = distance > 1e-3 ? clamped / distance : 0;

  visual.active = true;
  visual.originX = stick.originX;
  visual.originY = stick.originY;
  visual.knobX = dx * scale;
  visual.knobY = dy * scale;
}
