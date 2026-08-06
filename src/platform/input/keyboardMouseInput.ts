/**
 * Desktop input: WASD to move, mouse to aim, click to fire.
 *
 * This exists for development speed - iterating on gameplay in a browser is far
 * faster than deploying to a device - and doubles as the control scheme for a
 * playable web build. Because it produces the same `InputState` as touch, no
 * game code knows the difference.
 */

import { createInputState, type InputSource, type InputState } from './inputSource';

export class KeyboardMouseInput implements InputSource {
  readonly name = 'keyboardMouse';

  private readonly state = createInputState();
  private readonly keys = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private mouseDown = false;
  private oneShots = { toggleInventory: false, pause: false, reload: false, melee: false };

  /**
   * Where the player is on screen, in CSS pixels. The aim vector is the offset
   * from here to the cursor. Updated by the renderer each frame, since only it
   * knows the camera transform.
   */
  private anchorX = 0;
  private anchorY = 0;

  constructor(private readonly element: HTMLElement) {
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onBlur = this.onBlur.bind(this);
  }

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.element.addEventListener('mousemove', this.onMouseMove);
    this.element.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.element.removeEventListener('mousemove', this.onMouseMove);
    this.element.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.keys.clear();
  }

  /** Called by the renderer: the player's current screen position. */
  setAimAnchor(x: number, y: number): void {
    this.anchorX = x;
    this.anchorY = y;
  }

  read(): Readonly<InputState> {
    const out = this.state;

    out.moveX = (this.held('KeyD', 'ArrowRight') ? 1 : 0) - (this.held('KeyA', 'ArrowLeft') ? 1 : 0);
    out.moveY = (this.held('KeyS', 'ArrowDown') ? 1 : 0) - (this.held('KeyW', 'ArrowUp') ? 1 : 0);

    const dx = this.mouseX - this.anchorX;
    const dy = this.mouseY - this.anchorY;
    const length = Math.hypot(dx, dy);
    if (length > 4) {
      out.aimX = dx / length;
      out.aimY = dy / length;
    } else {
      out.aimX = 0;
      out.aimY = 0;
    }

    out.fire = this.mouseDown || this.held('Space');
    out.sprint = this.held('ShiftLeft', 'ShiftRight');
    out.interact = this.held('KeyE');
    out.reload = this.oneShots.reload;
    out.toggleInventory = this.oneShots.toggleInventory;
    out.pause = this.oneShots.pause;
    out.melee = this.oneShots.melee;

    return out;
  }

  endFrame(): void {
    this.oneShots.toggleInventory = false;
    this.oneShots.pause = false;
    this.oneShots.reload = false;
    this.oneShots.melee = false;
  }

  private held(...codes: string[]): boolean {
    for (const code of codes) {
      if (this.keys.has(code)) return true;
    }
    return false;
  }

  private onKeyDown(event: KeyboardEvent): void {
    // Tab and Space would otherwise scroll or move focus out of the canvas.
    if (event.code === 'Tab' || event.code === 'Space') event.preventDefault();

    if (!event.repeat) {
      if (event.code === 'KeyR') this.oneShots.reload = true;
      if (event.code === 'Tab') this.oneShots.toggleInventory = true;
      if (event.code === 'Escape') this.oneShots.pause = true;
      if (event.code === 'KeyF') this.oneShots.melee = true;
    }
    this.keys.add(event.code);
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.keys.delete(event.code);
  }

  private onMouseMove(event: MouseEvent): void {
    this.mouseX = event.clientX;
    this.mouseY = event.clientY;
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button === 0) this.mouseDown = true;
  }

  private onMouseUp(event: MouseEvent): void {
    if (event.button === 0) this.mouseDown = false;
  }

  /** Losing focus must release every key, or the player keeps running forever. */
  private onBlur(): void {
    this.keys.clear();
    this.mouseDown = false;
  }
}
