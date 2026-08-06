/**
 * Weapon workshop.
 *
 * Shows the equipped weapon's resolved statistics and lets the player fit
 * attachments and repair wear. The important design property: every stat line
 * shows the *delta* a change would cause, so the trade-offs are visible before
 * the player commits rather than discovered mid-raid.
 */

import { attachmentsFor, findAttachment, SLOT_LABELS } from '@/content/attachments';
import { findItem } from '@/content/items';
import { weaponForItem } from '@/content/weapons';
import type { AttachmentSlot } from '@/content/types';
import { availableAttachments, repairCeiling, repairCost } from '@/game/base/workshop';
import type { PlayerProfile } from '@/game/base/profile';
import { resolveWeapon, type ResolvedWeapon } from '@/game/weapons/weaponStats';
import { bar, el, formatCredits, statRow } from '@/ui/components/dom';
import type { Screen } from '@/ui/uiRoot';
import { t, tf } from '@/core/i18n/i18n';

export interface WorkshopCallbacks {
  onBack(): void;
  onFit(slot: AttachmentSlot, attachmentId: string | null): void;
  onRepair(): void;
}

export function createWorkshopScreen(
  profile: PlayerProfile,
  callbacks: WorkshopCallbacks,
): Screen {
  const weaponItemId = profile.loadout.weaponItemId;
  const weapon = weaponItemId ? weaponForItem(weaponItemId) : undefined;

  const content = el('div', { className: 'grow', style: { overflowY: 'auto' } });

  if (!weapon) {
    content.appendChild(
      el('div', {
        className: 'panel',
        children: [el('div', { className: 'muted', text: t('Keine Waffe ausgerüstet.') })],
      }),
    );
  } else {
    const resolved = resolveWeapon(
      weapon.id,
      profile.loadout.attachments,
      profile.loadout.preferredAmmoItemId,
      profile.loadout.weaponCondition,
    );
    if (resolved) {
      content.appendChild(statsPanel(weapon.name, resolved));
      content.appendChild(conditionPanel(profile, callbacks));
      for (const slot of weapon.slots) {
        content.appendChild(slotPanel(profile, weapon.id, slot, resolved, callbacks));
      }
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
              el('h1', { className: 'title', text: t('Werkstatt') }),
              el('div', { className: 'subtitle', text: weapon?.name ?? 'ohne Waffe' }),
            ],
          }),
          el('button', { className: 'btn btn--ghost', text: t('Zurück'), onClick: () => callbacks.onBack() }),
        ],
      }),
      content,
    ],
  });

  return { root };
}

function statsPanel(name: string, resolved: ResolvedWeapon): HTMLElement {
  return el('div', {
    className: 'panel',
    children: [
      el('div', { className: 'panel__title', text: name }),
      statRow(t('Schaden'), `${resolved.damage.toFixed(1)} × ${resolved.pellets}`),
      statRow(t('Durchschlag'), resolved.penetration.toFixed(0)),
      statRow(t('Magazin'), String(resolved.magazineSize)),
      statRow(t('Streuung'), `${resolved.spreadDeg.toFixed(2)}°`),
      statRow(t('Reichweite'), `${resolved.effectiveRange.toFixed(0)} / ${resolved.maxRange.toFixed(0)} m`),
      statRow(t('Nachladen'), `${resolved.reloadSeconds.toFixed(2)} s`),
      statRow(t('Lärmradius'), `${resolved.noiseRadius.toFixed(0)} m`),
      statRow(t('Ergonomie'), resolved.ergonomics.toFixed(0)),
      statRow(
        'Ladehemmung',
        resolved.jamChance <= 0 ? 'keine' : `${(resolved.jamChance * 100).toFixed(1)} % pro Schuss`,
      ),
    ],
  });
}

function conditionPanel(profile: PlayerProfile, callbacks: WorkshopCallbacks): HTMLElement {
  const condition = profile.loadout.weaponCondition;
  const ceiling = repairCeiling(profile);
  const cost = repairCost(profile);

  const conditionBar = bar('weight');
  conditionBar.set(condition);
  conditionBar.setClass('is-heavy', condition < 0.55);
  conditionBar.setClass('is-over', condition < 0.3);

  const repairButton = el('button', {
    className: 'btn btn--block',
    text: cost > 0 ? `Instandsetzen · ${formatCredits(cost)}` : 'Instandsetzen',
    onClick: () => callbacks.onRepair(),
  });
  repairButton.disabled = condition >= ceiling - 0.001 || profile.credits < cost;

  return el('div', {
    className: 'panel',
    children: [
      el('div', { className: 'panel__title', text: t('Zustand') }),
      el('div', {
        className: 'row',
        children: [
          el('div', { className: 'grow', children: [conditionBar.root] }),
          el('div', { className: 'mono muted', text: `${Math.round(condition * 100)} %` }),
        ],
      }),
      el('div', {
        className: 'muted',
        style: { marginTop: 'var(--space-2)' },
        // The permanent ceiling is the point of the mechanic, so it is stated
        // plainly rather than discovered.
        text: tf('Jede Instandsetzung senkt den erreichbaren Höchstzustand. Aktuell maximal {percent} %.', {
          percent: Math.round(ceiling * 100),
        }),
      }),
      repairButton,
    ],
  });
}

