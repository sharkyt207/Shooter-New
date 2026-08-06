/**
 * In-raid HUD.
 *
 * Rules it follows (docs/08-UI-UX.md):
 *   - never more than three things to read at once
 *   - nothing important sits where a thumb rests
 *   - every element updates only when its value actually changed
 *
 * The last point is what keeps the DOM overlay inside its 1.5 ms frame budget.
 */

import { formatClock } from '@/core/time/fixedClock';
import type { HudViewModel } from '@/ui/viewModel';
import type { TouchInput } from '@/platform/input/touchInput';
import { bar, clear, el, formatWeight, type BarHandle } from '@/ui/components/dom';
import { Minimap } from './minimap';

export interface HudCallbacks {
  onInventory(): void;
  onPause(): void;
  onUseItem(itemId: string): void;
  onThrowItem(itemId: string): void;
  onMelee(): void;
}

export class Hud {
  readonly root: HTMLElement;

  private readonly healthBar: BarHandle;
  private readonly staminaBar: BarHandle;
  private readonly weightBar: BarHandle;
  private readonly weightLabel: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly ammo: HTMLElement;
  private readonly context: HTMLElement;
  private readonly contextLabel: HTMLElement;
  private readonly contextBar: BarHandle;
  private readonly extraction: HTMLElement;
  private readonly extractionLabel: HTMLElement;
  private readonly extractionBar: BarHandle;
  private readonly banner: HTMLElement;
  private readonly vignette: HTMLElement;
  private readonly quickUse: HTMLElement;
  private readonly throwables: HTMLElement;
  private readonly moveStick: HTMLElement;
  private readonly moveKnob: HTMLElement;
  private readonly aimStick: HTMLElement;
  private readonly aimKnob: HTMLElement;
  private readonly minimap: Minimap;

  /** Cached values so the DOM is only touched on real change. */
  private last = {
    health: -1,
    stamina: -1,
    weight: -1,
    ammoText: '',
    timerText: '',
    contextLabel: '',
    quickUseKey: '',
    throwKey: '',
  };

