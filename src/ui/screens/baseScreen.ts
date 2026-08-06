/**
 * The operations base.
 *
 * Everything between raids happens here: the stash, the traders, the workbench
 * and the base itself. This is where a raid's outcome turns into lasting
 * progress — the counterweight that makes the risk worth taking (Pillar P5).
 *
 * The screen shows time. Builds and crafts run on wall-clock timers that keep
 * ticking during a raid, so every panel takes `now` and the state machine
 * re-renders it on a slow tick. Nothing here polls the profile; it is handed a
 * snapshot and draws it.
 */

import { findBaseModule, ALL_BASE_MODULE_IDS } from '@/content/baseModules';
import { QUEST_LINE_NAME } from '@/content/quests';
import { findTrader } from '@/content/traders';
import { totalWeight } from '@/game/inventory/inventory';
import {
  buildJobFor,
  buildProgress,
  nextLevelOf,
  secondsRemaining,
  unmetRequirements,
} from '@/game/base/buildQueue';
import {
  levelFromXp,
  levelProgress,
  moduleLevel,
  type PlayerProfile,
} from '@/game/base/profile';
import { currentStage, questFinished, stageProgress } from '@/game/base/questLine';
import {
  availableRecipes,
  craftProgress,
  craftSlots,
  failureChanceFor,
  hasInputs,
} from '@/game/crafting/craftQueue';
import { canComplete, contractProgress, offeredContracts } from '@/game/economy/contracts';
import { pointsToNextTier, tierOf, unlockedTraderIds } from '@/game/economy/reputation';
import { buyPriceOf, lockedStockFor, refusesItem, sellPriceOf, stockFor } from '@/game/economy/trader';
import { mergeHudItems, toHudItems, type HudItem } from '@/ui/viewModel';
import { bar, clear, el, formatCredits, formatWeight } from '@/ui/components/dom';
import type { Screen } from '@/ui/uiRoot';
import { t, tf } from '@/core/i18n/i18n';

export interface BaseCallbacks {
  onStartLoadout(): void;
  onUpgrade(moduleId: string): void;
  onSell(itemId: string, quantity: number, traderId: string): void;
  onBuy(itemId: string, quantity: number, traderId: string): void;
  onCraft(recipeId: string): void;
  onCompleteContract(templateId: string): void;
  /** Epoch milliseconds. The UI layer owns the clock, the simulation does not. */
  now(): number;
}

type Tab = 'stash' | 'trader' | 'workbench' | 'modules';

export function createBaseScreen(profile: PlayerProfile, callbacks: BaseCallbacks): Screen {
  let activeTab: Tab = 'stash';
  let activeTrader = unlockedTraderIds(profile)[0] ?? 'trd_quartermaster';

  const content = el('div', { className: 'grow', style: { overflowY: 'auto' } });
  const creditsLabel = el('div', { className: 'mono', text: formatCredits(profile.credits) });
  const xpBar = bar('stamina');

  const tabs = el('div', { className: 'row', style: { gap: 'var(--space-2)' } });

  const setTab = (tab: Tab): void => {
    activeTab = tab;
    for (const child of Array.from(tabs.children)) {
      const button = child as HTMLElement;
      button.classList.toggle('btn--primary', button.dataset['tab'] === tab);
      button.classList.toggle('btn--ghost', button.dataset['tab'] !== tab);
    }
    render();
  };

  for (const [tab, label] of [
    ['stash', t('Lager')],
    ['trader', t('Handel')],
    ['workbench', t('Werkbank')],
    ['modules', t('Basis')],
  ] as Array<[Tab, string]>) {
    tabs.appendChild(
      el('button', {
        className: 'btn btn--ghost grow',
        text: label,
        data: { tab },
        onClick: () => setTab(tab),
      }),
    );
  }

  function render(): void {
    const now = callbacks.now();
    creditsLabel.textContent = formatCredits(profile.credits);
    xpBar.set(levelProgress(profile.xp));
    clear(content);

    switch (activeTab) {
      case 'stash':
        content.appendChild(renderQuest(profile));
        content.appendChild(renderStash(profile));
        break;
      case 'trader':
        content.appendChild(
          renderTraders(profile, activeTrader, callbacks, (id) => {
            activeTrader = id;
            render();
          }),
        );
        break;
      case 'workbench':
        content.appendChild(renderWorkbench(profile, callbacks, now));
        break;
      case 'modules':
        content.appendChild(renderModules(profile, callbacks, now));
        break;
    }
  }

  const root = el('div', {
    className: 'screen',
    children: [
      el('div', {
        className: 'screen__header',
        children: [
          el('div', {
            children: [
              el('h1', { className: 'title', text: t('Basis') }),
              el('div', { className: 'subtitle', text: tf('Stufe {level}', { level: levelFromXp(profile.xp) }) }),
            ],
          }),
          creditsLabel,
        ],
      }),
      xpBar.root,
      el('div', { style: { height: 'var(--space-3)' } }),
      tabs,
      el('div', { style: { height: 'var(--space-3)' } }),
      content,
      el('div', { style: { height: 'var(--space-3)' } }),
      el('button', {
        className: 'btn btn--go btn--block',
        text: t('Ausrüstung wählen'),
        onClick: () => callbacks.onStartLoadout(),
      }),
    ],
  });

  setTab('stash');

  /**
   * Redraw only when a timer on screen would actually change.
   *
   * The base screen rebuilds its DOM, so redrawing every frame would be both
   * wasteful and visibly wrong - it would reset the scroll position sixty times
   * a second. A whole second, and only while something is running.
   */
  let lastSecond = -1;
  const update = (): void => {
    if (profile.builds.length === 0 && profile.crafts.length === 0) return;
    const second = Math.floor(callbacks.now() / 1000);
    if (second === lastSecond) return;
    lastSecond = second;

    const scroll = content.scrollTop;
    render();
    content.scrollTop = scroll;
  };

  return { root, update };
}

