/**
 * Loadout selection.
 *
 * The most important number on this screen is the risk value: everything the
 * player is about to take into the rift, priced in credits. That figure is what
 * turns "just one more raid" into an actual decision (Pillar P1), so it gets
 * more visual weight than anything else here.
 */

import { findItem } from '@/content/items';
import { countItem } from '@/game/inventory/inventory';
import type { PlayerProfile } from '@/game/base/profile';
import { loadoutCapacityKg, loadoutValue, loadoutWeightKg } from '@/game/player/loadout';
import { mergeHudItems, toHudItems, type HudItem } from '@/ui/viewModel';
import { bar, clear, el, formatCredits, formatWeight } from '@/ui/components/dom';
import type { Screen } from '@/ui/uiRoot';

export interface LoadoutCallbacks {
  onBack(): void;
  onConfirm(): void;
  /** Equip (or unequip with `null`) a slot; the state machine mutates the profile. */
  onEquip(slot: 'weapon' | 'armor' | 'backpack', itemId: string | null): void;
  onCarryChange(itemId: string, delta: number): void;
}

export function createLoadoutScreen(profile: PlayerProfile, callbacks: LoadoutCallbacks): Screen {
  const content = el('div', { className: 'grow', style: { overflowY: 'auto' } });
  const riskLabel = el('div', { className: 'risk' });
  const weightLabel = el('div', { className: 'muted mono' });
  const weightBar = bar('weight');
  const confirmButton = el('button', {
    className: 'btn btn--go btn--block',
    text: 'Riss betreten',
    onClick: () => callbacks.onConfirm(),
  });

  function render(): void {
    clear(content);

    const owned = mergeHudItems(toHudItems(profile.stash.slots));

    content.appendChild(
      slotPanel('Waffe', 'weapon', profile.loadout.weaponItemId, owned.filter((i) => i.category === 'weapon'), callbacks),
    );
    content.appendChild(
      slotPanel('Rüstung', 'armor', profile.loadout.armorItemId, owned.filter((i) => i.category === 'armor'), callbacks),
    );
    content.appendChild(
      slotPanel('Rucksack', 'backpack', profile.loadout.backpackItemId, owned.filter((i) => i.category === 'backpack'), callbacks),
    );
    content.appendChild(carryPanel(profile, owned, callbacks));

    const value = loadoutValue(profile.loadout);
    const weight = loadoutWeightKg(profile.loadout);
    const capacity = loadoutCapacityKg(profile.loadout);

    riskLabel.textContent = formatCredits(value);
    weightLabel.textContent = `${formatWeight(weight)} / ${formatWeight(capacity)}`;
    weightBar.set(capacity > 0 ? weight / capacity : 0);
    weightBar.setClass('is-over', weight > capacity);
    confirmButton.disabled = weight > capacity || profile.loadout.weaponItemId === null;
  }

  const root = el('div', {
    className: 'screen',
    children: [
      el('div', {
        className: 'screen__header',
        children: [
          el('div', {
            children: [
              el('h1', { className: 'title', text: 'Ausrüstung' }),
              el('div', { className: 'subtitle', text: 'Risiko' }),
              riskLabel,
            ],
          }),
          el('button', { className: 'btn btn--ghost', text: 'Zurück', onClick: () => callbacks.onBack() }),
        ],
      }),
      el('div', {
        className: 'row',
        children: [el('div', { className: 'grow', children: [weightBar.root] }), weightLabel],
      }),
      el('div', { style: { height: 'var(--space-3)' } }),
      content,
      el('div', { style: { height: 'var(--space-3)' } }),
      confirmButton,
    ],
  });

  render();

  return { root };
}

function slotPanel(
  title: string,
  slot: 'weapon' | 'armor' | 'backpack',
  equippedId: string | null,
  options: HudItem[],
  callbacks: LoadoutCallbacks,
): HTMLElement {
  const list = el('div', { className: 'item-list' });

  list.appendChild(
    el('div', {
      className: `item${equippedId === null ? ' item--selected' : ''}`,
      onClick: () => callbacks.onEquip(slot, null),
      children: [el('div', { className: 'item__name muted', text: '— nichts —' })],
    }),
  );

  for (const option of options) {
    list.appendChild(
      el('div', {
        className: `item${equippedId === option.itemId ? ' item--selected' : ''}`,
        data: { rarity: option.rarity },
        onClick: () => callbacks.onEquip(slot, option.itemId),
        children: [
          el('div', { className: 'item__name', text: option.name }),
          el('div', { className: 'item__meta', text: describeItem(option.itemId) }),
        ],
      }),
    );
  }

  return el('div', {
    className: 'panel',
    children: [el('div', { className: 'panel__title', text: title }), list],
  });
}

function carryPanel(
  profile: PlayerProfile,
  owned: HudItem[],
  callbacks: LoadoutCallbacks,
): HTMLElement {
  const packable = owned.filter(
    (item) => item.category === 'ammo' || item.category === 'medical' || item.category === 'material',
  );

  const list = el('div', { className: 'item-list' });
  if (packable.length === 0) {
    list.appendChild(el('div', { className: 'muted', text: 'Nichts zum Mitnehmen im Lager.' }));
  }

  for (const item of packable) {
    const packed = profile.loadout.carried
      .filter((slot) => slot.itemId === item.itemId)
      .reduce((sum, slot) => sum + slot.quantity, 0);
    const available = countItem(profile.stash, item.itemId);
    const step = item.category === 'ammo' ? 30 : 1;

    list.appendChild(
      el('div', {
        className: 'item',
        data: { rarity: item.rarity },
        children: [
          el('div', {
            className: 'grow',
            children: [
              el('div', { className: 'item__name', text: item.name }),
              el('div', { className: 'item__meta', text: `Lager: ${available}` }),
            ],
          }),
          stepper('−', () => callbacks.onCarryChange(item.itemId, -step)),
          el('div', { className: 'item__meta mono', style: { minWidth: '2.5rem', textAlign: 'center' }, text: String(packed) }),
          stepper('+', () => callbacks.onCarryChange(item.itemId, step)),
        ],
      }),
    );
  }

  return el('div', {
    className: 'panel',
    children: [el('div', { className: 'panel__title', text: 'Mitnehmen' }), list],
  });
}

function stepper(label: string, onClick: () => void): HTMLElement {
  return el('button', {
    className: 'btn btn--ghost',
    text: label,
    style: { minHeight: '36px', minWidth: '38px', padding: '0' },
    onClick,
  });
}

/** One-line summary of what an item does, for the loadout list. */
function describeItem(itemId: string): string {
  const def = findItem(itemId);
  if (!def) return '';
  if (def.capacityKg) return `${def.capacityKg} kg`;
  if (def.armor) return `${Math.round(def.armor.reduction * 100)} % Schutz`;
  return formatWeight(def.weight);
}
