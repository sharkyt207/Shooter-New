/**
 * Loadout selection.
 *
 * The most important number on this screen is the risk value: everything the
 * player is about to take into the rift, priced in credits. That figure is what
 * turns "just one more raid" into an actual decision (Pillar P1), so it gets
 * more visual weight than anything else here.
 */

import { findItem } from '@/content/items';
import { weaponForItem } from '@/content/weapons';
import { countItem } from '@/game/inventory/inventory';
import type { PlayerProfile } from '@/game/base/profile';
import { META } from '@/content/balance';
import {
  equippedWeightKg,
  loadoutCapacityKg,
  loadoutValue,
  loadoutWeightKg,
  secureCapacityKg,
} from '@/game/player/loadout';
import { insuranceAvailable, premiumFor, returnMinutes } from '@/game/economy/insurance';
import { mergeHudItems, toHudItems, type HudItem } from '@/ui/viewModel';
import { bar, clear, el, formatCredits, formatWeight } from '@/ui/components/dom';
import type { Screen } from '@/ui/uiRoot';
import { t, tf } from '@/core/i18n/i18n';

export interface LoadoutCallbacks {
  onBack(): void;
  onConfirm(): void;
  /** Equip (or unequip with `null`) a slot; the state machine mutates the profile. */
  onEquip(slot: 'weapon' | 'armor' | 'helmet' | 'backpack', itemId: string | null): void;
  onCarryChange(itemId: string, delta: number): void;
  /** Choose which round to chamber. */
  onSelectAmmo(itemId: string | null): void;
  onOpenWorkshop(): void;
  /** Equip or remove the secure container. */
  onEquipSecure(itemId: string | null): void;
  /** Move an item into or out of the secure container. */
  onSecureChange(itemId: string, delta: number): void;
  /** Buy or cancel insurance for this raid. */
  onToggleInsurance(): void;
}

export function createLoadoutScreen(profile: PlayerProfile, callbacks: LoadoutCallbacks): Screen {
  const content = el('div', { className: 'grow', style: { overflowY: 'auto' } });
  const riskLabel = el('div', { className: 'risk' });
  const weightLabel = el('div', { className: 'muted mono' });
  const weightBar = bar('weight');
  const confirmButton = el('button', {
    className: 'btn btn--go btn--block',
    text: t('Riss betreten'),
    onClick: () => callbacks.onConfirm(),
  });

  function render(): void {
    clear(content);

    const owned = mergeHudItems(toHudItems(profile.stash.slots));

    content.appendChild(
      slotPanel(t('Waffe'), 'weapon', profile.loadout.weaponItemId, owned.filter((i) => i.category === 'weapon'), callbacks),
    );
    const armorItems = owned.filter(
      (i) => i.category === 'armor' && (findItem(i.itemId)?.armor?.coverage ?? []).includes('torso'),
    );
    const helmetItems = owned.filter(
      (i) => i.category === 'armor' && (findItem(i.itemId)?.armor?.coverage ?? []).includes('head'),
    );

    content.appendChild(slotPanel(t('Rüstung'), 'armor', profile.loadout.armorItemId, armorItems, callbacks));
    content.appendChild(slotPanel(t('Helm'), 'helmet', profile.loadout.helmetItemId, helmetItems, callbacks));
    content.appendChild(ammoPanel(profile, owned, callbacks));
    content.appendChild(
      slotPanel(t('Rucksack'), 'backpack', profile.loadout.backpackItemId, owned.filter((i) => i.category === 'backpack'), callbacks),
    );
    content.appendChild(carryPanel(profile, owned, callbacks));
    content.appendChild(
      slotPanel(
        t('Sicherer Behälter'),
        'secure',
        profile.loadout.secureContainerItemId,
        owned.filter((i) => i.category === 'container'),
        callbacks,
      ),
    );
    if (profile.loadout.secureContainerItemId) {
      content.appendChild(securePanel(profile, owned, callbacks));
    }
    content.appendChild(insurancePanel(profile, callbacks));

    const value = loadoutValue(profile.loadout);
    const weight = loadoutWeightKg(profile.loadout);
    const capacity = loadoutCapacityKg(profile.loadout);

    riskLabel.textContent = formatCredits(value);
    // Carried weight fills the backpack; worn gear is listed separately so the
    // player can see what an over-modified weapon actually costs them.
    weightLabel.textContent =
      `${formatWeight(weight)} / ${formatWeight(capacity)}` +
      ` · getragen ${formatWeight(equippedWeightKg(profile.loadout))}`;
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
              el('h1', { className: 'title', text: t('Ausrüstung') }),
              el('div', { className: 'subtitle', text: t('Risiko') }),
              riskLabel,
            ],
          }),
          el('button', { className: 'btn btn--ghost', text: t('Zurück'), onClick: () => callbacks.onBack() }),
        ],
      }),
      el('div', {
        className: 'row',
        children: [el('div', { className: 'grow', children: [weightBar.root] }), weightLabel],
      }),
      el('div', { style: { height: 'var(--space-3)' } }),
      content,
      el('div', { style: { height: 'var(--space-3)' } }),
      el('button', {
        className: 'btn btn--ghost btn--block',
        text: t('Werkstatt öffnen'),
        onClick: () => callbacks.onOpenWorkshop(),
      }),
      el('div', { style: { height: 'var(--space-2)' } }),
      confirmButton,
    ],
  });

  render();

  return { root };
}