// ─────────────────────────────────────────────────────────────────────────────
// Quest line
// ─────────────────────────────────────────────────────────────────────────────

function renderQuest(profile: PlayerProfile): HTMLElement {
  const stage = currentStage(profile);

  if (!stage || questFinished(profile)) {
    return el('div', {
      className: 'panel',
      children: [
        el('div', { className: 'panel__title', text: t(QUEST_LINE_NAME) }),
        el('div', { className: 'muted', text: t('Die Karte ist vollständig. Vorerst.') }),
      ],
    });
  }

  const progress = bar('extraction');
  progress.set(stageProgress(profile));

  return el('div', {
    className: 'panel',
    style: { borderColor: 'var(--color-echo)' },
    children: [
      el('div', { className: 'panel__title', text: t(QUEST_LINE_NAME) }),
      el('div', { className: 'item__name', text: t(stage.name) }),
      el('div', { className: 'muted', text: t(stage.description) }),
      el('div', { style: { height: 'var(--space-2)' } }),
      progress.root,
      el('div', {
        className: 'row row--between',
        children: [
          el('div', {
            className: 'muted mono',
            text: `${formatGoal(profile.quest.progress)} / ${formatGoal(stage.goal.target)}`,
          }),
          el('div', {
            className: 'mono',
            style: { color: 'var(--color-threat)' },
            text: formatCredits(stage.rewardCredits),
          }),
        ],
      }),
    ],
  });
}

