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
import { findAttachment } from '@/content/attachments';
import { findBaseModule, findRecipe } from '@/content/baseModules';
import { findContractTemplate } from '@/content/contracts';
import { findTrader } from '@/content/traders';
import { ALL_HINT_IDS } from '@/content/hints';
import type { AttachmentLoadout } from '@/content/types';
import { clamp01 } from '@/core/math/scalar';

export const CURRENT_SAVE_VERSION = 2;

export interface SaveDataV1 {
  version: 1;
  /** Milliseconds since epoch, supplied by the caller (the simulation owns no clock). */
  savedAt: number;
  profile: PlayerProfile;
}

/** v2 adds the M5 meta layer: build and craft queues, reputation, quests. */
export interface SaveDataV2 {
  version: 2;
  savedAt: number;
  profile: PlayerProfile;
}

export type SaveData = SaveDataV2;

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
function migrate(data: UnknownSave, notes: string[]): SaveDataV2 {
  let current = data;
  const version = typeof current['version'] === 'number' ? (current['version'] as number) : 0;

  if (version === 0) {
    // v0 = pre-versioning data (or garbage). There is nothing to salvage, but
    // the branch documents the chain and gives future versions a template.
    notes.push('Alter Speicherstand ohne Version erkannt - neues Profil angelegt.');
    current = { version: 1, savedAt: 0, profile: createDefaultProfile() } as UnknownSave;
  }

  if ((current['version'] as number) === 1) {
    // v1 -> v2: the M5 meta layer. Nothing is lost and nothing is reset - the
    // new fields simply start empty, which is exactly what a fresh base looks
    // like. `validateProfile` fills in the defaults, so this step only has to
    // move the version forward.
    current = { ...current, version: 2 } as UnknownSave;
  }

  if ((current['version'] as number) > CURRENT_SAVE_VERSION) {
    notes.push('Speicherstand stammt aus einer neueren Version und wurde zurückgesetzt.');
    current = { version: 2, savedAt: 0, profile: createDefaultProfile() } as UnknownSave;
  }

  return current as unknown as SaveDataV2;
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
    weaponRepairs: Math.max(0, Math.floor(numberOr(raw.weaponRepairs, 0))),
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

    // ── Meta (v2) ──────────────────────────────────────────────────────────
    // Every one of these has a safe empty default, which is what makes the
    // v1 -> v2 migration a one-line version bump.
    metaSeed: Math.max(1, Math.floor(numberOr(raw.metaSeed, 1))),
    builds: sanitizeBuilds(raw.builds),
    crafts: sanitizeCrafts(raw.crafts),
    nextCraftId: Math.max(1, Math.floor(numberOr(raw.nextCraftId, 1))),
    reputation: sanitizeReputation(raw.reputation),
    contracts: sanitizeContracts(raw.contracts),
    contractsRolledAt: numberOr(raw.contractsRolledAt, 0),
    insuranceReturns: sanitizeReturns(raw.insuranceReturns),
    quest: {
      stage: Math.max(0, Math.floor(numberOr(raw.quest?.stage, 0))),
      progress: Math.max(0, numberOr(raw.quest?.progress, 0)),
    },
    // An unknown hint id is dropped: content removed it, so it can never fire.
    seenHints: Array.isArray(raw.seenHints)
      ? raw.seenHints.filter(
          (id): id is string => typeof id === 'string' && ALL_HINT_IDS.includes(id),
        )
      : [],
  };

  profile.stash = createInventory(
    stashCapacityFor(profile.modules),
    sanitizeSlots(raw.stash?.slots, notes),
  );
  compact(profile.stash);

  const loadout = createEmptyLoadout();
  loadout.weaponItemId = sanitizeItemId(raw.loadout?.weaponItemId);
  loadout.armorItemId = sanitizeItemId(raw.loadout?.armorItemId);
  loadout.helmetItemId = sanitizeItemId(raw.loadout?.helmetItemId);
  loadout.backpackItemId = sanitizeItemId(raw.loadout?.backpackItemId);
  loadout.preferredAmmoItemId = sanitizeItemId(raw.loadout?.preferredAmmoItemId);
  loadout.weaponCondition = clamp01(numberOr(raw.loadout?.weaponCondition, 1));
  loadout.attachments = sanitizeAttachments(raw.loadout?.attachments);
  loadout.carried = sanitizeSlots(raw.loadout?.carried, notes);
  loadout.secureContainerItemId = sanitizeItemId(raw.loadout?.secureContainerItemId);
  loadout.secureItems = sanitizeSlots(raw.loadout?.secureItems, notes);
  loadout.insured = raw.loadout?.insured === true;
  profile.loadout = loadout;

  return profile;
}

