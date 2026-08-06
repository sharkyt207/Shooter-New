/**
 * Pause overlay.
 *
 * Pausing is a genuine pause: the simulation stops stepping. This is a
 * single-player PvE game (ADR-006), so there is no reason to punish a player
 * whose phone rings mid-raid.
 *
 * "Raid abbrechen" is intentionally worded as a loss, not as a menu action -
 * leaving a raid early costs the gear, exactly like dying.
 */

import { el } from '@/ui/components/dom';
import type { Screen } from '@/ui/uiRoot';
import { AVAILABLE_LOCALES, t, type Locale } from '@/core/i18n/i18n';

export interface PauseCallbacks {
  onResume(): void;
  onAbandon(): void;
  onToggleDebug(): void;
  onToggleHanded(): void;
  onSelectLocale(locale: Locale): void;
}

export function createPauseOverlay(
  state: { debug: boolean; leftHanded: boolean; locale: Locale },
  callbacks: PauseCallbacks,
): Screen {
  const debugButton = el('button', {
    className: 'btn btn--ghost btn--block',
    text: labelFor('Debug-Ansicht', state.debug),
    onClick: () => {
      state.debug = !state.debug;
      debugButton.textContent = labelFor('Debug-Ansicht', state.debug);
      callbacks.onToggleDebug();
    },
  });

  const handedButton = el('button', {
    className: 'btn btn--ghost btn--block',
    text: labelFor('Linkshänder-Modus', state.leftHanded),
    onClick: () => {
      state.leftHanded = !state.leftHanded;
      handedButton.textContent = labelFor('Linkshänder-Modus', state.leftHanded);
      callbacks.onToggleHanded();
    },
  });

  const root = el('div', {
    className: 'screen screen--overlay menu',
    children: [
      el('h1', { className: 'title', text: t('Pause') }),
      el('div', {
        className: 'menu__actions',
        children: [
          el('button', {
            className: 'btn btn--primary btn--block',
            text: t('Weiter'),
            onClick: () => callbacks.onResume(),
          }),
          debugButton,
          handedButton,
          languageRow(state.locale, callbacks),
          el('button', {
            className: 'btn btn--danger btn--block',
            text: t('Raid abbrechen'),
            onClick: () => {
              if (
                globalThis.confirm?.(
                  t('Raid abbrechen? Die gesamte mitgeführte Ausrüstung gilt als verloren.'),
                )
              ) {
                callbacks.onAbandon();
              }
            },
          }),
        ],
      }),
      el('div', {
        className: 'muted',
        style: { maxWidth: '30ch', textAlign: 'center' },
        text: t('Desktop: WASD bewegen · Maus zielen · Klick feuern · R laden · E interagieren · Tab Inventar'),
      }),
    ],
  });

  return { root };
}

/**
 * Language, as a row of buttons rather than a cycling toggle.
 *
 * A player who cannot read the current language cannot read a button that says
 * "Sprache: Deutsch" either. Both options are always visible and always written
 * in their own language, so the right one is recognisable regardless of what
 * the game is currently set to.
 */
function languageRow(active: Locale, callbacks: PauseCallbacks): HTMLElement {
  return el('div', {
    className: 'row',
    style: { gap: 'var(--space-2)', width: '100%' },
    children: AVAILABLE_LOCALES.map((locale) =>
      el('button', {
        className: `btn grow ${locale.id === active ? 'btn--primary' : 'btn--ghost'}`,
        text: locale.label,
        onClick: () => callbacks.onSelectLocale(locale.id),
      }),
    ),
  });
}

function labelFor(name: string, active: boolean): string {
  return `${t(name)}: ${active ? t('an') : t('aus')}`;
}
