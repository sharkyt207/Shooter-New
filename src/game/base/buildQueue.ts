/**
 * Base construction.
 *
 * An upgrade is paid for immediately and finishes later. The waiting is the
 * point, and so is where it happens: **the clock keeps running during a raid**,
 * so a build timer sends the player into the rift rather than out of the app.
 * A raid is ten minutes; nothing here takes longer than an hour.
 *
 * The whole queue is expressed as epoch timestamps rather than as countdowns,
 * which means it survives a save, a reload and a week away from the game with
 * no bookkeeping at all. `game/**` owns no clock (ADR-009), so `now` is always
 * passed in.
 */

import { META } from '@/content/balance';
import { findBaseModule } from '@/content/baseModules';
import type { BaseModuleLevel } from '@/content/types';
import { moduleLevel, stashCapacityFor, type BuildJob, type PlayerProfile } from './profile';

export type BuildFailure =
  | 'unknownModule'
  | 'maxLevel'
  | 'notEnoughCredits'
  | 'requirementsNotMet'
  | 'alreadyBuilding';

export interface StartBuildResult {
  ok: boolean;
  reason?: BuildFailure;
  /** Epoch ms the build completes. Equal to `now` for instant levels. */
  readyAt?: number;
  /** True when the level had no build time and was applied straight away. */
  instant?: boolean;
}

/** The level definition that would come next, or undefined at max level. */
export function nextLevelOf(
  profile: Readonly<PlayerProfile>,
  moduleId: string,
): BaseModuleLevel | undefined {
  const def = findBaseModule(moduleId);
  if (!def) return undefined;
  return def.levels.find((entry) => entry.level === moduleLevel(profile, moduleId) + 1);
}

/** Requirements of a level that the base does not meet yet. */
export function unmetRequirements(
  profile: Readonly<PlayerProfile>,
  level: BaseModuleLevel,
): Array<{ moduleId: string; level: number; name: string }> {
  const missing: Array<{ moduleId: string; level: number; name: string }> = [];
  for (const requirement of level.requires ?? []) {
    if (moduleLevel(profile, requirement.moduleId) >= requirement.level) continue;
    missing.push({
      moduleId: requirement.moduleId,
      level: requirement.level,
      name: findBaseModule(requirement.moduleId)?.name ?? requirement.moduleId,
    });
  }
  return missing;
}

export function isBuilding(profile: Readonly<PlayerProfile>, moduleId: string): boolean {
  return profile.builds.some((job) => job.moduleId === moduleId);
}

export function buildJobFor(
  profile: Readonly<PlayerProfile>,
  moduleId: string,
): BuildJob | undefined {
  return profile.builds.find((job) => job.moduleId === moduleId);
}

/**
 * Begin an upgrade.
 *
 * Credits are taken up front. That is deliberate: a build the player can walk
 * away from for free is not a decision, and refunding a cancelled build invites
 * using the queue as a savings account.
 */
export function startUpgrade(
  profile: PlayerProfile,
  moduleId: string,
  now: number,
): StartBuildResult {
  const def = findBaseModule(moduleId);
  if (!def) return { ok: false, reason: 'unknownModule' };
  if (isBuilding(profile, moduleId)) return { ok: false, reason: 'alreadyBuilding' };

  const next = nextLevelOf(profile, moduleId);
  if (!next) return { ok: false, reason: 'maxLevel' };
  if (unmetRequirements(profile, next).length > 0) {
    return { ok: false, reason: 'requirementsNotMet' };
  }
  if (profile.credits < next.costCredits) return { ok: false, reason: 'notEnoughCredits' };

  profile.credits -= next.costCredits;

  const seconds = (next.buildSeconds ?? 0) * META.timeScale;
  if (seconds <= 0) {
    applyLevel(profile, moduleId, next.level);
    return { ok: true, readyAt: now, instant: true };
  }

  const readyAt = now + seconds * 1000;
  profile.builds.push({ moduleId, targetLevel: next.level, readyAt });
  return { ok: true, readyAt };
}

export interface CompletedBuild {
  moduleId: string;
  moduleName: string;
  level: number;
  unlocks: string;
}

/**
 * Apply every build that has finished.
 *
 * Called on entering the base and after every raid, so time spent in a rift is
 * time the base was working.
 */
export function collectBuilds(profile: PlayerProfile, now: number): CompletedBuild[] {
  if (profile.builds.length === 0) return [];

  const done: CompletedBuild[] = [];
  const pending: BuildJob[] = [];

  for (const job of profile.builds) {
    if (job.readyAt > now) {
      pending.push(job);
      continue;
    }

    applyLevel(profile, job.moduleId, job.targetLevel);

    const def = findBaseModule(job.moduleId);
    const level = def?.levels.find((entry) => entry.level === job.targetLevel);
    done.push({
      moduleId: job.moduleId,
      moduleName: def?.name ?? job.moduleId,
      level: job.targetLevel,
      unlocks: level?.unlocks ?? '',
    });
  }

  profile.builds = pending;
  return done;
}

/** 0..1 progress of a build. Needs the level's duration, so it takes the job. */
export function buildProgress(job: BuildJob, now: number): number {
  const def = findBaseModule(job.moduleId);
  const level = def?.levels.find((entry) => entry.level === job.targetLevel);
  const totalMs = (level?.buildSeconds ?? 0) * META.timeScale * 1000;
  if (totalMs <= 0) return 1;
  const remaining = Math.max(0, job.readyAt - now);
  return Math.max(0, Math.min(1, 1 - remaining / totalMs));
}

export function secondsRemaining(job: { readyAt: number }, now: number): number {
  return Math.max(0, Math.ceil((job.readyAt - now) / 1000));
}

function applyLevel(profile: PlayerProfile, moduleId: string, level: number): void {
  profile.modules[moduleId] = level;
  // Upgrading the stash immediately widens the capacity limit.
  if (moduleId === 'base_stash') {
    profile.stash.capacityKg = stashCapacityFor(profile.modules);
  }
}