/**
 * Ammunition choice.
 *
 * This is the single most consequential decision on the screen since M2: the
 * same weapon behaves completely differently depending on what is chambered,
 * so each option states plainly what it trades away.
 */
function ammoPanel(
  profile: PlayerProfile,
  owned: HudItem[],
  callbacks: LoadoutCallbacks,
): HTMLElement {
  const weapon = profile.loadout.weaponItemId
    ? weaponForItem(profile.loadout.weaponItemId)
    : undefined;

  const list = el('div', { className: 'item-list' });
  if (!weapon) {
    list.appendChild(el('div', { className: 'muted', text: t('Erst eine Waffe wählen.') }));
    return el('div', {
      className: 'panel',
      children: [el('div', { className: 'panel__title', text: t('Munition') }), list],
    });
  }

  const matching = owned.filter((item) => findItem(item.itemId)?.ammo?.caliber === weapon.caliber);
  if (matching.length === 0) {
    list.appendChild(
      el('div', { className: 'muted', text: t('Keine passende Munition im Lager.') }),
    );
  }

  for (const item of matching) {
    const ammo = findItem(item.itemId)?.ammo;
    if (!ammo) continue;
    const selected = profile.loadout.preferredAmmoItemId === item.itemId;

    list.appendChild(
      el('div', {
        className: `item${selected ? ' item--selected' : ''}`,
        data: { rarity: item.rarity },
        onClick: () => callbacks.onSelectAmmo(item.itemId),
        children: [
          el('div', {
            className: 'grow',
            children: [
              el('div', { className: 'item__name', text: item.name }),
              el('div', {
                className: 'item__meta',
                text: `Durchschlag ${ammo.penetration} · Schaden ×${ammo.damageMultiplier.toFixed(2)}${
                  ammo.fragmentation > 0 ? ` · Splitter ${Math.round(ammo.fragmentation * 100)} %` : ''
                }`,
              }),
            ],
          }),
          el('div', { className: 'item__meta', text: `${item.quantity}` }),
        ],
      }),
    );
  }

  return el('div', {
    className: 'panel',
    children: [el('div', { className: 'panel__title', text: t('Munition') }), list],
  });
}

