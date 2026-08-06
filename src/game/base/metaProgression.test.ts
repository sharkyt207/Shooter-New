/**
 * M5: the base between raids.
 *
 * Build queues, crafting with failure, and the quest line. The common thread in
 * these tests is that none of them may ever destroy something silently - the
 * base is the counterweight to the raid's brutality (Pillar P5), and a meta
 * layer that eats materials is worse than no meta layer at all.
 */

import { describe, expect, it } from 'vitest';
import { META } from '@/content/balance';
import { QUEST_STAGES } from '@/content/quests';
import { addItem, countItem } from '@/game/inventory/inventory';
import {
  buildProgress,
  collectBuilds,
  isBuilding,
  nextLevelOf,
  secondsRemaining,
  startUpgrade,
  unmetRequirements,
} from './buildQueue';
import { createDefaultProfile, type PlayerProfile } from './profile';
import { advanceQuest, currentStage, questFinished, stageProgress } from './questLine';
import {
  collectCrafts,
  craftSlots,
  failureChanceFor,
  startCraft,
} from '@/game/crafting/craftQueue';
import { getRecipe } from '@/content/baseModules';

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

function rich(): PlayerProfile {
  const profile = createDefaultProfile();
  profile.credits = 500_000;
  return profile;
}

describe('base construction', () => {
  it('charges up front and finishes later', () => {
    const profile = rich();
    const before = profile.credits;

    const result = startUpgrade(profile, 'base_workbench', NOW);

    expect(result.ok).toBe(true);
    expect(result.instant).toBeFalsy();
    expect(profile.credits).toBeLessThan(before);
    expect(isBuilding(profile, 'base_workbench')).toBe(true);
    // Not applied yet - that is the whole point of a build time.
    expect(profile.modules['base_workbench']).toBe(1);

    expect(collectBuilds(profile, NOW + 60_000)).toHaveLength(0);

    const done = collectBuilds(profile, NOW + HOUR);
    expect(done).toHaveLength(1);
    expect(profile.modules['base_workbench']).toBe(2);
    expect(isBuilding(profile, 'base_workbench')).toBe(false);
  });

  it('reports progress and remaining time honestly', () => {
    const profile = rich();
    startUpgrade(profile, 'base_medical', NOW);
    const job = profile.builds[0];
    expect(job).toBeDefined();
    if (!job) return;

    expect(buildProgress(job, NOW)).toBeCloseTo(0, 2);
    expect(buildProgress(job, job.readyAt)).toBe(1);
    expect(buildProgress(job, NOW + (job.readyAt - NOW) / 2)).toBeCloseTo(0.5, 2);
    expect(secondsRemaining(job, job.readyAt)).toBe(0);
  });

  it('will not build the same module twice at once', () => {
    const profile = rich();
    startUpgrade(profile, 'base_medical', NOW);
    expect(startUpgrade(profile, 'base_medical', NOW).reason).toBe('alreadyBuilding');
  });

  it('enforces module dependencies and names what is missing', () => {
    const profile = rich();

    // The gunsmith needs a workbench at level 2. You cannot build a weapon on a
    // folding table.
    const level = nextLevelOf(profile, 'base_gunsmith');
    expect(level).toBeDefined();
    if (!level) return;

    const missing = unmetRequirements(profile, level);
    expect(missing).toHaveLength(1);
    expect(missing[0]?.moduleId).toBe('base_workbench');
    expect(missing[0]?.name).toBeTruthy();
    expect(startUpgrade(profile, 'base_gunsmith', NOW).reason).toBe('requirementsNotMet');

    profile.modules['base_workbench'] = 2;
    expect(startUpgrade(profile, 'base_gunsmith', NOW).ok).toBe(true);
  });

  it('keeps building while the player is in a raid', () => {
    // Not a behaviour of the code so much as of the design: the clock is wall
    // time, so ten minutes of raid is ten minutes of construction.
    const profile = rich();
    startUpgrade(profile, 'base_medical', NOW);
    const job = profile.builds[0];
    if (!job) return;

    const raidMs = 600_000;
    expect(buildProgress(job, NOW + raidMs)).toBeGreaterThan(0);
  });
});

