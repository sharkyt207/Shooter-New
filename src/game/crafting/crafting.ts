/**
 * Crafting.
 *
 * The prototype crafts instantly; the data model already carries `craftSeconds`
 * so timed production queues can be added in M5 without touching call sites.
 */

import { ALL_RECIPE_IDS, getRecipe, type RecipeId } from '@/content/baseModules';
import type { RecipeDef } from '@/content/types';
import { addItem, countItem, removeItem } from '@/game/inventory/inventory';
import { moduleLevel, type PlayerProfile } from '@/game/base/profile';

export type CraftFailure = 'unknownRecipe' | 'moduleTooLow' | 'missingInputs' | 'noSpace';

export interface CraftResult {
  ok: boolean;
  reason?: CraftFailure;
  produced?: { itemId: string; quantity: number };
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

export function canCraft(profile: Readonly<PlayerProfile>, recipeId: string): CraftFailure | null {
  const recipe = getRecipe(recipeId as RecipeId);
  if (!recipe) return 'unknownRecipe';
  if (!isRecipeUnlocked(profile, recipe)) return 'moduleTooLow';
  if (!hasInputs(profile, recipe)) return 'missingInputs';
  return null;
}

export function craft(profile: PlayerProfile, recipeId: string): CraftResult {
  const failure = canCraft(profile, recipeId);
  if (failure) return { ok: false, reason: failure };

  const recipe = getRecipe(recipeId as RecipeId);

  // Consume inputs only after confirming the output fits, otherwise a full
  // stash would destroy the materials.
  const added = addItem(profile.stash, recipe.output.itemId, recipe.output.quantity);
  if (added <= 0) return { ok: false, reason: 'noSpace' };

  for (const input of recipe.inputs) {
    removeItem(profile.stash, input.itemId, input.quantity);
  }

  return { ok: true, produced: { itemId: recipe.output.itemId, quantity: added } };
}

/** Recipes unlocked by the current base, in catalogue order. */
export function availableRecipes(profile: Readonly<PlayerProfile>): RecipeDef[] {
  return ALL_RECIPE_IDS.map((id) => getRecipe(id)).filter((recipe) =>
    isRecipeUnlocked(profile, recipe),
  );
}
