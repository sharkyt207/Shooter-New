/**
 * Raid briefing.
 *
 * Announces the procedurally generated rift before the player commits: which
 * fragments are stitched together, how dangerous it looks, when the exits open.
 * The seed signature ("Riss-Signatur 8F3A") doubles as flavour and as a
 * genuinely useful debugging handle - a player can report exactly which raid
 * broke (ADR-009).
 */

import { getAnomaly, type AnomalyKind } from '@/content/anomalies';
import { RAID } from '@/content/balance';
import { formatClock } from '@/core/time/fixedClock';
import { seedSignature } from '@/core/math/random';
import type { GeneratedMap } from '@/game/map/mapGenerator';
import { el, statRow } from '@/ui/components/dom';
import type { Screen } from '@/ui/uiRoot';
import { t, tf } from '@/core/i18n/i18n';

export interface BriefingCallbacks {
  onBack(): void;
  onEnter(): void;
  onReroll(): void;
}

export function createBriefingScreen(
  seed: number,
  map: GeneratedMap,
  callbacks: BriefingCallbacks,
): Screen {
  const threat = describeThreat(map.enemies.length);
  const lockedDoors = map.doors.filter((door) => door.locked).length;
  const anomalyKinds = [...new Set(map.anomalies.map((anomaly) => anomaly.kind))] as AnomalyKind[];

  const root = el('div', {
    className: 'screen',
    children: [
      el('div', {
        className: 'screen__header',
        children: [
          el('div', {
            children: [
              el('h1', { className: 'title', text: t('Riss-Signatur') }),
              el('div', {
                className: 'title mono',
                style: { color: 'var(--color-echo)', letterSpacing: '0.3em' },
                text: seedSignature(seed),
              }),
            ],
          }),
          el('button', { className: 'btn btn--ghost', text: t('Zurück'), onClick: () => callbacks.onBack() }),
        ],
      }),

      el('div', {
        className: 'panel',
        children: [
          el('div', { className: 'panel__title', text: t('Fragmente') }),
          ...map.biomeNames.map((name, index) =>
            el('div', {
              className: 'row',
              style: { gap: 'var(--space-3)', padding: 'var(--space-1) 0' },
              children: [
                el('span', { className: 'mono muted', text: String(index + 1).padStart(2, '0') }),
                el('span', { text: t(name) }),
              ],
            }),
          ),
        ],
      }),

      el('div', {
        className: 'panel',
        children: [
          el('div', { className: 'panel__title', text: t('Lagebild') }),
          statRow(t('Bedrohung'), threat),
          statRow(t('Wetter'), t(map.weather.name)),
          statRow(t('Behälter erfasst'), String(map.containers.length)),
          statRow(
            t('Anomalien'),
            map.anomalies.length > 0
              ? tf('{count} aktiv', { count: map.anomalies.length })
              : t('keine'),
          ),
          statRow(
            t('Verschlossen'),
            // Plurals differ by language, so each form is its own source
            // string rather than a suffix glued on in code.
            lockedDoors === 0
              ? t('keine')
              : lockedDoors === 1
                ? tf('{count} Kammer', { count: lockedDoors })
                : tf('{count} Kammern', { count: lockedDoors }),
          ),
          statRow(t('Ausgänge'), String(map.extractions.length)),
          statRow(t('Dauer'), formatClock(RAID.durationSeconds)),
          statRow(
            t('Erster Ausgang'),
            tf('nach {time}', { time: formatClock(RAID.firstExtractionAtSeconds) }),
          ),
        ],
      }),

      el('div', {
        className: 'panel',
        children: [
          el('div', { className: 'panel__title', text: t('Bedingungen') }),
          el('div', { className: 'muted', text: t(map.weather.briefing) }),
        ],
      }),

      // Name the anomalies that are actually out there. A generic warning
      // teaches nothing; "there is a Bleiche in this rift" changes how the
      // player packs and how they move.
      anomalyKinds.length > 0
        ? el('div', {
            className: 'panel',
            style: { borderColor: 'var(--color-echo)' },
            children: [
              el('div', { className: 'panel__title', text: t('Warnung') }),
              ...anomalyKinds.map((kind) =>
                el('div', {
                  className: 'row',
                  style: { gap: 'var(--space-3)', padding: 'var(--space-1) 0' },
                  children: [
                    el('span', {
                      style: { color: colorToCss(getAnomaly(kind).color), fontWeight: '600' },
                      text: t(getAnomaly(kind).name),
                    }),
                    el('span', { className: 'muted grow', text: t(getAnomaly(kind).description) }),
                  ],
                }),
              ),
            ],
          })
        : null,

      el('div', { className: 'grow' }),

      el('div', {
        className: 'stack',
        children: [
          el('button', {
            className: 'btn btn--go btn--block',
            text: t('Riss betreten'),
            onClick: () => callbacks.onEnter(),
          }),
          el('button', {
            className: 'btn btn--ghost btn--block',
            text: t('Andere Signatur suchen'),
            onClick: () => callbacks.onReroll(),
          }),
        ],
      }),
    ],
  });

  return { root };
}

/** Enemy count is the honest signal we have in M1; squads arrive in M3. */
function describeThreat(enemyCount: number): string {
  if (enemyCount <= 6) return t('gering');
  if (enemyCount <= 12) return t('mittel');
  if (enemyCount <= 20) return t('hoch');
  return t('extrem');
}

/** 0xRRGGBB to a CSS colour. The palette lives in content, not in the stylesheet. */
function colorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
