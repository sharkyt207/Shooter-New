/**
 * Raid result.
 *
 * On success it lists what was secured. On failure it is deliberately brief and
 * cold - dwelling on the loss is not what makes a player start another raid;
 * seeing the shards they kept is (Pillar P5).
 */

import { formatClock } from '@/core/time/fixedClock';
import type { RaidOutcome } from '@/game/gameEvents';
import type { SettlementReport } from '@/game/economy/trader';
import { mergeHudItems, toHudItems } from '@/ui/viewModel';
import { el, formatCredits, formatNumber, statRow } from '@/ui/components/dom';
import type { Screen } from '@/ui/uiRoot';
import { t, tf } from '@/core/i18n/i18n';

export interface ResultCallbacks {
  onReturnToBase(): void;
}

export function createResultScreen(report: SettlementReport, callbacks: ResultCallbacks): Screen {
  const { outcome } = report;
  const success = outcome.kind === 'extracted';

  const root = el('div', {
    className: 'screen',
    children: [
      el('div', {
        style: { textAlign: 'center', marginBottom: 'var(--space-4)' },
        children: [
          el('div', {
            className: `outcome ${success ? 'outcome--success' : 'outcome--failure'}`,
            text: titleFor(outcome),
          }),
          el('div', { className: 'subtitle', text: subtitleFor(outcome) }),
        ],
      }),

      el('div', {
        className: 'panel',
        children: [
          el('div', { className: 'panel__title', text: t('Bilanz') }),
          statRow(t('Dauer'), formatClock(outcome.durationSeconds)),
          statRow(t('Ausschaltungen'), String(outcome.kills)),
          statRow(t('Erfahrung'), `+${formatNumber(outcome.xp)}`),
          success
            ? statRow(t('Beutewert'), formatCredits(outcome.lootValue))
            : statRow(t('Verlust'), t('gesamte mitgeführte Ausrüstung')),
          !success && outcome.retainedShards > 0
            ? statRow(t('Gerettete Echo-Splitter'), String(outcome.retainedShards))
            : null,
          report.leveledUp ? statRow(t('Aufstieg'), tf('Stufe {level}', { level: report.newLevel })) : null,
        ].filter(Boolean) as HTMLElement[],
      }),

      success && outcome.loot.length > 0
        ? el('div', {
            className: 'panel',
            children: [
              el('div', { className: 'panel__title', text: t('Gesichert') }),
              el('div', {
                className: 'item-list',
                children: mergeHudItems(toHudItems(outcome.loot))
                  .sort((a, b) => b.value - a.value)
                  .map((item) =>
                    el('div', {
                      className: 'item',
                      data: { rarity: item.rarity },
                      children: [
                        el('div', { className: 'item__name', text: item.name }),
                        el('div', { className: 'item__meta', text: `×${item.quantity}` }),
                        el('div', { className: 'item__meta', text: formatCredits(item.value) }),
                      ],
                    }),
                  ),
              }),
            ],
          })
        : null,

      report.overflow.length > 0
        ? el('div', {
            className: 'panel',
            style: { borderColor: 'var(--color-threat)' },
            children: [
              el('div', { className: 'panel__title', text: t('Lager voll') }),
              el('div', {
                className: 'muted',
                text: t('Diese Gegenstände passten nicht mehr ins Lager und gingen verloren. Lager ausbauen.'),
              }),
              ...mergeHudItems(toHudItems(report.overflow)).map((item) =>
                el('div', { className: 'muted', text: `${item.name} ×${item.quantity}` }),
              ),
            ],
          })
        : null,

      el('div', { className: 'grow' }),

      el('button', {
        className: 'btn btn--primary btn--block',
        text: t('Zurück zur Basis'),
        onClick: () => callbacks.onReturnToBase(),
      }),
    ],
  });

  return { root };
}

function titleFor(outcome: RaidOutcome): string {
  switch (outcome.kind) {
    case 'extracted':
      return t('Extrahiert');
    case 'died':
      return t('Gefallen');
    case 'timeout':
      return t('Verschollen');
  }
}

function subtitleFor(outcome: RaidOutcome): string {
  switch (outcome.kind) {
    case 'extracted':
      return outcome.zoneName
        ? tf('über {zone}', { zone: t(outcome.zoneName) })
        : t('Beute gesichert');
    case 'died':
      return t('Der Riss hat behalten, was du getragen hast.');
    case 'timeout':
      return t('Der Riss schloss sich, bevor du draußen warst.');
  }
}