function slotPanel(
  title: string,
  slot: 'weapon' | 'armor' | 'helmet' | 'backpack' | 'secure',
  equippedId: string | null,
  options: HudItem[],
  callbacks: LoadoutCallbacks,
): HTMLElement {
  const equip = (itemId: string | null): void => {
    if (slot === 'secure') callbacks.onEquipSecure(itemId);
    else callbacks.onEquip(slot, itemId);
  };
  const list = el('div', { className: 'item-list' });

  list.appendChild(
    el('div', {
      className: `item${equippedId === null ? ' item--selected' : ''}`,
      onClick: () => equip(null),
      children: [el('div', { className: 'item__name muted', text: t('— nichts —') })],
    }),
  );

  for (const option of options) {
    list.appendChild(
      el('div', {
        className: `item${equippedId === option.itemId ? ' item--selected' : ''}`,
        data: { rarity: option.rarity },
        onClick: () => equip(option.itemId),
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
    list.appendChild(el('div', { className: 'muted', text: t('Nichts zum Mitnehmen im Lager.') }));
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
              el('div', { className: 'item__meta', text: tf('Lager: {count}', { count: available }) }),
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
    children: [el('div', { className: 'panel__title', text: t('Mitnehmen') }), list],
  });
}

/**
 * The secure container's contents.
 *
 * Everything in here comes home whatever happens, which makes this the highest-
 * stakes list on the screen. It gets its own panel and its own weight readout,
 * because the limit is what turns it into a decision rather than a free win.
 */
function securePanel(
  profile: PlayerProfile,
  owned: HudItem[],
  callbacks: LoadoutCallbacks,
): HTMLElement {
  const capacity = secureCapacityKg(profile.loadout);
  const used = profile.loadout.secureItems.reduce(
    (sum, slot) => sum + (findItem(slot.itemId)?.weight ?? 0) * slot.quantity,
    0,
  );

  const list = el('div', { className: 'item-list' });
  const packable = owned.filter((item) => item.category !== 'container');

  if (packable.length === 0) {
    list.appendChild(el('div', { className: 'muted', text: t('Nichts im Lager.') }));
  }

  for (const item of packable) {
    const inside = profile.loadout.secureItems
      .filter((slot) => slot.itemId === item.itemId)
      .reduce((sum, slot) => sum + slot.quantity, 0);
    if (inside === 0 && (findItem(item.itemId)?.weight ?? 0) > capacity - used) continue;

    list.appendChild(
      el('div', {
        className: 'item',
        data: { rarity: item.rarity },
        children: [
          el('div', {
            className: 'grow',
            children: [
              el('div', { className: 'item__name', text: item.name }),
              el('div', { className: 'item__meta', text: formatWeight(findItem(item.itemId)?.weight ?? 0) }),
            ],
          }),
          stepper('−', () => callbacks.onSecureChange(item.itemId, -1)),
          el('div', {
            className: 'item__meta mono',
            style: { minWidth: '2.5rem', textAlign: 'center' },
            text: String(inside),
          }),
          stepper('+', () => callbacks.onSecureChange(item.itemId, 1)),
        ],
      }),
    );
  }

  return el('div', {
    className: 'panel',
    style: { borderColor: 'var(--color-extraction)' },
    children: [
      el('div', {
        className: 'row row--between',
        children: [
          el('div', { className: 'panel__title', text: t('Im sicheren Behälter') }),
          el('div', {
            className: 'muted mono',
            text: `${formatWeight(used)} / ${formatWeight(capacity)}`,
          }),
        ],
      }),
      el('div', { className: 'muted', text: t('Kommt zurück - auch wenn du es nicht tust.') }),
      list,
    ],
  });
}

/**
 * Insurance.
 *
 * Deliberately a single toggle with the price on it. Anything more elaborate
 * would turn a gut decision made in ten seconds into paperwork.
 */
function insurancePanel(profile: PlayerProfile, callbacks: LoadoutCallbacks): HTMLElement {
  if (!insuranceAvailable(profile)) {
    return el('div', {
      className: 'panel',
      children: [
        el('div', { className: 'panel__title', text: t('Versicherung') }),
        el('div', { className: 'muted', text: t('Braucht das Modul Medizin.') }),
      ],
    });
  }

  const premium = premiumFor(profile, profile.loadout);
  const affordable = profile.credits >= premium;
  const active = profile.loadout.insured;

  const button = el('button', {
    className: `btn ${active ? 'btn--primary' : 'btn--ghost'} btn--block`,
    text: active ? `Versichert · ${formatCredits(premium)}` : `Versichern · ${formatCredits(premium)}`,
    onClick: () => callbacks.onToggleInsurance(),
  });
  button.disabled = !active && !affordable;

  return el('div', {
    className: 'panel',
    children: [
      el('div', { className: 'panel__title', text: t('Versicherung') }),
      el('div', {
        className: 'muted',
        text: `Getragene Ausrüstung kommt bei einem Fehlschlag mit ${Math.round(
          META.insuranceReturnChance * 100,
        )} % Wahrscheinlichkeit nach ${returnMinutes(profile)} Minuten zurück. Beute nie.`,
      }),
      el('div', { style: { height: 'var(--space-2)' } }),
      button,
    ],
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
