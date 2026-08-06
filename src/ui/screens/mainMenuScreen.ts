/**
 * Main menu.
 *
 * Deliberately spare: the fastest possible route from launch to a raid. Every
 * extra tap here is a tap the player pays on every session.
 */

import type { PlayerProfile } from '@/game/base/profile';
import { levelFromXp } from '@/game/base/profile';
import { el, formatCredits } from '@/ui/components/dom';
import type { Screen } from '@/ui/uiRoot';

export interface MainMenuCallbacks {
  onContinue(): void;
  onNewProfile(): void;
}

export function createMainMenuScreen(
  profile: PlayerProfile,
  version: string,
  callbacks: MainMenuCallbacks,
): Screen {
  const stats = profile.stats;
  const hasHistory = stats.raidsStarted > 0;

  const root = el('div', {
    className: 'screen menu',
    children: [
      el('div', {
        children: [
          el('h1', { className: 'title title--brand', text: 'Project Echo' }),
          el('p', {
            className: 'subtitle',
            text: 'Die Realität ist zerbrochen. Geh hinein. Komm zurück.',
          }),
        ],
      }),

      el('div', {
        className: 'menu__actions',
        children: [
          el('button', {
            className: 'btn btn--primary btn--block',
            text: hasHistory ? 'Fortsetzen' : 'Riss betreten',
            onClick: () => callbacks.onContinue(),
          }),
          hasHistory
            ? el('button', {
                className: 'btn btn--ghost btn--block',
                text: 'Neues Profil',
                onClick: () => {
                  // Destructive and irreversible - it must be confirmed.
                  if (globalThis.confirm?.('Profil wirklich zurücksetzen? Lager und Fortschritt gehen verloren.')) {
                    callbacks.onNewProfile();
                  }
                },
              })
            : null,
        ],
      }),

      hasHistory
        ? el('div', {
            className: 'panel',
            style: { width: 'min(88vw, 340px)' },
            children: [
              el('div', { className: 'panel__title', text: 'Operator' }),
              row('Stufe', String(levelFromXp(profile.xp))),
              row('Guthaben', formatCredits(profile.credits)),
              row('Raids', String(stats.raidsStarted)),
              row('Extraktionen', String(stats.extractions)),
              row('Verluste', String(stats.deaths)),
              row('Bester Fund', formatCredits(stats.bestHaul)),
            ],
          })
        : null,

      el('div', { className: 'muted', text: `Version ${version} · Prototyp M1` }),
    ],
  });

  return { root };
}

function row(label: string, value: string): HTMLElement {
  return el('div', {
    className: 'stat-row',
    children: [el('span', { text: label }), el('span', { text: value })],
  });
}
