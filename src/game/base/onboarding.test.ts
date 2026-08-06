/**
 * M7: onboarding.
 *
 * The whole system is one rule - a hint fires once, ever - so the tests are
 * about that rule holding across raids, across saves, and across content
 * changes.
 */

import { describe, expect, it } from 'vitest';
import { ALL_HINT_IDS, HINTS, hintFor } from '@/content/hints';
import { createDefaultProfile } from './profile';
import { hasSeenHint, isNewPlayer, resetHints, takeHint } from './onboarding';

describe('hints', () => {
  it('fires once and never again', () => {
    const profile = createDefaultProfile();

    const first = takeHint(profile, 'firstDamage');
    expect(first).not.toBeNull();
    expect(hasSeenHint(profile, first?.id ?? '')).toBe(true);

    // Same raid, next raid, next week - it does not matter.
    expect(takeHint(profile, 'firstDamage')).toBeNull();
    expect(takeHint(profile, 'firstDamage')).toBeNull();
  });

  it('keeps hints independent of each other', () => {
    const profile = createDefaultProfile();
    takeHint(profile, 'firstDamage');
    expect(takeHint(profile, 'firstLoot')).not.toBeNull();
  });

  it('survives a save round trip', () => {
    const profile = createDefaultProfile();
    takeHint(profile, 'firstAnomaly');

    const restored = JSON.parse(JSON.stringify(profile)) as typeof profile;
    expect(takeHint(restored, 'firstAnomaly')).toBeNull();
  });

  it('can be replayed from scratch', () => {
    const profile = createDefaultProfile();
    takeHint(profile, 'raidStarted');
    resetHints(profile);
    expect(takeHint(profile, 'raidStarted')).not.toBeNull();
  });

  it('recognises a new player', () => {
    const profile = createDefaultProfile();
    expect(isNewPlayer(profile)).toBe(true);

    profile.stats.extractions = 1;
    expect(isNewPlayer(profile)).toBe(false);
  });
});

describe('hint content', () => {
  it('has a unique id per hint and no duplicate triggers', () => {
    expect(new Set(ALL_HINT_IDS).size).toBe(ALL_HINT_IDS.length);
    const triggers = HINTS.map((hint) => hint.trigger);
    expect(new Set(triggers).size).toBe(triggers.length);
  });

  it('is readable in the time it is on screen', () => {
    for (const hint of HINTS) {
      // Roughly 15 characters a second, mid-fight, on a phone. A hint the
      // player cannot finish reading has spent its one chance for nothing.
      expect(hint.text.length / hint.seconds, hint.id).toBeLessThan(20);
      expect(hint.seconds, hint.id).toBeGreaterThanOrEqual(4);
    }
  });

  it('tells the player what to do rather than what happened', () => {
    // Not enforceable in general, but the failure mode is: a hint that merely
    // narrates. These are the words that show up when that happens.
    for (const hint of HINTS) {
      expect(hint.text.toLowerCase(), hint.id).not.toContain('du wurdest getroffen');
      expect(hint.text.length, hint.id).toBeGreaterThan(20);
    }
  });

  it('resolves every trigger the app can raise', () => {
    const triggers = [
      'raidStarted',
      'firstContact',
      'firstDamage',
      'firstContainer',
      'firstLoot',
      'overweight',
      'firstAnomaly',
      'firstLockedDoor',
      'firstJam',
      'extractionOpened',
      'lowHealth',
      'firstBoss',
      'timeWarning',
    ] as const;

    for (const trigger of triggers) {
      expect(hintFor(trigger), trigger).toBeDefined();
    }
  });
});
