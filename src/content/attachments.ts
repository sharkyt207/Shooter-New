/**
 * Weapon attachments.
 *
 * Every attachment is a real trade-off - none is a straight upgrade. A longer
 * barrel costs weight and handling; a suppressor costs muzzle velocity and
 * damage; an extended magazine costs reload time. That is what makes fitting
 * out a weapon a decision instead of a checklist.
 *
 * Multipliers default to 1 and additions to 0, so a modifier block only lists
 * what it actually changes.
 */

import type { AttachmentDef, AttachmentSlot } from './types';

export const ATTACHMENTS = {
  att_barrel_long: {
    id: 'att_barrel_long',
    itemId: 'itm_att_barrel_long',
    name: 'Langlauf VK',
    slot: 'barrel',
    compatibleWeapons: ['wpn_splitter', 'wpn_nadel', 'wpn_bruch'],
    modifiers: {
      spreadDegMult: 0.78,
      effectiveRangeAdd: 6,
      maxRangeAdd: 8,
      projectileSpeedMult: 1.18,
      // Long barrels are muzzle-heavy: better shooting, worse handling.
      ergonomicsAdd: -12,
      weightAdd: 0.9,
    },
  },

  att_sight_reflex: {
    id: 'att_sight_reflex',
    itemId: 'itm_att_sight_reflex',
    name: 'Reflexvisier',
    slot: 'sight',
    compatibleWeapons: [],
    modifiers: {
      spreadDegMult: 0.85,
      ergonomicsAdd: 8,
      weightAdd: 0.25,
    },
  },

  att_mag_extended: {
    id: 'att_mag_extended',
    itemId: 'itm_att_mag_extended',
    name: 'Erweitertes Magazin',
    slot: 'magazine',
    compatibleWeapons: ['wpn_splitter', 'wpn_nadel'],
    modifiers: {
      magazineSizeAdd: 12,
      reloadSecondsMult: 1.25,
      ergonomicsAdd: -6,
      weightAdd: 0.35,
    },
  },

  att_muzzle_suppressor: {
    id: 'att_muzzle_suppressor',
    itemId: 'itm_att_muzzle_suppressor',
    name: 'Schalldämpfer',
    slot: 'muzzle',
    compatibleWeapons: ['wpn_splitter', 'wpn_nadel'],
    modifiers: {
      // Halving the noise radius roughly quarters the area that hears you -
      // by far the strongest tactical effect in the game.
      noiseRadiusMult: 0.45,
      spreadDegMult: 0.92,
      damageMult: 0.94,
      projectileSpeedMult: 0.94,
      ergonomicsAdd: -5,
      weightAdd: 0.6,
    },
  },

  att_muzzle_comp: {
    id: 'att_muzzle_comp',
    itemId: 'itm_att_muzzle_comp',
    name: 'Kompensator',
    slot: 'muzzle',
    compatibleWeapons: ['wpn_splitter', 'wpn_bruch'],
    modifiers: {
      spreadPerShotDegMult: 0.6,
      maxSpreadDegMult: 0.85,
      ergonomicsAdd: 6,
      noiseRadiusMult: 1.1,
      weightAdd: 0.3,
    },
  },
} as const satisfies Record<string, AttachmentDef>;

export type AttachmentId = keyof typeof ATTACHMENTS;

export const ALL_ATTACHMENT_IDS = Object.keys(ATTACHMENTS) as AttachmentId[];

export function getAttachment(id: AttachmentId): AttachmentDef {
  return ATTACHMENTS[id];
}

export function findAttachment(id: string): AttachmentDef | undefined {
  return (ATTACHMENTS as Record<string, AttachmentDef>)[id];
}

/** Reverse lookup: which attachment does this inventory item represent? */
export function attachmentForItem(itemId: string): AttachmentDef | undefined {
  for (const id of ALL_ATTACHMENT_IDS) {
    if (ATTACHMENTS[id].itemId === itemId) return ATTACHMENTS[id];
  }
  return undefined;
}

/** Does this attachment fit that weapon? An empty list means "fits anything". */
export function fitsWeapon(attachment: AttachmentDef, weaponId: string): boolean {
  return attachment.compatibleWeapons.length === 0
    ? true
    : attachment.compatibleWeapons.includes(weaponId);
}

/** Attachments that fit a given weapon and slot. */
export function attachmentsFor(weaponId: string, slot: AttachmentSlot): AttachmentDef[] {
  return ALL_ATTACHMENT_IDS.map((id) => ATTACHMENTS[id]).filter(
    (attachment) => attachment.slot === slot && fitsWeapon(attachment, weaponId),
  );
}

export const SLOT_LABELS: Record<AttachmentSlot, string> = {
  barrel: 'Lauf',
  sight: 'Visier',
  magazine: 'Magazin',
  muzzle: 'Mündung',
};
