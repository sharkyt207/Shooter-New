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
          el('div', { className: 'panel__title', text: 'Bilanz' }),
          statRow('Dauer', formatClock(outcome.durationSeconds)),
          statRow('Ausschaltungen', String(outcome.kills)),
          statRow('Erfahrung', `+${formatNumber(outcome.xp)}`),
          success
            ? statRow('Beutewert', formatCredits(outcome.lootValue))
            : statRow('Verlust', 'gesamte mitgeführte Ausrüstung'),
          !success && outcome.retainedShards > 0
            ? statRow('Gerettete Echo-Splitter', String(outcome.retainedShards))
            : null,
          report.leveledUp ? statRow('Aufstieg', `Stufe ${report.newLevel}`) : null,
        ].filter(Boolean) as HTMLElement[],
      }),

      success && outcome.loot.length > 0
        ? el('div', {
            className: 'panel',
            children: [
              el('div', { className: 'panel__title', text: 'Gesichert' }),
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
              el('div', { className: 'panel__title', text: 'Lager voll' }),
              el('div', {
                className: 'muted',
                text: 'Diese Gegenstände passten nicht mehr ins Lager und gingen verloren. Lager ausbauen.',
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
        text: 'Zurück zur Basis',
        onClick: () => callbacks.onReturnToBase(),
      }),
    ],
  });

  return { root };
}

function titleFor(outcome: RaidOutcome): string {
  switch (outcome.kind) {
    case 'extracted':
      return 'Extrahiert';
    case 'died':
      return 'Gefallen';
    case 'timeout':
      return 'Verschollen';
  }
}

function subtitleFor(outcome: RaidOutcome): string {
  switch (outcome.kind) {
    case 'extracted':
      return outcome.zoneName ? `über ${outcome.zoneName}` : 'Beute gesichert';
    case 'died':
      return 'Der Riss hat behalten, was du getragen hast.';
    case 'timeout':
      return 'Der Riss schloss sich, bevor du draußen warst.';
  }
}
