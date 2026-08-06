/**
 * Resolving a weapon's effective statistics.
 *
 * A weapon's real behaviour is `base definition + attachments + loaded ammo +
 * current wear`. Resolving that in one pure, heavily tested function means the
 * firing code never has to know that attachments exist - it just asks for the
 * numbers it needs.
 *
 * Order of application matters and is fixed:
 *   1. base definition
 *   2. attachment modifiers (multiplicative and additive)
 *   3. ammunition (damage, penetration, speed, pellets, spread)
 *   4. wear (durability erodes accuracy and invites jams)
 */

import { findAttachment, fitsWeapon } from '@/content/attachments';
import { findItem } from '@/content/items';
import { findWeapon } from '@/content/weapons';
import { WEAPON } from '@/content/balance';
import type { AmmoStats, AttachmentLoadout, Caliber, WeaponDef } from '@/content/types';
import { clamp, clamp01 } from '@/core/math/scalar';

export type { AttachmentLoadout };

export interface ResolvedWeapon {
  weaponId: string;
  name: string;
  caliber: Caliber;

  /** Damage per projectile, ammo multiplier already applied. */
  damage: number;
  pellets: number;
  roundsPerMinute: number;
  magazineSize: number;
  spreadDeg: number;
  spreadPerShotDeg: number;
  maxSpreadDeg: number;
  reloadSeconds: number;
  projectileSpeed: number;
  effectiveRange: number;
  maxRange: number;
  minDamageFactor: number;
  noiseRadius: number;
  ergonomics: number;

  /** Ammunition properties, or the calibre's default when nothing is loaded. */
  penetration: number;
  fragmentation: number;
  fragmentationBonus: number;

  /** Extra kilograms from attachments. */
  attachmentWeight: number;
  /** Chance per shot that the weapon jams, derived from wear and ergonomics. */
  jamChance: number;
  zoneBias: { head: number; torso: number; limbs: number };
}

/** Ammo stats used when a weapon fires without a specific round loaded. */
const FALLBACK_AMMO: AmmoStats = {
  caliber: 'cal_9mm',
  damageMultiplier: 1,
  penetration: 15,
  fragmentation: 0.1,
  fragmentationBonus: 0.3,
  speedMultiplier: 1,
};

export function ammoStatsOf(itemId: string | null | undefined): AmmoStats | undefined {
  if (!itemId) return undefined;
  return findItem(itemId)?.ammo;
}

/**
 * Resolve the effective statistics of a weapon.
 *
 * @param durabilityFraction 1 = pristine, 0 = worn out.
 */
export function resolveWeapon(
  weaponId: string,
  attachments: AttachmentLoadout = {},
  loadedAmmoItemId: string | null = null,
  durabilityFraction = 1,
): ResolvedWeapon | undefined {
  const def = findWeapon(weaponId);
  if (!def) return undefined;
  return resolveFromDef(def, attachments, loadedAmmoItemId, durabilityFraction);
}

