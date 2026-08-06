/**
 * Balance overlay — changing numbers without shipping an app update.
 *
 * `balance.ts` holds the defaults and is the only place tunables live
 * (ADR-010). This module lets a validated patch sit on top of them, which is
 * what makes the roadmap's "Balancing über Remote-Config statt App-Update"
 * possible: a review cycle is days, and a weapon that is 15 % too strong should
 * not cost days.
 *
 * Three rules make that safe rather than reckless (ADR-018):
 *
 * 1. **A patch may only move numbers that already exist.** Unknown groups and
 *    unknown keys are rejected, not created. A typo cannot invent a constant
 *    that nothing reads and then be wondered about for a week.
 * 2. **A patch may not move them far.** Every value stays within a factor of
 *    `MAX_FACTOR` of its default and keeps its sign. A config that sets
 *    `PLAYER.maxHealth` to 0 is not a balance change, it is an outage.
 * 3. **A patch applies once, at boot.** The simulation reads these numbers
 *    every tick and is deterministic per seed (ADR-009); changing them mid-raid
 *    would make a raid unreproducible from its seed.
 */

import {
  AI,
  ANOMALY,
  ARMOR,
  CAMERA,
  COMBAT,
  DOORS,
  ECONOMY,
  ENCUMBRANCE,
  HIT_ZONES,
  INPUT,
  LIGHT,
  LOOT,
  MAP,
  MELEE,
  META,
  PLAYER,
  RAID,
  THROWABLE,
  WEAPON,
} from './balance';

/**
 * The groups a patch may address.
 *
 * Written out rather than derived, because "everything exported from
 * balance.ts" would silently expose whatever is added there next. A new group
 * becomes remotely tunable when someone decides it should be.
 */
const GROUPS: Readonly<Record<string, object>> = {
  PLAYER,
  ENCUMBRANCE,
  COMBAT,
  WEAPON,
  ARMOR,
  HIT_ZONES,
  THROWABLE,
  MELEE,
  AI,
  RAID,
  MAP,
  LOOT,
  ECONOMY,
  META,
  DOORS,
  LIGHT,
  ANOMALY,
  INPUT,
  CAMERA,
};

/**
 * How far a value may move from its default, in either direction.
 *
 * Five is wide enough for any balance decision anyone would actually make and
 * narrow enough that no single number can take the game apart. It is a
 * blast radius, not a design constraint.
 */
export const MAX_FACTOR = 5;

/** The unpatched state, captured before anything can have modified it. */
const PRISTINE: Readonly<Record<string, Readonly<Record<string, number>>>> = snapshot();

export interface AppliedChange {
  group: string;
  key: string;
  from: number;
  to: number;
}

export interface RejectedChange {
  group: string;
  key: string;
  reason: 'unknownGroup' | 'unknownKey' | 'notANumber' | 'notTunable' | 'outOfRange';
}

export interface OverlayReport {
  /** The patch's own version string, or `null` when it carried none. */
  version: string | null;
  applied: AppliedChange[];
  rejected: RejectedChange[];
}

let activeVersion: string | null = null;

/**
 * The identity of the numbers currently in force.
 *
 * Stamped onto every telemetry record. `'default'` means the shipped values;
 * anything else names the patch that changed them, so a shift in the
 * extraction rate can be attributed rather than guessed at.
 */
export function balanceVersion(): string {
  return activeVersion ?? 'default';
}

/**
 * Validate a patch and apply what survives.
 *
 * Takes `unknown` on purpose: this is the boundary where data of unknown
 * provenance — a fetched file, a pasted string — becomes numbers the
 * simulation trusts. Nothing downstream re-checks it, so everything is checked
 * here.
 *
 * Partial application is deliberate. A patch with one bad key still delivers
 * its other nineteen; the report says exactly what was dropped and why.
 */
export function applyBalanceOverlay(patch: unknown): OverlayReport {
  const report: OverlayReport = { version: null, applied: [], rejected: [] };
  if (typeof patch !== 'object' || patch === null) return report;

  const source = patch as Record<string, unknown>;
  const version = source['version'];
  if (typeof version === 'string' && version.length > 0) report.version = version;

  for (const [groupName, groupPatch] of Object.entries(source)) {
    if (groupName === 'version') continue;

    const group = GROUPS[groupName];
    if (group === undefined) {
      report.rejected.push({ group: groupName, key: '*', reason: 'unknownGroup' });
      continue;
    }
    if (typeof groupPatch !== 'object' || groupPatch === null) {
      report.rejected.push({ group: groupName, key: '*', reason: 'notANumber' });
      continue;
    }

    const defaults = PRISTINE[groupName] ?? {};
    const target = group as Record<string, number>;

    for (const [key, raw] of Object.entries(groupPatch as Record<string, unknown>)) {
      if (!(key in target)) {
        report.rejected.push({ group: groupName, key, reason: 'unknownKey' });
        continue;
      }
      // A key that exists but is an array or a nested object - `MAP.
      // prefabsPerFragment`, `ECONOMY.reputationTiers`. Patching structure
      // rather than magnitude is a code change, not a config change.
      if (!(key in defaults)) {
        report.rejected.push({ group: groupName, key, reason: 'notTunable' });
        continue;
      }
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        report.rejected.push({ group: groupName, key, reason: 'notANumber' });
        continue;
      }

      const base = defaults[key] as number;
      if (!withinRange(base, raw)) {
        report.rejected.push({ group: groupName, key, reason: 'outOfRange' });
        continue;
      }

      const from = target[key] as number;
      target[key] = raw;
      report.applied.push({ group: groupName, key, from, to: raw });
    }
  }

  if (report.applied.length > 0) activeVersion = report.version ?? 'custom';
  return report;
}

/**
 * Is this value a balance change or an outage?
 *
 * A default of 0 has no scale, so no factor can be derived from it; such a
 * value is accepted on finiteness and sign alone. There are only a handful
 * (`PLAYER.healthRegenPerSecond` among them) and none of them can brick the
 * game by growing.
 */
function withinRange(base: number, value: number): boolean {
  if (base === 0) return value >= 0;
  if (base > 0 && value <= 0) return false;
  return value >= base / MAX_FACTOR && value <= base * MAX_FACTOR;
}

/** Restore every default. Used by tests, and by "Balance zurücksetzen". */
export function resetBalance(): void {
  for (const [groupName, defaults] of Object.entries(PRISTINE)) {
    const target = GROUPS[groupName] as Record<string, number> | undefined;
    if (!target) continue;
    for (const [key, value] of Object.entries(defaults)) target[key] = value;
  }
  activeVersion = null;
}

/** Every numeric leaf, by group. The patchable surface, and the test's oracle. */
export function snapshot(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [groupName, group] of Object.entries(GROUPS)) {
    const values: Record<string, number> = {};
    for (const [key, value] of Object.entries(group)) {
      if (typeof value === 'number') values[key] = value;
    }
    out[groupName] = values;
  }
  return out;
}