/**
 * A build for a module that content removed is dropped, not repaired.
 * The credits are gone either way; a phantom job that can never finish would
 * block the slot forever.
 */
function sanitizeBuilds(value: unknown): PlayerProfile['builds'] {
  if (!Array.isArray(value)) return [];
  const result: PlayerProfile['builds'] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const job = entry as Record<string, unknown>;
    if (typeof job['moduleId'] !== 'string' || !findBaseModule(job['moduleId'])) continue;
    result.push({
      moduleId: job['moduleId'],
      targetLevel: Math.max(1, Math.floor(numberOr(job['targetLevel'], 1))),
      readyAt: numberOr(job['readyAt'], 0),
    });
  }
  return result;
}

function sanitizeCrafts(value: unknown): PlayerProfile['crafts'] {
  if (!Array.isArray(value)) return [];
  const result: PlayerProfile['crafts'] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const job = entry as Record<string, unknown>;
    if (typeof job['recipeId'] !== 'string' || !findRecipe(job['recipeId'])) continue;
    result.push({
      id: Math.max(1, Math.floor(numberOr(job['id'], 1))),
      recipeId: job['recipeId'],
      readyAt: numberOr(job['readyAt'], 0),
      failed: job['failed'] === true,
    });
  }
  return result;
}

function sanitizeReputation(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, number> = {};
  for (const [traderId, points] of Object.entries(value as Record<string, unknown>)) {
    if (!findTrader(traderId)) continue;
    if (typeof points === 'number' && Number.isFinite(points) && points > 0) {
      result[traderId] = points;
    }
  }
  return result;
}

function sanitizeContracts(value: unknown): PlayerProfile['contracts'] {
  if (!Array.isArray(value)) return [];
  const result: PlayerProfile['contracts'] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const contract = entry as Record<string, unknown>;
    if (typeof contract['templateId'] !== 'string') continue;
    if (!findContractTemplate(contract['templateId'])) continue;
    result.push({ templateId: contract['templateId'], completed: contract['completed'] === true });
  }
  return result;
}

function sanitizeReturns(value: unknown): PlayerProfile['insuranceReturns'] {
  if (!Array.isArray(value)) return [];
  const result: PlayerProfile['insuranceReturns'] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    if (typeof item['itemId'] !== 'string' || !findItem(item['itemId'])) continue;
    const quantity = Math.floor(numberOr(item['quantity'], 0));
    if (quantity <= 0) continue;
    result.push({ itemId: item['itemId'], quantity, readyAt: numberOr(item['readyAt'], 0) });
  }
  return result;
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

/**
 * Drop attachments that no longer exist or moved slot.
 * A content change must never make a save unloadable.
 */
function sanitizeAttachments(value: unknown): AttachmentLoadout {
  if (!value || typeof value !== 'object') return {};

  const result: AttachmentLoadout = {};
  for (const [slot, attachmentId] of Object.entries(value as Record<string, unknown>)) {
    if (typeof attachmentId !== 'string') continue;
    const def = findAttachment(attachmentId);
    if (!def || def.slot !== slot) continue;
    result[def.slot] = attachmentId;
  }
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
