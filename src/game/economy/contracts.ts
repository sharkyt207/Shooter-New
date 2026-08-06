/**
 * Contracts.
 *
 * Three offers at a time, re-rolled every eight hours. The roll is
 * deterministic from the profile's seed and the refresh index, so the offers
 * survive a reload unchanged — a player who closes the app and comes back does
 * not get a different set, and cannot fish for a better one.
 *
 * Hand-in takes items straight out of the stash and pays credits, XP and
 * reputation. Nothing is timed and nothing expires while you are away: a
 * countdown on a mobile game is a way of punishing people for having a life
 * (docs/08-UI-UX.md).
 */

import { META } from '@/content/balance';
import { eligibleContracts, findContractTemplate } from '@/content/contracts';
import type { ContractTemplate } from '@/content/types';
import { addItem, countItem, removeItem } from '@/game/inventory/inventory';
import {
  addXp,
  metaStream,
  type ActiveContract,
  type PlayerProfile,
} from '@/game/base/profile';
import { addReputation, tierOf, unlockedTraderIds } from './reputation';

const HOUR_MS = 60 * 60 * 1000;

/** Which refresh window `now` falls into. Stable across reloads. */
function refreshIndex(now: number): number {
  return Math.floor(now / (META.contractRefreshHours * HOUR_MS));
}

/**
 * Re-roll the offers if the window has moved on.
 *
 * Completed contracts stay in the list until the refresh, so the player can see
 * what they finished rather than having it silently vanish.
 */
export function refreshContracts(profile: PlayerProfile, now: number): boolean {
  const window = refreshIndex(now);
  if (profile.contracts.length > 0 && refreshIndex(profile.contractsRolledAt) === window) {
    return false;
  }

  const traders = unlockedTraderIds(profile);
  const pool = eligibleContracts(profile.level, traders);
  if (pool.length === 0) {
    profile.contracts = [];
    profile.contractsRolledAt = now;
    return true;
  }

  // Seeded by the profile *and* the window, so two players see different
  // offers and the same player sees the same ones all window long.
  const rng = metaStream((profile.metaSeed * 2654435761 + window) >>> 0);
  const remaining = [...pool];
  const chosen: ActiveContract[] = [];

  for (let i = 0; i < META.contractSlots && remaining.length > 0; i++) {
    const index = rng.int(0, remaining.length - 1);
    const template = remaining.splice(index, 1)[0] as ContractTemplate;
    chosen.push({ templateId: template.id, completed: false });
  }

  profile.contracts = chosen;
  profile.contractsRolledAt = now;
  return true;
}

export function contractProgress(
  profile: Readonly<PlayerProfile>,
  template: ContractTemplate,
): Array<{ itemId: string; have: number; need: number }> {
  return template.deliver.map((entry) => ({
    itemId: entry.itemId,
    have: countItem(profile.stash, entry.itemId),
    need: entry.quantity,
  }));
}

export function canComplete(
  profile: Readonly<PlayerProfile>,
  template: ContractTemplate,
): boolean {
  return contractProgress(profile, template).every((entry) => entry.have >= entry.need);
}

export interface ContractResult {
  ok: boolean;
  reason?: 'unknownContract' | 'alreadyCompleted' | 'missingItems';
  credits?: number;
  xp?: number;
  leveledUp?: boolean;
  newTier?: number;
  rewardItems?: Array<{ itemId: string; quantity: number }>;
}

export function completeContract(profile: PlayerProfile, templateId: string): ContractResult {
  const active = profile.contracts.find((entry) => entry.templateId === templateId);
  const template = findContractTemplate(templateId);
  if (!active || !template) return { ok: false, reason: 'unknownContract' };
  if (active.completed) return { ok: false, reason: 'alreadyCompleted' };
  if (!canComplete(profile, template)) return { ok: false, reason: 'missingItems' };

  for (const entry of template.deliver) {
    removeItem(profile.stash, entry.itemId, entry.quantity);
  }

  profile.credits += template.rewardCredits;
  const leveledUp = addXp(profile, template.rewardXp);

  const before = tierOf(profile, template.traderId);
  const tier = addReputation(profile, template.traderId, template.rewardReputation);

  const rewardItems: Array<{ itemId: string; quantity: number }> = [];
  for (const reward of template.rewardItems ?? []) {
    const added = addItem(profile.stash, reward.itemId, reward.quantity);
    if (added > 0) rewardItems.push({ itemId: reward.itemId, quantity: added });
  }

  active.completed = true;

  return {
    ok: true,
    credits: template.rewardCredits,
    xp: template.rewardXp,
    leveledUp,
    rewardItems,
    ...(tier > before ? { newTier: tier } : {}),
  };
}

/** The offers as full templates, skipping any that content removed. */
export function offeredContracts(profile: Readonly<PlayerProfile>): Array<{
  active: ActiveContract;
  template: ContractTemplate;
}> {
  const result: Array<{ active: ActiveContract; template: ContractTemplate }> = [];
  for (const active of profile.contracts) {
    const template = findContractTemplate(active.templateId);
    if (template) result.push({ active, template });
  }
  return result;
}
