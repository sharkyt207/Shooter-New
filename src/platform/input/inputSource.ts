/**
 * Input abstraction.
 *
 * Every input device produces the same `InputState`. The game never asks
 * "was that a touch or a key?" - it only reads axes and buttons. That is what
 * lets the identical build run on a phone and in a desktop browser, and what
 * keeps the simulation device-agnostic (ADR-002).
 */

export interface InputState {
  /** Movement axis, -1..1 per component. */
  moveX: number;
  moveY: number;
  /** Aim direction. Zero length means "no explicit aim". */
  aimX: number;
  aimY: number;
  /** True while the player wants to shoot. */
  fire: boolean;
  sprint: boolean;
  reload: boolean;
  interact: boolean;
  /** One-shot UI requests, cleared by the consumer each frame. */
  toggleInventory: boolean;
  pause: boolean;
}

export function createInputState(): InputState {
  return {
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    fire: false,
    sprint: false,
    reload: false,
    interact: false,
    toggleInventory: false,
    pause: false,
  };
}

export interface InputSource {
  readonly name: string;
  /** Attach listeners. */
  attach(): void;
  /** Detach listeners and release resources. */
  detach(): void;
  /** Current state. The returned object is reused - do not retain it. */
  read(): Readonly<InputState>;
  /** Clear one-shot flags after the frame has consumed them. */
  endFrame(): void;
}

/** Combines several sources; later sources win when they are active. */
export class CompositeInput implements InputSource {
  readonly name = 'composite';
  private readonly state = createInputState();

  constructor(private readonly sources: InputSource[]) {}

  attach(): void {
    for (const source of this.sources) source.attach();
  }

  detach(): void {
    for (const source of this.sources) source.detach();
  }

  read(): Readonly<InputState> {
    const out = this.state;
    out.moveX = 0;
    out.moveY = 0;
    out.aimX = 0;
    out.aimY = 0;
    out.fire = false;
    out.sprint = false;
    out.reload = false;
    out.interact = false;
    out.toggleInventory = false;
    out.pause = false;

    for (const source of this.sources) {
      const s = source.read();
      // Axes: the source with the larger deflection wins, so an idle keyboard
      // never cancels an active thumbstick.
      if (Math.hypot(s.moveX, s.moveY) > Math.hypot(out.moveX, out.moveY)) {
        out.moveX = s.moveX;
        out.moveY = s.moveY;
      }
      if (Math.hypot(s.aimX, s.aimY) > Math.hypot(out.aimX, out.aimY)) {
        out.aimX = s.aimX;
        out.aimY = s.aimY;
      }
      out.fire ||= s.fire;
      out.sprint ||= s.sprint;
      out.reload ||= s.reload;
      out.interact ||= s.interact;
      out.toggleInventory ||= s.toggleInventory;
      out.pause ||= s.pause;
    }

    return out;
  }

  endFrame(): void {
    for (const source of this.sources) source.endFrame();
  }
}
