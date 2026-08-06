/**
 * "Kartographie der Risse" — progress through the one quest line.
 *
 * The line is a curriculum, not a story: each stage points at the system the
 * game has just made available, in the order a new player meets them. The game
 * refuses to explain itself in menus (docs/08-UI-UX.md), so this is where "you
 * can do this" gets said out loud — once.
 *
 * Every goal is fed by a fact the raid already reports, so no other system grew
 * a hook to make the quest line possible. Adding a stage is a content change.
 */

import { QUEST_STAGES } from '@/content/quests';
import type { QuestStageDef } from '@/content/types';
import { addItem } from '@/game/inventory/inventory';
import { addXp, moduleLevel, type PlayerProfile } from './profile';

/** What a raid or a base action contributes towards the current stage. */
export interface QuestSignal {
  extractions?: number;
  kills?: number;
  extractedValue?: number;
  vaultsOpened?: number;
  anomaliesSurvived?: number;
  crafted?: number;
}

export function currentStage(profile: Readonly<PlayerProfile>): QuestStageDef | null {
  return QUEST_STAGES[profile.quest.stage] ?? null;
}

export function questFinished(profile: Readonly<PlayerProfile>): boolean {
  return profile.quest.stage >= QUEST_STAGES.length;
}

/** How much of the current stage's goal is done, 0..1. */
export function stageProgress(profile: Readonly<PlayerProfile>): number {
  const stage = currentStage(profile);
  if (!stage) return 1;
  return Math.max(0, Math.min(1, profile.quest.progress / stage.goal.target));
}

export interface QuestCompletion {
  stage: QuestStageDef;
  credits: number;
  xp: number;
  items: Array<{ itemId: string; quantity: number }>;
  leveledUp: boolean;
}

/**
 * Advance the line with everything that just happened.
 *
 * Returns every stage completed by this signal - a single good raid can finish
 * more than one, and swallowing the second would rob the player of the reward.
 */
export function advanceQuest(
  profile: PlayerProfile,
  signal: QuestSignal,
  now: number,
): QuestCompletion[] {
  void now;
  const completions: QuestCompletion[] = [];

  // Loop, because a stage that completes may leave progress for the next one to
  // pick up immediately (a module goal, for instance, is already satisfied).
  for (let guard = 0; guard < QUEST_STAGES.length + 1; guard++) {
    const stage = currentStage(profile);
    if (!stage) break;

    profile.quest.progress += contribution(profile, stage, signal);
    if (profile.quest.progress < stage.goal.target) break;

    completions.push(grant(profile, stage));
    profile.quest.stage++;
    profile.quest.progress = 0;

    // Only state-based goals can auto-satisfy; event goals need a new signal.
    if (!isStateGoal(currentStage(profile))) break;
  }

  return completions;
}

/**
 * A goal measured against the profile rather than against an event.
 * `moduleLevel` is the only one today, and it is why `advanceQuest` loops.
 */
function isStateGoal(stage: QuestStageDef | null): boolean {
  return stage?.goal.kind === 'moduleLevel';
}

function contribution(
  profile: Readonly<PlayerProfile>,
  stage: QuestStageDef,
  signal: QuestSignal,
): number {
  switch (stage.goal.kind) {
    case 'extract':
      return signal.extractions ?? 0;
    case 'kills':
      return signal.kills ?? 0;
    case 'extractValue':
      return signal.extractedValue ?? 0;
    case 'openVault':
      return signal.vaultsOpened ?? 0;
    case 'surviveAnomaly':
      return signal.anomaliesSurvived ?? 0;
    case 'craft':
      return signal.crafted ?? 0;
    case 'moduleLevel':
      // State-based: report the level itself rather than an increment, so the
      // stage is satisfied the moment the base reaches it.
      return Math.max(
        0,
        moduleLevel(profile, stage.goal.moduleId ?? '') - profile.quest.progress,
      );
    default:
      return 0;
  }
}

function grant(profile: PlayerProfile, stage: QuestStageDef): QuestCompletion {
  profile.credits += stage.rewardCredits;
  const leveledUp = addXp(profile, stage.rewardXp);

  const items: Array<{ itemId: string; quantity: number }> = [];
  for (const reward of stage.rewardItems ?? []) {
    const added = addItem(profile.stash, reward.itemId, reward.quantity);
    if (added > 0) items.push({ itemId: reward.itemId, quantity: added });
  }

  return { stage, credits: stage.rewardCredits, xp: stage.rewardXp, items, leveledUp };
}
