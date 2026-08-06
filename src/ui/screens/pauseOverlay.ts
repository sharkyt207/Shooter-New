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

export interface PauseCallbacks {
  onResume(): void;
  onAbandon(): void;
  onToggleDebug(): void;
  onToggleHanded(): void;
}

export function createPauseOverlay(
  state: { debug: boolean; leftHanded: boolean },
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
      el('h1', { className: 'title', text: 'Pause' }),
      el('div', {
        className: 'menu__actions',
        children: [
          el('button', {
            className: 'btn btn--primary btn--block',
            text: 'Weiter',
            onClick: () => callbacks.onResume(),
          }),
          debugButton,
          handedButton,
          el('button', {
            className: 'btn btn--danger btn--block',
            text: 'Raid abbrechen',
            onClick: () => {
              if (
                globalThis.confirm?.(
                  'Raid abbrechen? Die gesamte mitgeführte Ausrüstung gilt als verloren.',
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
        text: 'Desktop: WASD bewegen · Maus zielen · Klick feuern · R laden · E interagieren · Tab Inventar',
      }),
    ],
  });

  return { root };
}

function labelFor(name: string, active: boolean): string {
  return `${name}: ${active ? 'an' : 'aus'}`;
}
