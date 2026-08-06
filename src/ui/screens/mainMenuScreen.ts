/**
 * Main menu.
 *
 * Deliberately spare: the fastest possible route from launch to a raid. Every
 * extra tap here is a tap the player pays on every session.
 */

import type { PlayerProfile } from '@/game/base/profile';
import { levelFromXp } from '@/game/base/profile';
import { assetUrl } from '@/ui/assets/uiAssets';
import { el, formatCredits } from '@/ui/components/dom';
import type { Screen } from '@/ui/uiRoot';
import { t, tf } from '@/core/i18n/i18n';

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
        className: 'menu__brand',
        children: [
          // The emblem comes from the manifest, so it is present when real art
          // has been registered and simply absent when it has not. The menu is
          // never broken by a missing file (ADR-008).
          emblem(),
          el('h1', { className: 'title title--brand', text: 'Project Echo' }),
          el('p', {
            className: 'subtitle',
            text: t('Die Realität ist zerbrochen. Geh hinein. Komm zurück.'),
          }),
        ],
      }),

      el('div', {
        className: 'menu__actions',
        children: [
          el('button', {
            className: 'btn btn--primary btn--block',
            text: hasHistory ? t('Fortsetzen') : t('Riss betreten'),
            onClick: () => callbacks.onContinue(),
          }),
          hasHistory
            ? el('button', {
                className: 'btn btn--ghost btn--block',
                text: t('Neues Profil'),
                onClick: () => {
                  // Destructive and irreversible - it must be confirmed.
                  if (globalThis.confirm?.(t('Profil wirklich zurücksetzen? Lager und Fortschritt gehen verloren.'))) {
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
              el('div', { className: 'panel__title', text: t('Operator') }),
              row(t('Stufe'), String(levelFromXp(profile.xp))),
              row(t('Guthaben'), formatCredits(profile.credits)),
              row(t('Raids'), String(stats.raidsStarted)),
              row(t('Extraktionen'), String(stats.extractions)),
              row(t('Verluste'), String(stats.deaths)),
              row(t('Bester Fund'), formatCredits(stats.bestHaul)),
            ],
          })
        : null,

      el('div', { className: 'muted', text: tf('Version {version} · Meilenstein {milestone}', { version, milestone: 'M7' }) }),
    ],
  });

  return { root };
}

/** The rift mark, or nothing at all when no asset is registered. */
function emblem(): HTMLElement | null {
  const url = assetUrl('ui.emblem');
  if (!url) return null;
  return el('img', {
    className: 'menu__emblem',
    attrs: { src: url, alt: '', 'aria-hidden': 'true' },
  });
}

function row(label: string, value: string): HTMLElement {
  return el('div', {
    className: 'stat-row',
    children: [el('span', { text: label }), el('span', { text: value })],
  });
}