function slotPanel(
  profile: PlayerProfile,
  weaponId: string,
  slot: AttachmentSlot,
  current: ResolvedWeapon,
  callbacks: WorkshopCallbacks,
): HTMLElement {
  const fittedId = profile.loadout.attachments[slot] ?? null;
  const owned = availableAttachments(profile, slot);
  const list = el('div', { className: 'item-list' });

  list.appendChild(
    el('div', {
      className: `item${fittedId === null ? ' item--selected' : ''}`,
      onClick: () => callbacks.onFit(slot, null),
      children: [el('div', { className: 'item__name muted', text: t('— leer —') })],
    }),
  );

  // The fitted part is listed even though it is no longer in the stash.
  const entries = [...owned];
  if (fittedId && !entries.some((entry) => entry.attachmentId === fittedId)) {
    const def = findAttachment(fittedId);
    if (def) entries.unshift({ attachmentId: def.id, itemId: def.itemId, name: def.name });
  }

  for (const entry of entries) {
    list.appendChild(
      el('div', {
        className: `item${fittedId === entry.attachmentId ? ' item--selected' : ''}`,
        data: { rarity: findItem(entry.itemId)?.rarity ?? 'common' },
        onClick: () => callbacks.onFit(slot, entry.attachmentId),
        children: [
          el('div', {
            className: 'grow',
            children: [
              el('div', { className: 'item__name', text: entry.name }),
              el('div', { className: 'item__meta', text: describeDelta(profile, weaponId, slot, entry.attachmentId, current) }),
            ],
          }),
        ],
      }),
    );
  }

  if (entries.length === 0) {
    list.appendChild(
      el('div', { className: 'muted', text: t('Keine passenden Teile im Lager.') }),
    );
  }

  return el('div', {
    className: 'panel',
    children: [el('div', { className: 'panel__title', text: SLOT_LABELS[slot] }), list],
  });
}

/**
 * Describe what fitting this attachment would change, relative to the current
 * configuration. Showing deltas rather than absolutes is what makes the
 * trade-offs legible without a spreadsheet.
 */
function describeDelta(
  profile: PlayerProfile,
  weaponId: string,
  slot: AttachmentSlot,
  attachmentId: string,
  current: ResolvedWeapon,
): string {
  const candidate = resolveWeapon(
    weaponId,
    { ...profile.loadout.attachments, [slot]: attachmentId },
    profile.loadout.preferredAmmoItemId,
    profile.loadout.weaponCondition,
  );
  if (!candidate) return '';

  const parts: string[] = [];
  push(parts, 'Streuung', current.spreadDeg, candidate.spreadDeg, true, 2);
  push(parts, 'Reichweite', current.effectiveRange, candidate.effectiveRange, false, 0);
  push(parts, 'Magazin', current.magazineSize, candidate.magazineSize, false, 0);
  push(parts, 'Lärm', current.noiseRadius, candidate.noiseRadius, true, 0);
  push(parts, 'Ergonomie', current.ergonomics, candidate.ergonomics, false, 0);
  push(parts, 'Schaden', current.damage, candidate.damage, false, 1);
  push(parts, 'Nachladen', current.reloadSeconds, candidate.reloadSeconds, true, 2);

  return parts.length > 0 ? parts.join(' · ') : 'keine Änderung';
}

function push(
  parts: string[],
  label: string,
  from: number,
  to: number,
  lowerIsBetter: boolean,
  decimals: number,
): void {
  const delta = to - from;
  if (Math.abs(delta) < Math.pow(10, -decimals) / 2) return;

  const better = lowerIsBetter ? delta < 0 : delta > 0;
  const sign = delta > 0 ? '+' : '';
  parts.push(`${better ? '↑' : '↓'} ${label} ${sign}${delta.toFixed(decimals)}`);
}

/** Slots the given weapon offers, for callers that need the list. */
export function slotsOf(weaponItemId: string | null): readonly AttachmentSlot[] {
  if (!weaponItemId) return [];
  return weaponForItem(weaponItemId)?.slots ?? [];
}

/** Attachments that exist for a weapon slot, regardless of ownership. */
export function catalogueFor(weaponId: string, slot: AttachmentSlot) {
  return attachmentsFor(weaponId, slot);
}
