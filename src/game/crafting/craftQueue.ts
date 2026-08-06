/**
 * The crafting queue.
 *
 * Three things happen here that did not in the prototype: jobs take time, jobs
 * can fail, and several can run at once.
 *
 * **Time.** Inputs are consumed at the start, the output appears at the end.
 * Consuming up front is what makes a queued job a commitment rather than a
 * reservation, and it keeps the stash honest: what you queued is gone from it.
 *
 * **Failure.** A failed craft returns `META.craftFailureRefund` of its
 * materials. That number is high on purpose. A failure that costs a morning's
 * looting does not teach caution, it teaches people never to craft — and the
 * workbench then becomes an ornament. What a failure should cost is *time* and
 * a little material, both of which the player can plan around.
 *
 * Every level of the required module above the recipe's minimum removes a third
 * of the failure chance, so investing in the base is what turns a gamble into a
 * supply chain.
 *
 * **Determinism.** The roll happens when the job is *started* and is stored on
 * the job, drawn from the profile's advancing meta cursor. Rolling at collection
 * time would let a player reload the save until the craft succeeds; rolling
 * from `Math.random()` is forbidden in `game/**` anyway (ADR-009).
 */

import { META } from '@/content/balance';
import { ALL_RECIPE_IDS, getRecipe, type RecipeId } from '@/content/baseModules';
import type { RecipeDef } from '@/content/types';
import { addItem, countItem, removeItem } from '@/game/inventory/inventory';
import { moduleLevel, nextMetaRandom, type CraftJob, type PlayerProfile } from '@/game/base/profile';

export type CraftFailure =
  | 'unknownRecipe'
  | 'moduleTooLow'
  | 'missingInputs'
  | 'noSpace'
  | 'queueFull';

export interface CraftStartResult {
  ok: boolean;
  reason?: CraftFailure;
  job?: CraftJob;
}

export function isRecipeUnlocked(profile: Readonly<PlayerProfile>, recipe: RecipeDef): boolean {
  return moduleLevel(profile, recipe.requires.moduleId) >= recipe.requires.level;
}

export function hasInputs(profile: Readonly<PlayerProfile>, recipe: RecipeDef): boolean {
  for (const input of recipe.inputs) {
    if (countItem(profile.stash, input.itemId) < input.quantity) return false;
  }
  return true;
}

/** Concurrent jobs the base supports. One per workbench level. */
export function craftSlots(profile: Readonly<PlayerProfile>): number {
  return Math.max(1, moduleLevel(profile, 'base_workbench') * META.craftSlotsPerLevel);
}

/**
 * Effective failure chance, after the bonus from an over-qualified module.
 * Exposed because the crafting screen has to show it: a hidden failure chance
 * reads as the game cheating.
 */
export function failureChanceFor(profile: Readonly<PlayerProfile>, recipe: RecipeDef): number {
  const base = recipe.failureChance ?? 0;
  if (base <= 0) return 0;
  const above = Math.max(0, moduleLevel(profile, recipe.requires.moduleId) - recipe.requires.level);
  const reduction = 1 - META.craftFailureReductionPerLevel * above;
  return Math.max(0, base * Math.max(0, reduction));
}

export function canCraft(profile: Readonly<PlayerProfile>, recipeId: string): CraftFailure | null {
  const recipe = getRecipe(recipeId as RecipeId);
  if (!recipe) return 'unknownRecipe';
  if (!isRecipeUnlocked(profile, recipe)) return 'moduleTooLow';
  if (profile.crafts.length >= craftSlots(profile)) return 'queueFull';
  if (!hasInputs(profile, recipe)) return 'missingInputs';
  return null;
}

/**
 * Queue a craft: consume the inputs, roll the outcome, set the timer.
 *
 * An instant recipe still goes through the same path and is collected on the
 * next `collectCrafts`, so there is exactly one place where output appears.
 */
export function startCraft(
  profile: PlayerProfile,
  recipeId: string,
  now: number,
): CraftStartResult {
  const failure = canCraft(profile, recipeId);
  if (failure) return { ok: false, reason: failure };

  const recipe = getRecipe(recipeId as RecipeId);

  for (const input of recipe.inputs) {
    removeItem(profile.stash, input.itemId, input.quantity);
  }

  const job: CraftJob = {
    id: profile.nextCraftId++,
    recipeId: recipe.id,
    readyAt: now + recipe.craftSeconds * META.timeScale * 1000,
    // Rolled now, stored on the job: reloading the save cannot change it.
    failed: nextMetaRandom(profile) < failureChanceFor(profile, recipe),
  };
  profile.crafts.push(job);

  return { ok: true, job };
}

export interface CraftOutcome {
  recipeId: string;
  recipeName: string;
  failed: boolean;
  /** What actually landed in the stash - the output, or the refunded inputs. */
  produced: Array<{ itemId: string; quantity: number }>;
  /** Items that did not fit and were lost. */
  overflow: Array<{ itemId: string; quantity: number }>;
}

/** Finish every job whose timer has run out. */
export function collectCrafts(profile: PlayerProfile, now: number): CraftOutcome[] {
  if (profile.crafts.length === 0) return [];

  const results: CraftOutcome[] = [];
  const pending: CraftJob[] = [];

  for (const job of profile.crafts) {
    if (job.readyAt > now) {
      pending.push(job);
      continue;
    }

    const recipe = getRecipe(job.recipeId as RecipeId);
    if (!recipe) continue;

    const wanted = job.failed ? refundOf(recipe) : [{ ...recipe.output }];
    const produced: Array<{ itemId: string; quantity: number }> = [];
    const overflow: Array<{ itemId: string; quantity: number }> = [];

    for (const entry of wanted) {
      if (entry.quantity <= 0) continue;
      const added = addItem(profile.stash, entry.itemId, entry.quantity);
      if (added > 0) produced.push({ itemId: entry.itemId, quantity: added });
      if (added < entry.quantity) {
        overflow.push({ itemId: entry.itemId, quantity: entry.quantity - added });
      }
    }

    results.push({ recipeId: recipe.id, recipeName: recipe.name, failed: job.failed, produced, overflow });
  }

  profile.crafts = pending;
  return results;
}

/** What comes back from a failed craft. */
function refundOf(recipe: RecipeDef): Array<{ itemId: string; quantity: number }> {
  return recipe.inputs.map((input) => ({
    itemId: input.itemId,
    quantity: Math.floor(input.quantity * META.craftFailureRefund),
  }));
}

export function craftProgress(job: CraftJob, now: number): number {
  const recipe = getRecipe(job.recipeId as RecipeId);
  const totalMs = (recipe?.craftSeconds ?? 0) * META.timeScale * 1000;
  if (totalMs <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - Math.max(0, job.readyAt - now) / totalMs));
}

/** Recipes unlocked by the current base, in catalogue order. */
export function availableRecipes(profile: Readonly<PlayerProfile>): RecipeDef[] {
  return ALL_RECIPE_IDS.map((id) => getRecipe(id)).filter((recipe) =>
    isRecipeUnlocked(profile, recipe),
  );
}