function resolveFromDef(
  def: WeaponDef,
  attachments: AttachmentLoadout,
  loadedAmmoItemId: string | null,
  durabilityFraction: number,
): ResolvedWeapon {
  // ── 1. Base ──────────────────────────────────────────────────────────────
  let damage = def.damage;
  let pellets = def.pellets;
  let magazineSize = def.magazineSize;
  let spreadDeg = def.spreadDeg;
  let spreadPerShotDeg = def.spreadPerShotDeg;
  let maxSpreadDeg = def.maxSpreadDeg;
  let reloadSeconds = def.reloadSeconds;
  let projectileSpeed = def.projectileSpeed;
  let effectiveRange = def.effectiveRange;
  let maxRange = def.maxRange;
  let noiseRadius = def.noiseRadius;
  let ergonomics = def.ergonomics;
  let attachmentWeight = 0;

  // ── 2. Attachments ───────────────────────────────────────────────────────
  for (const slot of def.slots) {
    const id = attachments[slot];
    if (!id) continue;

    const attachment = findAttachment(id);
    // Silently ignore an attachment that does not belong here: save data can
    // outlive a content change, and that must never break a raid.
    if (!attachment || attachment.slot !== slot || !fitsWeapon(attachment, def.id)) continue;

    const m = attachment.modifiers;
    if (m.damageMult !== undefined) damage *= m.damageMult;
    if (m.magazineSizeAdd !== undefined) magazineSize += m.magazineSizeAdd;
    if (m.spreadDegMult !== undefined) spreadDeg *= m.spreadDegMult;
    if (m.spreadPerShotDegMult !== undefined) spreadPerShotDeg *= m.spreadPerShotDegMult;
    if (m.maxSpreadDegMult !== undefined) maxSpreadDeg *= m.maxSpreadDegMult;
    if (m.reloadSecondsMult !== undefined) reloadSeconds *= m.reloadSecondsMult;
    if (m.projectileSpeedMult !== undefined) projectileSpeed *= m.projectileSpeedMult;
    if (m.effectiveRangeAdd !== undefined) effectiveRange += m.effectiveRangeAdd;
    if (m.maxRangeAdd !== undefined) maxRange += m.maxRangeAdd;
    if (m.noiseRadiusMult !== undefined) noiseRadius *= m.noiseRadiusMult;
    if (m.ergonomicsAdd !== undefined) ergonomics += m.ergonomicsAdd;
    if (m.weightAdd !== undefined) attachmentWeight += m.weightAdd;
  }

  // ── 3. Ammunition ────────────────────────────────────────────────────────
  const ammo = ammoStatsOf(loadedAmmoItemId) ?? ammoStatsOf(def.defaultAmmoItemId) ?? FALLBACK_AMMO;
  damage *= ammo.damageMultiplier;
  projectileSpeed *= ammo.speedMultiplier;
  if (ammo.pelletsOverride !== undefined) pellets = ammo.pelletsOverride;
  if (ammo.spreadMultiplier !== undefined) {
    spreadDeg *= ammo.spreadMultiplier;
    maxSpreadDeg *= ammo.spreadMultiplier;
  }

  // ── 4. Wear ──────────────────────────────────────────────────────────────
  // A worn weapon shoots wider and jams more. The accuracy penalty stays mild;
  // the jam is the part the player actually feels.
  const wear = 1 - clamp01(durabilityFraction);
  spreadDeg *= 1 + wear * WEAPON.wearSpreadPenalty;
  maxSpreadDeg *= 1 + wear * WEAPON.wearSpreadPenalty;

  ergonomics = clamp(ergonomics, 5, 100);
  const jamChance = jamChanceFor(wear, ergonomics);

  return {
    weaponId: def.id,
    name: def.name,
    caliber: def.caliber,
    damage,
    pellets,
    roundsPerMinute: def.roundsPerMinute,
    magazineSize: Math.max(1, Math.round(magazineSize)),
    spreadDeg: Math.max(0, spreadDeg),
    spreadPerShotDeg: Math.max(0, spreadPerShotDeg),
    maxSpreadDeg: Math.max(spreadDeg, maxSpreadDeg),
    reloadSeconds: Math.max(0.2, reloadSeconds),
    projectileSpeed: Math.max(5, projectileSpeed),
    effectiveRange: Math.max(1, effectiveRange),
    maxRange: Math.max(effectiveRange + 1, maxRange),
    minDamageFactor: def.minDamageFactor,
    noiseRadius: Math.max(1, noiseRadius),
    ergonomics,
    penetration: ammo.penetration,
    fragmentation: ammo.fragmentation,
    fragmentationBonus: ammo.fragmentationBonus,
    attachmentWeight,
    jamChance,
    zoneBias: def.zoneBias,
  };
}

/**
 * Jam probability per shot.
 *
 * Zero until the weapon passes the wear threshold, then rising steeply. Good
 * ergonomics buys a meaningful buffer. The threshold matters: a weapon that can
 * jam at any moment is just noise, one that jams only when neglected teaches
 * the player to maintain it.
 */
export function jamChanceFor(wear: number, ergonomics: number): number {
  if (wear <= WEAPON.jamWearThreshold) return 0;
  const over = (wear - WEAPON.jamWearThreshold) / (1 - WEAPON.jamWearThreshold);
  const ergoFactor = 1 - (clamp(ergonomics, 0, 100) / 100) * WEAPON.jamErgonomicsRelief;
  return clamp01(over * over * WEAPON.jamChanceAtRuin * ergoFactor);
}

/**
 * Spread recovery per second, derived from ergonomics.
 * A handy weapon settles far faster between bursts.
 */
export function bloomRecoveryPerSecond(ergonomics: number): number {
  const t = clamp(ergonomics, 0, 100) / 100;
  return WEAPON.bloomRecoveryMin + (WEAPON.bloomRecoveryMax - WEAPON.bloomRecoveryMin) * t;
}

/** Total weight of a weapon including its fitted attachments. */
export function weaponLoadoutWeight(weaponItemId: string, attachments: AttachmentLoadout): number {
  const base = findItem(weaponItemId)?.weight ?? 0;
  let extra = 0;
  for (const id of Object.values(attachments)) {
    if (!id) continue;
    extra += findAttachment(id)?.modifiers.weightAdd ?? 0;
  }
  return base + extra;
}
