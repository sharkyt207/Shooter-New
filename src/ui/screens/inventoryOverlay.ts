/**
 * In-raid inventory.
 *
 * A scrolling list with a tap-to-act context menu - never drag and drop
 * (ADR-005). The weight bar is the emotional centre of the screen: it is the
 * thing that forces "what do I leave behind?".
 */

import { findItem } from '@/content/items';
import { mergeHudItems, type HudItem, type HudViewModel } from '@/ui/viewModel';
import { bar, clear, el, formatCredits, formatWeight } from '@/ui/components/dom';
import type { Screen } from '@/ui/uiRoot';

export interface InventoryCallbacks {
  onClose(): void;
  onUse(itemId: string): void;
  onDrop(itemId: string, quantity: number): void;
}

export type SortMode = 'value' | 'weight' | 'name';

export function createInventoryOverlay(
  getViewModel: () => HudViewModel,
  callbacks: InventoryCallbacks,
): Screen {
  let sortMode: SortMode = 'value';
  let selected: string | null = null;

  const list = el('div', { className: 'item-list grow' });
  const weightBar = bar('weight');
  const weightLabel = el('div', { className: 'mono muted' });
  const valueLabel = el('div', { className: 'mono', style: { color: 'var(--color-threat)' } });
  const actions = el('div', { className: 'row', style: { gap: 'var(--space-2)' } });

  function renderActions(): void {
    clear(actions);
    if (!selected) return;

    const def = findItem(selected);
    if (!def) return;

    if (def.consumable) {
      actions.appendChild(
        el('button', {
          className: 'btn btn--primary grow',
          text: 'Benutzen',
          onClick: () => {
            callbacks.onUse(selected as string);
            callbacks.onClose();
          },
        }),
      );
    }

    actions.appendChild(
      el('button', {
        className: 'btn btn--danger grow',
        text: 'Ablegen',
        onClick: () => {
          const item = mergeHudItems(getViewModel().inventory).find((i) => i.itemId === selected);
          callbacks.onDrop(selected as string, item?.quantity ?? 1);
          selected = null;
          render();
        },
      }),
    );
  }

  function render(): void {
    const vm = getViewModel();
    const items = mergeHudItems(vm.inventory).sort(comparator(sortMode));

    clear(list);
    if (items.length === 0) {
      list.appendChild(el('div', { className: 'muted', text: 'Der Rucksack ist leer.' }));
    }

    for (const item of items) {
      list.appendChild(
        el('div', {
          className: `item${selected === item.itemId ? ' item--selected' : ''}`,
          data: { rarity: item.rarity },
          onClick: () => {
            selected = selected === item.itemId ? null : item.itemId;
            render();
          },
          children: [
            el('div', {
              className: 'grow',
              children: [
                el('div', { className: 'item__name', text: item.name }),
                el('div', { className: 'item__meta', text: formatCredits(item.value) }),
              ],
            }),
            el('div', { className: 'item__meta', text: `×${item.quantity}` }),
            el('div', { className: 'item__meta', text: formatWeight(item.weight) }),
          ],
        }),
      );
    }

    const load = vm.capacity > 0 ? vm.weight / vm.capacity : 0;
    weightBar.set(load);
    weightBar.setClass('is-heavy', load >= 0.85 && load < 1);
    weightBar.setClass('is-over', load >= 1);
    weightLabel.textContent = `${formatWeight(vm.weight)} / ${formatWeight(vm.capacity)}`;
    valueLabel.textContent = formatCredits(vm.carriedValue);

    renderActions();
  }

  const sortButtons = el('div', {
    className: 'row',
    style: { gap: 'var(--space-2)' },
    children: (['value', 'weight', 'name'] as SortMode[]).map((mode) =>
      el('button', {
        className: 'btn btn--ghost grow',
        text: mode === 'value' ? 'Wert' : mode === 'weight' ? 'Gewicht' : 'Name',
        style: { minHeight: '36px', fontSize: '0.78rem' },
        onClick: () => {
          sortMode = mode;
          render();
        },
      }),
    ),
  });

  const root = el('div', {
    className: 'screen screen--overlay',
    children: [
      el('div', {
        className: 'screen__header',
        children: [
          el('div', {
            children: [
              el('h1', { className: 'title', text: 'Rucksack' }),
              el('div', { className: 'subtitle', text: 'Beutewert' }),
              valueLabel,
            ],
          }),
          el('button', {
            className: 'btn btn--ghost',
            text: 'Schließen',
            onClick: () => callbacks.onClose(),
          }),
        ],
      }),
      el('div', {
        className: 'row',
        children: [el('div', { className: 'grow', children: [weightBar.root] }), weightLabel],
      }),
      el('div', { style: { height: 'var(--space-3)' } }),
      sortButtons,
      el('div', { style: { height: 'var(--space-2)' } }),
      list,
      el('div', { style: { height: 'var(--space-2)' } }),
      actions,
    ],
  });

  render();

  return { root };
}

function comparator(mode: SortMode): (a: HudItem, b: HudItem) => number {
  switch (mode) {
    case 'value':
      return (a, b) => b.value - a.value;
    case 'weight':
      return (a, b) => b.weight - a.weight;
    case 'name':
      return (a, b) => a.name.localeCompare(b.name);
  }
}
