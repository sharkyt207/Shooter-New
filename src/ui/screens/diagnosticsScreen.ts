/**
 * Diagnostics — the balancing readout, shown to the player.
 *
 * This screen is the balancing tool `docs/02-ROADMAP.md` asks for in M8, and
 * it is deliberately not hidden behind a debug flag. The data describes the
 * player's own raids and lives on the player's own device; the most convincing
 * privacy statement available is letting them read every number that was kept
 * and delete it in one tap.
 *
 * Everything shown is derived by `summarise()` in `game/telemetry`. This file
 * only formats — no arithmetic beyond a percentage, so the screen and the
 * tests can never disagree about what a figure means.
 */

import { t, tf } from '@/core/i18n/i18n';
import type { DeathCause, TelemetrySummary } from '@/game/telemetry/telemetry';
import { el, formatCredits, formatNumber, statRow } from '@/ui/components/dom';
import type { Screen } from '@/ui/uiRoot';

export interface DiagnosticsCallbacks {
  onBack(): void;
  onClear(): void;
}

export function createDiagnosticsScreen(
  summary: TelemetrySummary,
  balanceVersion: string,
  callbacks: DiagnosticsCallbacks,
): Screen {
  const root = el('div', {
    className: 'screen',
    children: [
      el('div', {
        className: 'screen__header',
        children: [
          el('button', {
            className: 'btn btn--ghost',
            text: t('Zurück'),
            onClick: () => callbacks.onBack(),
          }),
          el('h1', { className: 'title', text: t('Diagnose') }),
        ],
      }),

      el('p', {
        className: 'muted',
        style: { maxWidth: '52ch' },
        text: t('Diese Zahlen bleiben auf diesem Gerät. Sie werden nicht gesendet, nicht geteilt und nicht ausgewertet — sie sind nur hier.'),
      }),

      summary.raids === 0
        ? el('div', {
            className: 'panel',
            children: [
              el('div', { className: 'muted', text: t('Noch keine Raids aufgezeichnet.') }),
            ],
          })
        : el('div', {
            className: 'panel-grid',
            children: [outcomePanel(summary), combatPanel(summary), causesPanel(summary)],
          }),

      el('div', {
        className: 'panel',
        children: [
          el('div', { className: 'panel__title', text: t('Konfiguration') }),
          statRow(t('Balance-Version'), balanceVersion),
          statRow(t('Aufgezeichnete Raids'), formatNumber(summary.raids)),
          statRow(t('Raids insgesamt'), formatNumber(summary.totalRaids)),
        ],
      }),

      el('button', {
        className: 'btn btn--danger',
        text: t('Aufzeichnung löschen'),
        onClick: () => {
          if (globalThis.confirm?.(t('Alle aufgezeichneten Zahlen löschen? Der Spielfortschritt bleibt erhalten.'))) {
            callbacks.onClear();
          }
        },
      }),
    ],
  });

  return { root };
}

function outcomePanel(s: TelemetrySummary): HTMLElement {
  return el('div', {
    className: 'panel',
    children: [
      el('div', { className: 'panel__title', text: t('Ausgang') }),
      statRow(t('Extrahiert'), percent(s.extractionRate)),
      statRow(t('Gefallen'), percent(s.deathRate)),
      statRow(t('Zeit abgelaufen'), percent(s.timeoutRate)),
      statRow(t('Ø Dauer'), duration(s.averageDurationSeconds)),
      statRow(t('Ø Wert je Raid'), formatCredits(s.averageValuePerRaid)),
      // The one figure here that is about frustration rather than balance.
      // Plural as two source strings, not a suffix glued on in code: "1 Raids"
      // is wrong in both languages.
      statRow(
        t('Längste Verlustserie'),
        s.worstDeathStreak === 1
          ? tf('{count} Raid', { count: 1 })
          : tf('{count} Raids', { count: s.worstDeathStreak }),
      ),
    ],
  });
}

function combatPanel(s: TelemetrySummary): HTMLElement {
  return el('div', {
    className: 'panel',
    children: [
      el('div', { className: 'panel__title', text: t('Kampf') }),
      statRow(t('Ø Abschüsse'), s.averageKills.toFixed(1)),
      statRow(
        t('Treffer je Schuss'),
        s.hitsPerShot === null ? '—' : s.hitsPerShot.toFixed(2),
      ),
      statRow(t('Ø erlittener Schaden'), formatNumber(s.averageDamageTaken)),
      statRow(t('Boss angetroffen'), percent(s.bossEngagementRate)),
    ],
  });
}

function causesPanel(s: TelemetrySummary): HTMLElement {
  return el('div', {
    className: 'panel',
    children: [
      el('div', { className: 'panel__title', text: t('Todesursachen') }),
      ...(s.deathCauses.length === 0
        ? [el('div', { className: 'muted', text: t('Noch kein Verlust.') })]
        : s.deathCauses.map((entry) => statRow(causeLabel(entry.cause), percent(entry.share)))),
    ],
  });
}

/**
 * Cause labels are written out rather than derived from the id.
 *
 * A translated string keyed on a runtime value cannot be found by the
 * call-site scan in `i18n.test.ts`; a `switch` puts every one of them where
 * that scan can see it.
 */
function causeLabel(cause: DeathCause): string {
  switch (cause) {
    case 'gunfire':
      return t('Beschuss');
    case 'explosion':
      return t('Explosion');
    case 'melee':
      return t('Nahkampf');
    case 'anomaly':
      return t('Anomalie');
    default:
      return t('Unbekannt');
  }
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)} %`;
}

function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
