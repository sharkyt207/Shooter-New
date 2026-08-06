/**
 * Which hints the player has already seen.
 *
 * Deliberately the smallest possible system: a set of ids on the profile, and
 * one function that answers "should this fire?". Everything interesting about
 * onboarding is in *when* the app asks — the bookkeeping is trivial and should
 * stay that way.
 *
 * `seenHints` is a plain array rather than a `Set` because the profile has to
 * survive a JSON round-trip (ADR-002), and because it is never long enough for
 * the lookup cost to matter.
 */

import { hintFor, type HintDef, type HintTrigger } from '@/content/hints';
import type { PlayerProfile } from './profile';

/**
 * The hint for this situation, or null if it has been shown before.
 *
 * Marks it as seen as a side effect: a hint that fires twice because the caller
 * forgot to record it is exactly the failure this exists to prevent.
 */
export function takeHint(profile: PlayerProfile, trigger: HintTrigger): HintDef | null {
  const hint = hintFor(trigger);
  if (!hint) return null;
  if (profile.seenHints.includes(hint.id)) return null;

  profile.seenHints.push(hint.id);
  return hint;
}

export function hasSeenHint(profile: Readonly<PlayerProfile>, hintId: string): boolean {
  return profile.seenHints.includes(hintId);
}

/** True while the player is still being introduced to the game. */
export function isNewPlayer(profile: Readonly<PlayerProfile>): boolean {
  return profile.stats.extractions === 0 && profile.stats.raidsStarted <= 1;
}

/** Forget everything, so the tutorial can be replayed from the settings. */
export function resetHints(profile: PlayerProfile): void {
  profile.seenHints = [];
}
