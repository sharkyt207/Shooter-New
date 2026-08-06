/**
 * The operations base.
 *
 * Everything between raids happens here: the stash, the workbench, the trader
 * and the base upgrades. This is where a raid's outcome turns into lasting
 * progress - the counterweight that makes the risk worth taking (Pillar P5).
 */

import { findBaseModule } from '@/content/baseModules';
import { totalWeight } from '@/game/inventory/inventory';
import {
  levelFromXp,
  levelProgress,
  moduleLevel,
  nextUpgradeCost,
  type PlayerProfile,
} from '@/game/base/profile';
import { availableRecipes } from '@/game/crafting/crafting';
import { buyPriceOf, sellPriceOf, TRADER_STOCK } from '@/game/economy/trader';
import { mergeHudItems, toHudItems, type HudItem } from '@/ui/viewModel';
import { bar, clear, el, formatCredits, formatWeight } from '@/ui/components/dom';
import type { Screen } from '@/ui/uiRoot';

export interface BaseCallbacks {
  onStartLoadout(): void;
  onUpgrade(moduleId: string): void;
  onSell(itemId: string, quantity: number): void;
  onBuy(itemId: string, quantity: number): void;
  onCraft(recipeId: string): void;
}

type Tab = 'stash' | 'trader' | 'workbench' | 'modules';

export function createBaseScreen(profile: PlayerProfile, callbacks: BaseCallbacks): Screen {
  let activeTab: Tab = 'stash';

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
    ['stash', 'Lager'],
    ['trader', 'Händler'],
    ['workbench', 'Werkbank'],
    ['modules', 'Basis'],
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
    creditsLabel.textContent = formatCredits(profile.credits);
    xpBar.set(levelProgress(profile.xp));
    clear(content);

    switch (activeTab) {
      case 'stash':
        content.appendChild(renderStash(profile));
        break;
      case 'trader':
        content.appendChild(renderTrader(profile, callbacks));
        break;
      case 'workbench':
        content.appendChild(renderWorkbench(profile, callbacks));
        break;
      case 'modules':
        content.appendChild(renderModules(profile, callbacks));
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
              el('h1', { className: 'title', text: 'Basis' }),
              el('div', {
                className: 'subtitle',
                text: `Stufe ${levelFromXp(profile.xp)}`,
              }),
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
        text: 'Ausrüstung wählen',
        onClick: () => callbacks.onStartLoadout(),
      }),
    ],
  });

  setTab('stash');

  return {
    root,
    // The screen is re-rendered by the state machine after every mutation, so
    // there is no polling here.
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────────────────────

function renderStash(profile: PlayerProfile): HTMLElement {
  const items = mergeHudItems(toHudItems(profile.stash.slots)).sort((a, b) => b.value - a.value);
  const weight = totalWeight(profile.stash);

  const list = el('div', { className: 'item-list' });
  if (items.length === 0) {
    list.appendChild(el('div', { className: 'muted', text: 'Das Lager ist leer.' }));
  }
  for (const item of items) list.appendChild(itemRow(item));

  return el('div', {
    className: 'panel',
    children: [
      el('div', {
        className: 'row row--between',
        children: [
          el('div', { className: 'panel__title', text: 'Lager' }),
          el('div', {
            className: 'muted mono',
            text: `${formatWeight(weight)} / ${formatWeight(profile.stash.capacityKg)}`,
          }),
        ],
      }),
      list,
    ],
  });
}

function renderTrader(profile: PlayerProfile, callbacks: BaseCallbacks): HTMLElement {
  const owned = mergeHudItems(toHudItems(profile.stash.slots)).filter(
    (item) => item.category !== 'weapon' || item.quantity > 1,
  );

  const sellList = el('div', { className: 'item-list' });
  for (const item of owned) {
    sellList.appendChild(
      tradeRow(
        item.name,
        `${item.quantity}× · ${formatCredits(sellPriceOf(profile, item.itemId))}`,
        'Verkaufen',
        item.rarity,
        () => callbacks.onSell(item.itemId, 1),
      ),
    );
  }
  if (owned.length === 0) {
    sellList.appendChild(el('div', { className: 'muted', text: 'Nichts zu verkaufen.' }));
  }

  const buyList = el('div', { className: 'item-list' });
  for (const stock of TRADER_STOCK) {
    const price = buyPriceOf(profile, stock.itemId);
    const items = toHudItems([stock]);
    const item = items[0];
    if (!item) continue;
    buyList.appendChild(
      tradeRow(
        item.name,
        formatCredits(price),
        'Kaufen',
        item.rarity,
        () => callbacks.onBuy(stock.itemId, quantityStep(item)),
        profile.credits < price,
      ),
    );
  }

  return el('div', {
    children: [
      el('div', {
        className: 'panel',
        children: [el('div', { className: 'panel__title', text: 'Verkaufen' }), sellList],
      }),
      el('div', {
        className: 'panel',
        children: [el('div', { className: 'panel__title', text: 'Angebot' }), buyList],
      }),
    ],
  });
}

function renderWorkbench(profile: PlayerProfile, callbacks: BaseCallbacks): HTMLElement {
  const recipes = availableRecipes(profile);
  const list = el('div', { className: 'item-list' });

  if (recipes.length === 0) {
    list.appendChild(
      el('div', { className: 'muted', text: 'Keine Rezepte verfügbar. Werkbank ausbauen.' }),
    );
  }

  for (const recipe of recipes) {
    const inputs = recipe.inputs.map((input) => `${input.quantity}× ${input.itemId.replace('itm_', '')}`).join(' + ');
    list.appendChild(
      tradeRow(recipe.name, inputs, 'Bauen', 'common', () => callbacks.onCraft(recipe.id)),
    );
  }

  return el('div', {
    className: 'panel',
    children: [el('div', { className: 'panel__title', text: 'Werkbank' }), list],
  });
}

function renderModules(profile: PlayerProfile, callbacks: BaseCallbacks): HTMLElement {
  const grid = el('div', { className: 'base__grid' });

  for (const moduleId of ['base_stash', 'base_workbench', 'base_trader', 'base_medical', 'base_research']) {
    const def = findBaseModule(moduleId);
    if (!def) continue;

    const level = moduleLevel(profile, moduleId);
    const cost = nextUpgradeCost(profile, moduleId);
    const next = def.levels.find((entry) => entry.level === level + 1);

    grid.appendChild(
      el('button', {
        className: `module${level === 0 ? ' module--locked' : ''}`,
        onClick: () => callbacks.onUpgrade(moduleId),
        children: [
          el('div', { className: 'module__name', text: def.name }),
          el('div', {
            className: 'module__level',
            text: level === 0 ? 'Nicht gebaut' : `Stufe ${level}`,
          }),
          el('div', { className: 'muted', text: next?.unlocks ?? 'Maximale Stufe' }),
          el('div', {
            className: 'mono',
            style: { color: cost === null ? 'var(--text-muted)' : 'var(--color-threat)' },
            text: cost === null ? '—' : formatCredits(cost),
          }),
        ],
      }),
    );
  }

  return el('div', {
    className: 'panel',
    children: [el('div', { className: 'panel__title', text: 'Ausbau' }), grid],
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