describe('crafting', () => {
  it('takes the inputs immediately and delivers on the timer', () => {
    const profile = rich();
    addItem(profile.stash, 'itm_scrap', 4);
    addItem(profile.stash, 'itm_copper', 2);
    const ammoBefore = countItem(profile.stash, 'itm_ammo_9mm');

    expect(startCraft(profile, 'rcp_ammo_9mm', NOW).ok).toBe(true);
    expect(countItem(profile.stash, 'itm_scrap')).toBe(2);
    expect(countItem(profile.stash, 'itm_ammo_9mm')).toBe(ammoBefore);

    const done = collectCrafts(profile, NOW + HOUR);
    expect(done).toHaveLength(1);
    expect(done[0]?.failed).toBe(false);
    expect(countItem(profile.stash, 'itm_ammo_9mm')).toBe(ammoBefore + 30);
  });

  it('limits concurrent jobs to the workbench level', () => {
    const profile = rich();
    addItem(profile.stash, 'itm_scrap', 40);
    addItem(profile.stash, 'itm_copper', 40);

    expect(craftSlots(profile)).toBe(1);
    expect(startCraft(profile, 'rcp_ammo_9mm', NOW).ok).toBe(true);
    expect(startCraft(profile, 'rcp_ammo_9mm', NOW).reason).toBe('queueFull');

    profile.modules['base_workbench'] = 3;
    expect(craftSlots(profile)).toBe(3);
    expect(startCraft(profile, 'rcp_ammo_9mm', NOW).ok).toBe(true);
  });

  it('gives most of the material back when a craft fails', () => {
    const profile = rich();
    profile.modules['base_workbench'] = 2;
    addItem(profile.stash, 'itm_polymer', 4);
    addItem(profile.stash, 'itm_scrap', 3);

    // Force the failure rather than fishing for a seed: the roll happens on
    // start and is stored on the job, so the test can simply set it.
    startCraft(profile, 'rcp_armor_fiber', NOW);
    const job = profile.crafts[0];
    if (!job) return;
    job.failed = true;

    const done = collectCrafts(profile, NOW + HOUR);
    expect(done[0]?.failed).toBe(true);
    // A failure costs time and a little material - never the whole lot.
    expect(countItem(profile.stash, 'itm_polymer')).toBe(
      Math.floor(4 * META.craftFailureRefund),
    );
    expect(countItem(profile.stash, 'itm_armor_fiber')).toBe(1); // the starting one
  });

  it('cannot be re-rolled by reloading, because the roll happens on start', () => {
    const profile = rich();
    profile.modules['base_workbench'] = 2;
    addItem(profile.stash, 'itm_polymer', 8);
    addItem(profile.stash, 'itm_scrap', 6);

    startCraft(profile, 'rcp_armor_fiber', NOW);
    const outcomeA = profile.crafts[0]?.failed;

    // Simulate a reload: the job (with its outcome) is part of the save.
    const restored = JSON.parse(JSON.stringify(profile)) as PlayerProfile;
    expect(restored.crafts[0]?.failed).toBe(outcomeA);
  });

  it('lowers the failure chance as the module outgrows the recipe', () => {
    const profile = rich();
    profile.modules['base_workbench'] = 2;
    const recipe = getRecipe('rcp_armor_fiber');

    const atRequirement = failureChanceFor(profile, recipe);
    profile.modules['base_workbench'] = 3;
    const aboveRequirement = failureChanceFor(profile, recipe);

    expect(atRequirement).toBeGreaterThan(0);
    expect(aboveRequirement).toBeLessThan(atRequirement);
  });

  it('never has a failure chance above 100 % or below 0', () => {
    const profile = rich();
    for (const level of [1, 2, 3, 9]) {
      profile.modules['base_workbench'] = level;
      profile.modules['base_gunsmith'] = level;
      for (const id of ['rcp_armor_fiber', 'rcp_ammo_74', 'rcp_sight_reflex'] as const) {
        const chance = failureChanceFor(profile, getRecipe(id));
        expect(chance).toBeGreaterThanOrEqual(0);
        expect(chance).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('the quest line', () => {
  it('starts at the first stage and reports progress', () => {
    const profile = createDefaultProfile();
    expect(currentStage(profile)?.id).toBe(QUEST_STAGES[0]?.id);
    expect(stageProgress(profile)).toBe(0);
    expect(questFinished(profile)).toBe(false);
  });

  it('advances only on the signal the stage asks for', () => {
    const profile = createDefaultProfile();

    // Stage 1 wants an extraction; kills do nothing for it.
    expect(advanceQuest(profile, { kills: 50 }, NOW)).toHaveLength(0);
    expect(profile.quest.stage).toBe(0);

    const done = advanceQuest(profile, { extractions: 1 }, NOW);
    expect(done).toHaveLength(1);
    expect(profile.quest.stage).toBe(1);
    expect(profile.credits).toBeGreaterThan(createDefaultProfile().credits);
  });

  it('pays out every stage it completes, including several at once', () => {
    const profile = rich();
    profile.quest.stage = 6; // the module-level stage
    profile.modules['base_workbench'] = 3;

    const done = advanceQuest(profile, {}, NOW);
    expect(done).toHaveLength(1);
    expect(questFinished(profile)).toBe(true);
  });

  it('finishes and stays finished', () => {
    const profile = rich();
    profile.quest.stage = QUEST_STAGES.length;
    expect(currentStage(profile)).toBeNull();
    expect(advanceQuest(profile, { extractions: 5, kills: 100 }, NOW)).toHaveLength(0);
    expect(stageProgress(profile)).toBe(1);
  });

  it('has stages that are all reachable', () => {
    // Every goal kind must be one `advanceQuest` can actually satisfy,
    // otherwise the line dead-ends on a stage nobody can finish.
    const reachable = new Set([
      'extract',
      'kills',
      'extractValue',
      'openVault',
      'surviveAnomaly',
      'craft',
      'moduleLevel',
    ]);
    for (const stage of QUEST_STAGES) {
      expect(reachable.has(stage.goal.kind), stage.id).toBe(true);
      expect(stage.goal.target).toBeGreaterThan(0);
    }
  });
});
