/**
 * Versioned save data with a migration chain.
 *
 * Rule: a save file is never invalidated by an update. Every old version is
 * migrated forward step by step (v1 -> v2 -> v3 ...). Players who lose their
 * stash to a patch do not come back.
 *
 * The save contains only JSON-safe data - no class instances, no functions.
 * That is a direct consequence of components being plain data (ADR-002).
 */

import { createDefaultProfile, stashCapacityFor, type PlayerProfile } from '@/game/base/profile';
import { compact, createInventory } from '@/game/inventory/inventory';
import { createEmptyLoadout } from '@/game/player/loadout';
import { findItem } from '@/content/items';

export const CURRENT_SAVE_VERSION = 1;

export interface SaveDataV1 {
  version: 1;
  /** Milliseconds since epoch, supplied by the caller (the simulation owns no clock). */
  savedAt: number;
  profile: PlayerProfile;
}

export type SaveData = SaveDataV1;

/** Anything read from storage, before validation. */
type UnknownSave = { version?: unknown; [key: string]: unknown };

export function createSave(profile: PlayerProfile, savedAt: number): SaveData {
  return { version: CURRENT_SAVE_VERSION, savedAt, profile };
}

export function serialize(save: SaveData): string {
  return JSON.stringify(save);
}

export interface LoadResult {
  save: SaveData;
  /** True when the data had to be repaired or migrated. */
  recovered: boolean;
  notes: string[];
}

/**
 * Parse, migrate and validate save data.
 *
 * Never throws: a corrupt save yields a fresh profile plus a note, because
 * crashing on startup is the worst possible failure mode for a mobile game.
 */
export function deserialize(raw: string | null, now: number): LoadResult {
  const notes: string[] = [];

  if (!raw) {
    return { save: createSave(createDefaultProfile(), now), recovered: false, notes };
  }

  let parsed: UnknownSave;
  try {
    parsed = JSON.parse(raw) as UnknownSave;
  } catch {
    notes.push('Speicherstand war beschädigt und wurde zurückgesetzt.');
    return { save: createSave(createDefaultProfile(), now), recovered: true, notes };
  }

  const migrated = migrate(parsed, notes);
  const validated = validateProfile(migrated.profile, notes);

  return {
    save: { version: CURRENT_SAVE_VERSION, savedAt: migrated.savedAt || now, profile: validated },
    recovered: notes.length > 0,
    notes,
  };
}

/**
 * Run the migration chain.
 *
 * Each step upgrades exactly one version. Add a new step when the schema
 * changes; never edit an existing one.
 */
function migrate(data: UnknownSave, notes: string[]): SaveDataV1 {
  let current = data;
  const version = typeof current['version'] === 'number' ? (current['version'] as number) : 0;

  if (version === 0) {
    // v0 = pre-versioning data (or garbage). There is nothing to salvage, but
    // the branch documents the chain and gives future versions a template.
    notes.push('Alter Speicherstand ohne Version erkannt - neues Profil angelegt.');
    current = { version: 1, savedAt: 0, profile: createDefaultProfile() } as UnknownSave;
  }

  if ((current['version'] as number) > CURRENT_SAVE_VERSION) {
    notes.push('Speicherstand stammt aus einer neueren Version und wurde zurückgesetzt.');
    current = { version: 1, savedAt: 0, profile: createDefaultProfile() } as UnknownSave;
  }

  return current as unknown as SaveDataV1;
}

/**
 * Repair a profile so the rest of the game can trust its shape.
 * Unknown items are dropped rather than crashing a screen three menus later.
 */
function validateProfile(input: unknown, notes: string[]): PlayerProfile {
  const fallback = createDefaultProfile();
  if (!input || typeof input !== 'object') {
    notes.push('Profil fehlte im Speicherstand.');
    return fallback;
  }

  const raw = input as Partial<PlayerProfile>;
  const profile: PlayerProfile = {
    credits: numberOr(raw.credits, fallback.credits),
    xp: numberOr(raw.xp, 0),
    level: numberOr(raw.level, 1),
    echoShards: numberOr(raw.echoShards, 0),
    modules: sanitizeModules(raw.modules, fallback.modules),
    stash: fallback.stash,
    loadout: fallback.loadout,
    stats: {
      raidsStarted: numberOr(raw.stats?.raidsStarted, 0),
      extractions: numberOr(raw.stats?.extractions, 0),
      deaths: numberOr(raw.stats?.deaths, 0),
      timeouts: numberOr(raw.stats?.timeouts, 0),
      kills: numberOr(raw.stats?.kills, 0),
      bestHaul: numberOr(raw.stats?.bestHaul, 0),
      totalLootValue: numberOr(raw.stats?.totalLootValue, 0),
    },
  };

  profile.stash = createInventory(
    stashCapacityFor(profile.modules),
    sanitizeSlots(raw.stash?.slots, notes),
  );
  compact(profile.stash);

  const loadout = createEmptyLoadout();
  loadout.weaponItemId = sanitizeItemId(raw.loadout?.weaponItemId);
  loadout.armorItemId = sanitizeItemId(raw.loadout?.armorItemId);
  loadout.backpackItemId = sanitizeItemId(raw.loadout?.backpackItemId);
  loadout.carried = sanitizeSlots(raw.loadout?.carried, notes);
  profile.loadout = loadout;

  return profile;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sanitizeItemId(value: unknown): string | null {
  return typeof value === 'string' && findItem(value) ? value : null;
}

function sanitizeSlots(
  value: unknown,
  notes: string[],
): Array<{ itemId: string; quantity: number }> {
  if (!Array.isArray(value)) return [];

  const result: Array<{ itemId: string; quantity: number }> = [];
  let dropped = 0;

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const slot = entry as { itemId?: unknown; quantity?: unknown };
    if (typeof slot.itemId !== 'string' || !findItem(slot.itemId)) {
      dropped++;
      continue;
    }
    const quantity = Math.floor(numberOr(slot.quantity, 0));
    if (quantity <= 0) continue;
    result.push({ itemId: slot.itemId, quantity });
  }

  if (dropped > 0) notes.push(`${dropped} unbekannte Gegenstände wurden entfernt.`);
  return result;
}

function sanitizeModules(
  value: unknown,
  fallback: Record<string, number>,
): Record<string, number> {
  if (!value || typeof value !== 'object') return { ...fallback };

  const result: Record<string, number> = {};
  for (const [key, level] of Object.entries(value as Record<string, unknown>)) {
    if (typeof level === 'number' && Number.isFinite(level) && level > 0) {
      result[key] = Math.floor(level);
    }
  }
  return Object.keys(result).length > 0 ? result : { ...fallback };
}
