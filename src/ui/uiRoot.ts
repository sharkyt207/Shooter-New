/**
 * Screen management.
 *
 * A simple stack: one base screen plus any number of overlays on top. The HUD
 * is separate, because it is always present during a raid and must not be
 * pushed and popped with menus.
 */

import { el } from './components/dom';

export interface Screen {
  readonly root: HTMLElement;
  /** Called each frame while visible. Optional - most screens are static. */
  update?(dt: number): void;
  /** Called when the screen is removed. */
  destroy?(): void;
}

export class UiRoot {
  private current: Screen | null = null;
  private readonly overlays: Screen[] = [];
  private hudElement: HTMLElement | null = null;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;
  private orientationNotice: HTMLElement | null = null;

  constructor(private readonly container: HTMLElement) {}

  /** Replace the base screen. Any overlays are dismissed first. */
  setScreen(screen: Screen | null): void {
    this.clearOverlays();

    if (this.current) {
      this.current.destroy?.();
      this.current.root.remove();
    }

    this.current = screen;
    if (screen) this.container.appendChild(screen.root);
  }

  pushOverlay(screen: Screen): void {
    this.overlays.push(screen);
    this.container.appendChild(screen.root);
  }

  popOverlay(): void {
    const screen = this.overlays.pop();
    if (!screen) return;
    screen.destroy?.();
    screen.root.remove();
  }

  clearOverlays(): void {
    while (this.overlays.length > 0) this.popOverlay();
  }

  get hasOverlay(): boolean {
    return this.overlays.length > 0;
  }

  /**
   * Ask for landscape, rather than refusing to run in portrait.
   *
   * On a native build the orientation lock usually makes this unreachable. In a
   * browser there is no lock worth relying on, and the honest answer is a
   * notice the player can act on - not a black screen, and not a HUD squeezed
   * into a shape it was never designed for (docs/08-UI-UX.md).
   */
  setOrientationNotice(visible: boolean): void {
    if (visible && !this.orientationNotice) {
      this.orientationNotice = el('div', {
        className: 'orientation-notice',
        children: [
          el('div', { className: 'orientation-notice__icon', text: '⟳' }),
          el('div', { className: 'title', text: 'Bitte drehen' }),
          el('div', {
            className: 'muted',
            text: 'PROJECT ECHO wird im Querformat gespielt.',
          }),
        ],
      });
      this.container.appendChild(this.orientationNotice);
      return;
    }

    if (!visible && this.orientationNotice) {
      this.orientationNotice.remove();
      this.orientationNotice = null;
    }
  }

  /** Mount or unmount the HUD, which lives below every overlay. */
  setHud(element: HTMLElement | null): void {
    if (this.hudElement) this.hudElement.remove();
    this.hudElement = element;
    if (element) {
      // Insert first so overlays always stack above the HUD.
      this.container.insertBefore(element, this.container.firstChild);
    }
  }

  update(dt: number): void {
    this.current?.update?.(dt);
    for (const overlay of this.overlays) overlay.update?.(dt);
  }

  /** Short transient message, e.g. "Nicht genug Credits". */
  toast(message: string, milliseconds = 2200): void {
    const node = el('div', { className: 'toast', text: message });
    this.container.appendChild(node);
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => node.remove(), milliseconds);
  }

  /** Full-screen loading state used while assets are fetched. */
  showLoading(message: string): void {
    this.setScreen({
      root: el('div', {
        className: 'loading',
        children: [el('div', { className: 'title--brand title', text: 'Project Echo' }), el('div', { text: message })],
      }),
    });
  }
}
