import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { AI, MAP, META, PLAYER, RAID } from './balance';
import {
  MAX_FACTOR,
  applyBalanceOverlay,
  balanceVersion,
  resetBalance,
  snapshot,
} from './balanceOverlay';

/** Every `.ts` file under a directory, excluding tests. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) out.push(path);
  }
  return out;
}

afterEach(() => resetBalance());

describe('applyBalanceOverlay', () => {
  it('applies a value the simulation then reads', () => {
    const before = PLAYER.baseSpeed;
    const report = applyBalanceOverlay({ version: '2026.1', PLAYER: { baseSpeed: before * 1.2 } });

    expect(report.applied).toEqual([
      { group: 'PLAYER', key: 'baseSpeed', from: before, to: before * 1.2 },
    ]);
    expect(report.rejected).toEqual([]);
    expect(PLAYER.baseSpeed).toBeCloseTo(before * 1.2);
  });

  it('names the active version so telemetry can attribute a shift', () => {
    expect(balanceVersion()).toBe('default');
    applyBalanceOverlay({ version: '2026.1', RAID: { durationSeconds: RAID.durationSeconds * 1.1 } });
    expect(balanceVersion()).toBe('2026.1');
  });

  it('does not claim a version when nothing was applied', () => {
    applyBalanceOverlay({ version: '2026.1', NONSENSE: { x: 1 } });
    expect(balanceVersion()).toBe('default');
  });

  it('falls back to "custom" for a patch that carries no version', () => {
    applyBalanceOverlay({ PLAYER: { baseSpeed: PLAYER.baseSpeed * 1.1 } });
    expect(balanceVersion()).toBe('custom');
  });

  it('restores every default on reset', () => {
    const pristine = snapshot();
    applyBalanceOverlay({
      PLAYER: { baseSpeed: 6, maxHealth: 140 },
      AI: { allyAlertRadius: AI.allyAlertRadius * 2 },
    });
    resetBalance();
    expect(snapshot()).toEqual(pristine);
    expect(balanceVersion()).toBe('default');
  });
});

describe('rejection', () => {
  it('rejects an unknown group rather than creating one', () => {
    const report = applyBalanceOverlay({ WEATHER: { fogDensity: 2 } });
    expect(report.rejected).toEqual([{ group: 'WEATHER', key: '*', reason: 'unknownGroup' }]);
  });

  it('rejects an unknown key rather than creating one', () => {
    const report = applyBalanceOverlay({ PLAYER: { basSpeed: 5 } });
    expect(report.rejected).toEqual([{ group: 'PLAYER', key: 'basSpeed', reason: 'unknownKey' }]);
    expect('basSpeed' in PLAYER).toBe(false);
  });

  it('rejects a key that exists but is not a number', () => {
    // MAP.prefabsPerFragment is { min, max } and META.reputationTiers is an
    // array. Both are structure, and structure is a code change.
    expect(applyBalanceOverlay({ MAP: { prefabsPerFragment: 4 } }).rejected).toEqual([
      { group: 'MAP', key: 'prefabsPerFragment', reason: 'notTunable' },
    ]);
    expect(applyBalanceOverlay({ META: { reputationTiers: 5 } }).rejected).toEqual([
      { group: 'META', key: 'reputationTiers', reason: 'notTunable' },
    ]);
    expect(MAP.prefabsPerFragment).toEqual({ min: 1, max: 3 });
    expect(META.reputationTiers).toEqual([0, 300, 900, 2000]);
  });

  it.each([
    ['a string', 'schnell'],
    ['null', null],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects %s as a value', (_label, value) => {
    const report = applyBalanceOverlay({ PLAYER: { baseSpeed: value } });
    expect(report.rejected).toEqual([{ group: 'PLAYER', key: 'baseSpeed', reason: 'notANumber' }]);
  });

  it('refuses to zero out a positive constant', () => {
    const report = applyBalanceOverlay({ PLAYER: { maxHealth: 0 } });
    expect(report.rejected[0]?.reason).toBe('outOfRange');
    expect(PLAYER.maxHealth).toBeGreaterThan(0);
  });

  it.each([
    ['far above', MAX_FACTOR * 2],
    ['far below', 1 / (MAX_FACTOR * 2)],
  ])('refuses a value %s the default', (_label, factor) => {
    const report = applyBalanceOverlay({ RAID: { durationSeconds: RAID.durationSeconds * factor } });
    expect(report.rejected[0]?.reason).toBe('outOfRange');
  });

  it.each([
    ['the upper bound', MAX_FACTOR],
    ['the lower bound', 1 / MAX_FACTOR],
  ])('accepts exactly %s', (_label, factor) => {
    const target = RAID.durationSeconds * factor;
    const report = applyBalanceOverlay({ RAID: { durationSeconds: target } });
    expect(report.rejected).toEqual([]);
    expect(RAID.durationSeconds).toBeCloseTo(target);
  });

  it('allows a zero default to grow, since zero has no scale', () => {
    const report = applyBalanceOverlay({ PLAYER: { healthRegenPerSecond: 1.5 } });
    expect(report.rejected).toEqual([]);
    expect(PLAYER.healthRegenPerSecond).toBe(1.5);
  });

  it('still applies the good keys of a partly bad patch', () => {
    const speed = PLAYER.baseSpeed;
    const report = applyBalanceOverlay({
      PLAYER: { baseSpeed: speed * 1.1, maxHealth: 0, nonsense: 3 },
    });
    expect(report.applied).toHaveLength(1);
    expect(report.rejected).toHaveLength(2);
    expect(PLAYER.baseSpeed).toBeCloseTo(speed * 1.1);
  });

  it.each([
    ['a JSON string', '{"PLAYER":{"baseSpeed":5}}'],
    ['null', null],
    ['an array', [1, 2, 3]],
    ['a number', 42],
  ])('survives %s without applying anything', (_label, patch) => {
    const pristine = snapshot();
    const report = applyBalanceOverlay(patch);
    expect(report.applied).toEqual([]);
    expect(snapshot()).toEqual(pristine);
  });

  it('rejects a group whose patch is not an object', () => {
    expect(applyBalanceOverlay({ PLAYER: 5 }).rejected).toEqual([
      { group: 'PLAYER', key: '*', reason: 'notANumber' },
    ]);
  });
});

/**
 * The trap this whole mechanism can fall into.
 *
 * An overlay is applied at boot and mutates the objects in `balance.ts`. Any
 * module that copies a value into its own constant at load time keeps the old
 * number forever, and the patch appears to work everywhere except in that one
 * place — the worst kind of bug, because the config is provably correct.
 *
 * `loadoutScreen.ts` did exactly this with `META.insuranceReturnChance` until
 * this test was written.
 */
describe('no module copies a balance value at load time', () => {
  const GROUP_NAMES = Object.keys(snapshot()).join('|');
  const CAPTURE = new RegExp(`^const\\s+\\w+\\s*=\\s*(${GROUP_NAMES})\\.\\w+\\s*;`, 'm');

  it('reads them inline instead', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(process.cwd(), 'src'))) {
      if (file.endsWith('balanceOverlay.ts')) continue;
      const match = CAPTURE.exec(readFileSync(file, 'utf8'));
      if (match) offenders.push(`${file.replace(process.cwd() + '/', '')}: ${match[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