  private bannerTimeout: ReturnType<typeof setTimeout> | null = null;
  private hurtTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly touch: TouchInput,
    private readonly callbacks: HudCallbacks,
  ) {
    this.healthBar = bar('health');
    this.staminaBar = bar('stamina');
    this.weightBar = bar('weight');
    this.weightLabel = el('div', { className: 'muted mono', text: '0.0 kg' });

    this.timer = el('div', { className: 'hud__timer', text: '10:00' });
    this.ammo = el('div', { className: 'hud__ammo' });

    this.contextLabel = el('div', { text: '' });
    this.contextBar = bar('context');
    this.context = el('div', {
      className: 'hud__context',
      children: [this.contextLabel, this.contextBar.root],
    });
    this.context.style.display = 'none';

    this.extractionLabel = el('div', { className: 'subtitle', text: 'Extraktion' });
    this.extractionBar = bar('extraction');
    this.extraction = el('div', {
      className: 'hud__extraction',
      children: [this.extractionLabel, this.extractionBar.root],
    });
    this.extraction.style.display = 'none';

    this.banner = el('div', { className: 'hud__banner' });
    this.banner.style.display = 'none';

    this.vignette = el('div', { className: 'hud__vignette' });
    this.quickUse = el('div', { className: 'hud__buttons' });
    this.throwables = el('div', {
      className: 'hud__buttons hud__buttons--throw',
      style: { right: 'calc(var(--safe-right) + 148px)' },
    });

    this.moveKnob = el('div', { className: 'stick__knob' });
    this.moveStick = el('div', { className: 'stick stick--move', children: [this.moveKnob] });
    this.aimKnob = el('div', { className: 'stick__knob' });
    this.aimStick = el('div', { className: 'stick stick--aim', children: [this.aimKnob] });

    this.minimap = new Minimap(108);

    this.root = el('div', {
      className: 'hud',
      children: [
        el('div', {
          className: 'hud__vitals',
          children: [
            this.healthBar.root,
            this.staminaBar.root,
            el('div', {
              className: 'row',
              children: [
                el('div', { className: 'grow', children: [this.weightBar.root] }),
                this.weightLabel,
              ],
            }),
          ],
        }),
        this.timer,
        this.minimap.root,
        el('div', {
          className: 'hud__topright',
          children: [
            el('button', {
              className: 'hud__icon-btn',
              text: '▤',
              attrs: { 'aria-label': 'Inventar' },
              data: { uiControl: 'true' },
              onClick: () => this.callbacks.onInventory(),
            }),
            el('button', {
              className: 'hud__icon-btn',
              text: '❚❚',
              attrs: { 'aria-label': 'Pause' },
              data: { uiControl: 'true' },
              onClick: () => this.callbacks.onPause(),
            }),
          ],
        }),
        this.context,
        this.extraction,
        this.banner,
        this.ammo,
        this.buildControls(),
        this.quickUse,
        this.throwables,
        this.moveStick,
        this.aimStick,
        this.vignette,
      ],
    });
  }

  /** The three fixed action buttons on the right-hand side. */
  private buildControls(): HTMLElement {
    return el('div', {
      className: 'hud__buttons',
      style: { right: 'calc(var(--safe-right) + 76px)' },
      children: [
        el('button', {
          className: 'hud__btn hud__btn--interact',
          text: 'Nehmen',
          onHold: (pressed) => this.touch.setButton('interact', pressed),
        }),
        el('button', {
          className: 'hud__btn',
          text: 'Laden',
          data: { uiControl: 'true' },
          onClick: () => this.touch.setButton('reload', true),
        }),
        el('button', {
          className: 'hud__btn',
          text: 'Sprint',
          onHold: (pressed) => this.touch.setButton('sprint', pressed),
        }),
        el('button', {
          className: 'hud__btn hud__btn--melee',
          text: 'Nah',
          attrs: { 'aria-label': 'Nahkampf' },
          data: { uiControl: 'true' },
          onClick: () => this.callbacks.onMelee(),
        }),
      ],
    });
  }

  /** Called once per rendered frame. */
  update(vm: HudViewModel, grid: MinimapGrid): void {
    this.updateVitals(vm);
    this.updateAmmo(vm);
    this.updateTimer(vm);
    this.updateContext(vm);
    this.updateExtraction(vm);
    this.updateQuickUse(vm);
    this.updateThrowables(vm);
    this.updateSticks();
    this.minimap.update(vm, grid);
  }

  private updateVitals(vm: HudViewModel): void {
    const healthFraction = vm.maxHealth > 0 ? vm.health / vm.maxHealth : 0;
    if (Math.abs(healthFraction - this.last.health) > 0.001) {
      this.last.health = healthFraction;
      this.healthBar.set(healthFraction);
      // Below 25 % the screen itself tells the player they are in trouble.
      this.vignette.classList.toggle('is-critical', healthFraction > 0 && healthFraction < 0.25);
    }

    const staminaFraction = vm.maxStamina > 0 ? vm.stamina / vm.maxStamina : 0;
    if (Math.abs(staminaFraction - this.last.stamina) > 0.01) {
      this.last.stamina = staminaFraction;
      this.staminaBar.set(staminaFraction);
    }

    const load = vm.capacity > 0 ? vm.weight / vm.capacity : 0;
    if (Math.abs(load - this.last.weight) > 0.005) {
      this.last.weight = load;
      this.weightBar.set(load);
      this.weightBar.setClass('is-heavy', load >= 0.85 && load < 1);
      this.weightBar.setClass('is-over', load >= 1);
      this.weightLabel.textContent = formatWeight(vm.weight);
    }
  }

  private updateAmmo(vm: HudViewModel): void {
    const text = vm.jammed
      ? 'jam'
      : vm.reloading
        ? `${Math.round(vm.reloadProgress * 100)}%`
        : `${vm.magazine} / ${vm.reserveAmmo} ${vm.ammoName ?? ''}`;
    if (text === this.last.ammoText) return;
    this.last.ammoText = text;

    clear(this.ammo);

    // A jam is the single most urgent thing on screen when it happens: the
    // weapon simply will not fire until it is cleared.
    if (vm.jammed) {
      this.ammo.appendChild(el('span', { className: 'is-empty', text: 'LADEHEMMUNG' }));
      return;
    }
    if (vm.reloading) {
      this.ammo.appendChild(el('span', { className: 'subtitle', text: `Nachladen ${text}` }));
      return;
    }

    this.ammo.appendChild(
      el('span', { className: vm.magazine === 0 ? 'is-empty' : '', text: String(vm.magazine) }),
    );
    this.ammo.appendChild(el('small', { text: ` / ${vm.reserveAmmo}` }));
    if (vm.ammoName) {
      this.ammo.appendChild(el('small', { text: ` · ${vm.ammoName}` }));
    }
    if (vm.weaponCondition < 0.55) {
      this.ammo.appendChild(
        el('small', {
          style: { color: vm.weaponCondition < 0.3 ? 'var(--color-danger)' : 'var(--color-threat)' },
          text: ` · Zustand ${Math.round(vm.weaponCondition * 100)} %`,
        }),
      );
    }
  }

  private updateTimer(vm: HudViewModel): void {
    const text = formatClock(vm.remainingSeconds);
    if (text === this.last.timerText) return;
    this.last.timerText = text;
    this.timer.textContent = text;
    this.timer.classList.toggle('is-urgent', vm.remainingSeconds <= 120);
  }

  private updateContext(vm: HudViewModel): void {
    // Using an item takes priority: the player is committed and vulnerable.
    const label = vm.usingItemLabel
      ? `${vm.usingItemLabel} …`
      : vm.interactionLabel
        ? vm.interactionLabel
        : '';
    const progress = vm.usingItemLabel ? vm.usingItemProgress : vm.interactionProgress;

    if (label !== this.last.contextLabel) {
      this.last.contextLabel = label;
      this.contextLabel.textContent = label;
      this.context.style.display = label ? 'block' : 'none';
    }
    this.contextBar.set(progress);
    this.contextBar.root.style.display = progress > 0 ? 'block' : 'none';
  }

  private updateExtraction(vm: HudViewModel): void {
    this.extraction.style.display = vm.extractionActive ? 'block' : 'none';
    if (!vm.extractionActive) return;
    this.extractionLabel.textContent = `Extraktion · ${vm.extractionZoneName ?? ''}`;
    this.extractionBar.set(vm.extractionProgress);
  }

  private updateQuickUse(vm: HudViewModel): void {
    const key = vm.consumables.map((item) => `${item.itemId}:${item.quantity}`).join('|');
    if (key === this.last.quickUseKey) return;
    this.last.quickUseKey = key;

    clear(this.quickUse);
    for (const item of vm.consumables.slice(0, 2)) {
      this.quickUse.appendChild(
        el('button', {
          className: 'hud__btn',
          text: `${shortName(item.name)}\n${item.quantity}`,
          data: { uiControl: 'true' },
          onClick: () => this.callbacks.onUseItem(item.itemId),
        }),
      );
    }
  }

  private updateThrowables(vm: HudViewModel): void {
    const key = vm.throwables.map((item) => `${item.itemId}:${item.quantity}`).join('|');
    if (key === this.last.throwKey) return;
    this.last.throwKey = key;

    clear(this.throwables);
    for (const item of vm.throwables.slice(0, 3)) {
      this.throwables.appendChild(
        el('button', {
          className: 'hud__btn hud__btn--throw',
          text: `${shortName(item.name)}\n${item.quantity}`,
          data: { uiControl: 'true' },
          onClick: () => this.callbacks.onThrowItem(item.itemId),
        }),
      );
    }
  }

  private updateSticks(): void {
    const visuals = this.touch.getVisuals();
    applyStick(this.moveStick, this.moveKnob, visuals.move);
    applyStick(this.aimStick, this.aimKnob, visuals.aim);
  }

  /** A transient centre-screen message, e.g. "Extraktion Nord offen". */
  showBanner(text: string, milliseconds = 3200): void {
    this.banner.textContent = text;
    this.banner.style.display = 'block';
    if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
    this.bannerTimeout = setTimeout(() => {
      this.banner.style.display = 'none';
    }, milliseconds);
  }

  /** Red edge flash when the player takes a hit. */
  flashDamage(): void {
    this.vignette.classList.add('is-hurt');
    if (this.hurtTimeout) clearTimeout(this.hurtTimeout);
    this.hurtTimeout = setTimeout(() => this.vignette.classList.remove('is-hurt'), 90);
  }

  destroy(): void {
    if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
    if (this.hurtTimeout) clearTimeout(this.hurtTimeout);
    this.root.remove();
  }
}

/** Minimal shape the minimap needs; avoids importing the whole grid class. */
export interface MinimapGrid {
  width: number;
  height: number;
  cellSize: number;
  isWall(cx: number, cy: number): boolean;
}

function applyStick(
  stick: HTMLElement,
  knob: HTMLElement,
  visual: { active: boolean; originX: number; originY: number; knobX: number; knobY: number },
): void {
  stick.classList.toggle('is-active', visual.active);
  if (!visual.active) return;
  stick.style.left = `${visual.originX}px`;
  stick.style.top = `${visual.originY}px`;
  knob.style.transform = `translate(${visual.knobX}px, ${visual.knobY}px)`;
}

/**
 * Fit an item name onto a 52-58 px round button.
 *
 * Anything longer overflows the circle, and an overflowing HUD button reads as
 * broken rather than as informative.
 */
function shortName(name: string): string {
  const firstWord = name.split(/[\s-]/)[0] ?? name;
  return firstWord.length > 7 ? `${firstWord.slice(0, 6)}.` : firstWord;
}
