/**
 * Trader reputation.
 *
 * Reputation is earned by *doing business* — every credit traded in either
 * direction counts, and contracts count for a lot. That is the design in one
 * sentence: the way to a better weapon runs through a trader you have used, not
 * through a pile of credits earned somewhere else.
 *
 * It buys two things, and deliberately only two: better prices, and deeper
 * stock. Both are visible on the trader screen, so the player can always see
 * what the next tier is for.
 */

import { META } from '@/content/balance';
import { findTrader } from '@/content/traders';
import { moduleLevel, type PlayerProfile } from '@/game/base/profile';

export function reputationOf(profile: Readonly<PlayerProfile>, traderId: string): number {
  return profile.reputation[traderId] ?? 0;
}

/** Reputation tier, 0..3. */
export function tierOf(profile: Readonly<PlayerProfile>, traderId: string): number {
  const points = reputationOf(profile, traderId);
  let tier = 0;
  for (let i = 0; i < META.reputationTiers.length; i++) {
    if (points >= (META.reputationTiers[i] as number)) tier = i;
  }
  return tier;
}

/** Points still needed for the next tier, or null at the top. */
export function pointsToNextTier(
  profile: Readonly<PlayerProfile>,
  traderId: string,
): number | null {
  const tier = tierOf(profile, traderId);
  const next = META.reputationTiers[tier + 1];
  if (next === undefined) return null;
  return Math.max(0, next - reputationOf(profile, traderId));
}

export function addReputation(profile: PlayerProfile, traderId: string, points: number): number {
  if (points <= 0) return tierOf(profile, traderId);
  const before = tierOf(profile, traderId);
  profile.reputation[traderId] = reputationOf(profile, traderId) + points;
  const after = tierOf(profile, traderId);
  return after > before ? after : before;
}

/** Reputation earned by moving this many credits of goods. */
export function reputationForTrade(creditValue: number): number {
  return Math.max(0, Math.round(creditValue * META.reputationPerCredit));
}

/** Is this trader reachable with the current base? */
export function traderUnlocked(profile: Readonly<PlayerProfile>, traderId: string): boolean {
  const def = findTrader(traderId);
  if (!def) return false;
  return moduleLevel(profile, def.requires.moduleId) >= def.requires.level;
}

export function unlockedTraderIds(profile: Readonly<PlayerProfile>): string[] {
  return ['trd_quartermaster', 'trd_medic', 'trd_blackmarket'].filter((id) =>
    traderUnlocked(profile, id),
  );
}
