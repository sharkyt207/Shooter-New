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
              el('h1', { className: 'title', text: 'Riss-Signatur' }),
              el('div', {
                className: 'title mono',
                style: { color: 'var(--color-echo)', letterSpacing: '0.3em' },
                text: seedSignature(seed),
              }),
            ],
          }),
          el('button', { className: 'btn btn--ghost', text: 'Zurück', onClick: () => callbacks.onBack() }),
        ],
      }),

      el('div', {
        className: 'panel',
        children: [
          el('div', { className: 'panel__title', text: 'Fragmente' }),
          ...map.biomeNames.map((name, index) =>
            el('div', {
              className: 'row',
              style: { gap: 'var(--space-3)', padding: 'var(--space-1) 0' },
              children: [
                el('span', { className: 'mono muted', text: String(index + 1).padStart(2, '0') }),
                el('span', { text: name }),
              ],
            }),
          ),
        ],
      }),

      el('div', {
        className: 'panel',
        children: [
          el('div', { className: 'panel__title', text: 'Lagebild' }),
          statRow('Bedrohung', threat),
          statRow('Wetter', map.weather.name),
          statRow('Behälter erfasst', String(map.containers.length)),
          statRow('Anomalien', map.anomalies.length > 0 ? `${map.anomalies.length} aktiv` : 'keine'),
          statRow(
            'Verschlossen',
            lockedDoors > 0 ? `${lockedDoors} Kammer${lockedDoors > 1 ? 'n' : ''}` : 'keine',
          ),
          statRow('Ausgänge', String(map.extractions.length)),
          statRow('Dauer', formatClock(RAID.durationSeconds)),
          statRow(
            'Erster Ausgang',
            `nach ${formatClock(RAID.firstExtractionAtSeconds)}`,
          ),
        ],
      }),

      el('div', {
        className: 'panel',
        children: [
          el('div', { className: 'panel__title', text: 'Bedingungen' }),
          el('div', { className: 'muted', text: map.weather.briefing }),
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
              el('div', { className: 'panel__title', text: 'Warnung' }),
              ...anomalyKinds.map((kind) =>
                el('div', {
                  className: 'row',
                  style: { gap: 'var(--space-3)', padding: 'var(--space-1) 0' },
                  children: [
                    el('span', {
                      style: { color: colorToCss(getAnomaly(kind).color), fontWeight: '600' },
                      text: getAnomaly(kind).name,
                    }),
                    el('span', { className: 'muted grow', text: getAnomaly(kind).description }),
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
            text: 'Riss betreten',
            onClick: () => callbacks.onEnter(),
          }),
          el('button', {
            className: 'btn btn--ghost btn--block',
            text: 'Andere Signatur suchen',
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
  if (enemyCount <= 6) return 'gering';
  if (enemyCount <= 12) return 'mittel';
  if (enemyCount <= 20) return 'hoch';
  return 'extrem';
}

/** 0xRRGGBB to a CSS colour. The palette lives in content, not in the stylesheet. */
function colorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
