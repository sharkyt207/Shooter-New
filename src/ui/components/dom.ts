import { getLocale } from '@/core/i18n/i18n';
/**
 * Tiny DOM helper.
 *
 * The UI is small and performance-sensitive, so it does not carry a framework
 * (ADR-007). These ~60 lines give declarative element creation with none of the
 * bundle cost.
 */

export interface ElementOptions {
  className?: string;
  text?: string;
  html?: string;
  /** Applied as `data-*` attributes. */
  data?: Record<string, string>;
  attrs?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration>;
  onClick?: (event: MouseEvent) => void;
  /** Pointer down/up pair, for held buttons like fire and interact. */
  onHold?: (pressed: boolean) => void;
  children?: Array<Node | null | undefined>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.html !== undefined) node.innerHTML = options.html;

  if (options.data) {
    for (const [key, value] of Object.entries(options.data)) node.dataset[key] = value;
  }
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) node.setAttribute(key, value);
  }
  if (options.style) Object.assign(node.style, options.style);

  // The generic tag type loses TypeScript's per-event listener overloads, so
  // these are registered through a plain HTMLElement view of the node.
  const target: HTMLElement = node;

  if (options.onClick) {
    target.addEventListener('click', (event) => {
      // One tap sound for every button in the game, registered here rather than
      // at each of the ~60 call sites. Quiet on purpose: a menu that clicks
      // loudly gets the whole game muted, and then the sounds that matter go
      // with it.
      if (tag === 'button') uiFeedback?.('ui.tap');
      options.onClick?.(event);
    });
  }

  if (options.onHold) {
    const handler = options.onHold;
    // `data-ui-control` tells the touch input layer to ignore this element, so
    // pressing a HUD button never spawns a virtual stick underneath it.
    node.dataset['uiControl'] = 'true';
    target.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      target.setPointerCapture(event.pointerId);
      handler(true);
    });
    const release = (event: PointerEvent): void => {
      event.stopPropagation();
      handler(false);
    };
    target.addEventListener('pointerup', release);
    target.addEventListener('pointercancel', release);
  }

  if (options.children) {
    for (const child of options.children) {
      if (child) node.appendChild(child);
    }
  }

  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Horizontal label/value row, used all over the meta screens. */
export function statRow(label: string, value: string): HTMLElement {
  return el('div', {
    className: 'stat-row',
    children: [el('span', { text: label }), el('span', { text: value })],
  });
}

export interface BarHandle {
  root: HTMLElement;
  set(fraction: number): void;
  setClass(name: string, active: boolean): void;
}

export function bar(variant: string): BarHandle {
  const fill = el('div', { className: 'bar__fill' });
  const root = el('div', { className: `bar bar--${variant}`, children: [fill] });
  return {
    root,
    set(fraction: number) {
      fill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    },
    setClass(name: string, active: boolean) {
      root.classList.toggle(name, active);
    },
  };
}

/** Format a number with a thousands separator, German style. */
export function formatNumber(value: number): string {
  // Thousands separators differ: 8.000 in German, 8,000 in English. Hardcoding
  // one locale makes the other look like a typo.
  return Math.round(value).toLocaleString(getLocale() === 'en' ? 'en-GB' : 'de-DE');
}

export function formatWeight(kg: number): string {
  return `${kg.toFixed(1)} kg`;
}

export function formatCredits(value: number): string {
  return `${formatNumber(value)} ¢`;
}

/**
 * Where a button tap goes.
 *
 * A function reference rather than an import, because `ui` must not reach into
 * `platform` for a service the app already owns - the app injects it once at
 * startup and the DOM helper stays a pure builder.
 */
type UiFeedback = (id: 'ui.tap') => void;

let uiFeedback: UiFeedback | null = null;

export function setUiFeedback(feedback: UiFeedback | null): void {
  uiFeedback = feedback;
}