function formatGoal(value: number): string {
  return value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(Math.floor(value));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────────────────────

function renderStash(profile: PlayerProfile): HTMLElement {
  const items = mergeHudItems(toHudItems(profile.stash.slots)).sort((a, b) => b.value - a.value);
  const weight = totalWeight(profile.stash);

  const list = el('div', { className: 'item-list' });
  if (items.length === 0) {
    list.appendChild(el('div', { className: 'muted', text: t('Das Lager ist leer.') }));
  }
  for (const item of items) list.appendChild(itemRow(item));

  const children: HTMLElement[] = [
    el('div', {
      className: 'row row--between',
      children: [
        el('div', { className: 'panel__title', text: t('Lager') }),
        el('div', {
          className: 'muted mono',
          text: `${formatWeight(weight)} / ${formatWeight(profile.stash.capacityKg)}`,
        }),
      ],
    }),
    list,
  ];

  // Insured gear on its way back is stash-adjacent information: it is what the
  // player will have next raid, and it stops a loss feeling final.
  if (profile.insuranceReturns.length > 0) {
    children.push(
      el('div', { className: 'panel__title', text: t('Versicherung unterwegs') }),
      el('div', {
        className: 'item-list',
        children: profile.insuranceReturns.map((entry) =>
          el('div', {
            className: 'item',
            children: [
              el('div', { className: 'item__name grow', text: nameOf(entry.itemId) }),
              el('div', { className: 'item__meta', text: `×${entry.quantity}` }),
            ],
          }),
        ),
      }),
    );
  }

  return el('div', { className: 'panel', children });
}

function renderTraders(
  profile: PlayerProfile,
  activeTrader: string,
  callbacks: BaseCallbacks,
  onSelectTrader: (id: string) => void,
): HTMLElement {
  const unlocked = unlockedTraderIds(profile);
  const traderId = unlocked.includes(activeTrader) ? activeTrader : (unlocked[0] as string);
  const def = findTrader(traderId);

  const picker = el('div', { className: 'row', style: { gap: 'var(--space-2)' } });
  for (const id of unlocked) {
    picker.appendChild(
      el('button', {
        className: `btn grow ${id === traderId ? 'btn--primary' : 'btn--ghost'}`,
        text: t(findTrader(id)?.name ?? id),
        onClick: () => onSelectTrader(id),
      }),
    );
  }

  const tier = tierOf(profile, traderId);
  const toNext = pointsToNextTier(profile, traderId);

  const owned = mergeHudItems(toHudItems(profile.stash.slots)).filter(
    (item) => item.category !== 'weapon' || item.quantity > 1,
  );

  const sellList = el('div', { className: 'item-list' });
  const sellable = owned.filter((item) => !refusesItem(traderId, item.itemId));
  for (const item of sellable) {
    sellList.appendChild(
      tradeRow(
        item.name,
        `${item.quantity}× · ${formatCredits(sellPriceOf(profile, item.itemId, traderId))}`,
        t('Verkaufen'),
        item.rarity,
        () => callbacks.onSell(item.itemId, 1, traderId),
      ),
    );
  }
  if (sellable.length === 0) {
    sellList.appendChild(
      el('div', {
        className: 'muted',
        text:
          owned.length === 0
            ? t('Nichts zu verkaufen.')
            : tf('{trader} kauft davon nichts.', { trader: t(def?.name ?? '') }),
      }),
    );
  }

  const buyList = el('div', { className: 'item-list' });
  for (const stock of stockFor(profile, traderId)) {
    const price = buyPriceOf(profile, stock.itemId, traderId);
    const item = toHudItems([stock])[0];
    if (!item) continue;
    buyList.appendChild(
      tradeRow(
        item.name,
        formatCredits(price),
        t('Kaufen'),
        item.rarity,
        () => callbacks.onBuy(stock.itemId, quantityStep(item), traderId),
        profile.credits < price,
      ),
    );
  }
  for (const locked of lockedStockFor(profile, traderId)) {
    buyList.appendChild(
      el('div', {
        className: 'item',
        style: { opacity: '0.45' },
        children: [
          el('div', { className: 'item__name grow', text: nameOf(locked.itemId) }),
          el('div', { className: 'item__meta', text: tf('Ruf {tier}', { tier: locked.tier }) }),
        ],
      }),
    );
  }

  return el('div', {
    children: [
      picker,
      el('div', { style: { height: 'var(--space-3)' } }),
      el('div', {
        className: 'panel',
        children: [
          el('div', { className: 'panel__title', text: t(def?.name ?? 'Händler') }),
          el('div', { className: 'muted', text: t(def?.blurb ?? '') }),
          el('div', {
            className: 'row row--between',
            style: { marginTop: 'var(--space-2)' },
            children: [
              el('div', { className: 'mono', text: tf('Ruf {tier}', { tier }) }),
              el('div', {
                className: 'muted mono',
                text:
                  toNext === null
                    ? t('höchste Stufe')
                    : tf('noch {points}', { points: Math.ceil(toNext) }),
              }),
            ],
          }),
        ],
      }),
      renderContracts(profile, traderId, callbacks),
      el('div', {
        className: 'panel',
        children: [el('div', { className: 'panel__title', text: t('Verkaufen') }), sellList],
      }),
      el('div', {
        className: 'panel',
        children: [el('div', { className: 'panel__title', text: t('Angebot') }), buyList],
      }),
    ],
  });
}

function renderContracts(
  profile: PlayerProfile,
  traderId: string,
  callbacks: BaseCallbacks,
): HTMLElement {
  const offers = offeredContracts(profile).filter(
    (entry) => entry.template.traderId === traderId,
  );
  if (offers.length === 0) {
    return el('div', {
      className: 'panel',
      children: [
        el('div', { className: 'panel__title', text: t('Aufträge') }),
        el('div', { className: 'muted', text: t('Zurzeit nichts zu erledigen.') }),
      ],
    });
  }

  const list = el('div', { className: 'item-list' });
  for (const { active, template } of offers) {
    const progress = contractProgress(profile, template);
    const ready = canComplete(profile, template);
    const detail = progress
      .map((entry) => `${nameOf(entry.itemId)} ${Math.min(entry.have, entry.need)}/${entry.need}`)
      .join(' · ');

    const button = el('button', {
      className: `btn ${ready && !active.completed ? 'btn--primary' : 'btn--ghost'}`,
      text: active.completed ? t('Erledigt') : t('Abgeben'),
      style: { minHeight: '34px', padding: '4px 10px', fontSize: '0.78rem' },
      onClick: () => callbacks.onCompleteContract(template.id),
    });
    button.disabled = active.completed || !ready;

    list.appendChild(
      el('div', {
        className: 'item',
        style: active.completed ? { opacity: '0.5' } : {},
        children: [
          el('div', {
            className: 'grow',
            children: [
              el('div', { className: 'item__name', text: t(template.name) }),
              el('div', { className: 'item__meta', text: detail }),
              el('div', {
                className: 'item__meta',
                style: { color: 'var(--color-threat)' },
                text: `${formatCredits(template.rewardCredits)} · ${template.rewardXp} XP · ${tf('Ruf +{points}', { points: template.rewardReputation })}`,
              }),
            ],
          }),
          button,
        ],
      }),
    );
  }

  return el('div', {
    className: 'panel',
    children: [el('div', { className: 'panel__title', text: t('Aufträge') }), list],
  });
}

function renderWorkbench(
  profile: PlayerProfile,
  callbacks: BaseCallbacks,
  now: number,
): HTMLElement {
  const children: HTMLElement[] = [];

  // Running jobs first: what the base is doing right now outranks what it could
  // be doing.
  const queue = el('div', { className: 'item-list' });
  if (profile.crafts.length === 0) {
    queue.appendChild(el('div', { className: 'muted', text: t('Nichts in Arbeit.') }));
  }
  for (const job of profile.crafts) {
    const progress = bar('context');
    progress.set(craftProgress(job, now));
    queue.appendChild(
      el('div', {
        className: 'item',
        children: [
          el('div', {
            className: 'grow',
            children: [
              el('div', { className: 'item__name', text: recipeNameOf(job.recipeId) }),
              progress.root,
            ],
          }),
          el('div', { className: 'item__meta mono', text: formatDuration(secondsRemaining(job, now)) }),
        ],
      }),
    );
  }

  children.push(
    el('div', {
      className: 'panel',
      children: [
        el('div', {
          className: 'row row--between',
          children: [
            el('div', { className: 'panel__title', text: t('In Arbeit') }),
            el('div', {
              className: 'muted mono',
              text: `${profile.crafts.length} / ${craftSlots(profile)}`,
            }),
          ],
        }),
        queue,
      ],
    }),
  );

  const recipes = availableRecipes(profile);
  const list = el('div', { className: 'item-list' });

  if (recipes.length === 0) {
    list.appendChild(
      el('div', { className: 'muted', text: t('Keine Rezepte verfügbar. Werkbank ausbauen.') }),
    );
  }

  for (const recipe of recipes) {
    const inputs = recipe.inputs
      .map((input) => `${input.quantity}× ${nameOf(input.itemId)}`)
      .join(' + ');
    const risk = failureChanceFor(profile, recipe);
    const meta =
      // "fertig" is right for a running job and wrong for a recipe listing.
      `${inputs} · ${recipe.craftSeconds <= 0 ? 'sofort' : formatDuration(recipe.craftSeconds)}` +
      // A hidden failure chance reads as the game cheating, so it is stated.
      (risk > 0 ? ` · ${Math.round(risk * 100)} % Fehlschlag` : '');

    list.appendChild(
      tradeRow(
        t(recipe.name),
        meta,
        t('Bauen'),
        'common',
        () => callbacks.onCraft(recipe.id),
        !hasInputs(profile, recipe) || profile.crafts.length >= craftSlots(profile),
      ),
    );
  }

  children.push(
    el('div', {
      className: 'panel',
      children: [el('div', { className: 'panel__title', text: t('Werkbank') }), list],
    }),
  );

  return el('div', { children });
}

function renderModules(
  profile: PlayerProfile,
  callbacks: BaseCallbacks,
  now: number,
): HTMLElement {
  const grid = el('div', { className: 'base__grid' });

  for (const moduleId of ALL_BASE_MODULE_IDS) {
    const def = findBaseModule(moduleId);
    if (!def) continue;

    const level = moduleLevel(profile, moduleId);
    const next = nextLevelOf(profile, moduleId);
    const job = buildJobFor(profile, moduleId);
    const missing = next ? unmetRequirements(profile, next) : [];

    const children: HTMLElement[] = [
      el('div', { className: 'module__name', text: t(def.name) }),
      el('div', {
        className: 'module__level',
        text: level === 0 ? t('Nicht gebaut') : tf('Stufe {level}', { level }),
      }),
    ];

    if (job) {
      const progress = bar('context');
      progress.set(buildProgress(job, now));
      children.push(
        el('div', { className: 'muted', text: t('Im Bau') }),
        progress.root,
        el('div', { className: 'mono', text: formatDuration(secondsRemaining(job, now)) }),
      );
    } else if (!next) {
      children.push(
        el('div', { className: 'muted', text: t('Maximale Stufe') }),
        el('div', { className: 'mono', style: { color: 'var(--text-muted)' }, text: '—' }),
      );
    } else if (missing.length > 0) {
      // Say what is missing. "Locked" without a reason is the most frustrating
      // thing a progression screen can do.
      children.push(
        el('div', {
          className: 'muted',
          text: missing
            .map((entry) => tf('{module} Stufe {level}', { module: t(entry.name), level: entry.level }))
            .join(', '),
        }),
        el('div', { className: 'mono', style: { color: 'var(--text-muted)' }, text: t('gesperrt') }),
      );
    } else {
      children.push(
        el('div', { className: 'muted', text: t(next.unlocks) }),
        el('div', {
          className: 'mono',
          style: { color: 'var(--color-threat)' },
          text:
            formatCredits(next.costCredits) +
            (next.buildSeconds ? ` · ${formatDuration(next.buildSeconds)}` : ''),
        }),
      );
    }

    const button = el('button', {
      className: `module${level === 0 ? ' module--locked' : ''}`,
      onClick: () => callbacks.onUpgrade(moduleId),
      children,
    });
    button.disabled =
      job !== undefined || !next || missing.length > 0 || profile.credits < next.costCredits;

    grid.appendChild(button);
  }

  return el('div', {
    className: 'panel',
    children: [el('div', { className: 'panel__title', text: t('Ausbau') }), grid],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Rows
// ─────────────────────────────────────────────────────────────────────────────

function itemRow(item: HudItem): HTMLElement {
  return el('div', {
    className: 'item',
    data: { rarity: item.rarity },
    children: [
      el('div', { className: 'item__name', text: item.name }),
      el('div', { className: 'item__meta', text: `×${item.quantity}` }),
      el('div', { className: 'item__meta', text: formatWeight(item.weight) }),
    ],
  });
}

function tradeRow(
  name: string,
  meta: string,
  action: string,
  rarity: string,
  onAction: () => void,
  disabled = false,
): HTMLElement {
  const button = el('button', {
    className: 'btn btn--ghost',
    text: action,
    style: { minHeight: '34px', padding: '4px 10px', fontSize: '0.78rem' },
    onClick: onAction,
  });
  button.disabled = disabled;

  return el('div', {
    className: 'item',
    data: { rarity },
    children: [
      el('div', {
        className: 'grow',
        children: [
          el('div', { className: 'item__name', text: name }),
          el('div', { className: 'item__meta', text: meta }),
        ],
      }),
      button,
    ],
  });
}

/** Ammunition is bought in useful batches; everything else one at a time. */
function quantityStep(item: HudItem): number {
  return item.category === 'ammo' ? 30 : 1;
}

function nameOf(itemId: string): string {
  return toHudItems([{ itemId, quantity: 1 }])[0]?.name ?? itemId;
}

function recipeNameOf(recipeId: string): string {
  return recipeId.replace('rcp_', '');
}

/** Short, glanceable durations: 45 s, 12 min, 1 h 5 min. */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'fertig';
  if (seconds < 60) return `${Math.ceil(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}
