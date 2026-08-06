/**
 * M7: procedural sound design.
 *
 * The synthesis itself needs a browser to test; what *can* be tested here is
 * the catalogue, and the catalogue is where the mistakes live. A voice with a
 * zero duration is silence, a gain above 1 is distortion, and a missing entry
 * is a sound the player never hears.
 */

import { describe, expect, it } from 'vitest';
import { AMBIENCES, FALLBACK_VOICE, VOICES, voiceFor, type VoiceDef } from './synthVoices';
import type { SoundId } from './audioService';

/** Every id the game can actually ask for. Mirrors the `SoundId` union. */
const ALL_SOUND_IDS: readonly SoundId[] = [
  'weapon.fire.smg',
  'weapon.fire.marksman',
  'weapon.fire.shotgun',
  'weapon.reload',
  'weapon.dryfire',
  'impact.flesh',
  'impact.wall',
  'player.hurt',
  'player.die',
  'enemy.die',
  'enemy.alert',
  'loot.pickup',
  'loot.denied',
  'container.open',
  'ui.tap',
  'ui.confirm',
  'ui.deny',
  'extraction.open',
  'extraction.progress',
  'extraction.success',
  'anomaly.enter',
  'anomaly.exit',
  'anomaly.pulse',
  'anomaly.echo',
  'door.open',
  'door.locked',
];

function everyVoice(): VoiceDef[] {
  const all: VoiceDef[] = [];
  for (const voice of Object.values(VOICES)) {
    all.push(voice);
    if (voice.layer) all.push(voice.layer);
  }
  return all;
}

describe('the voice catalogue', () => {
  it('has a voice for every sound the game can play', () => {
    for (const id of ALL_SOUND_IDS) {
      expect(VOICES[id], `${id} has no voice`).toBeDefined();
    }
  });

  it('falls back audibly for an unknown id', () => {
    // A missing sound should be a placeholder, never silence - silence is
    // indistinguishable from a bug.
    expect(voiceFor('does.not.exist')).toBe(FALLBACK_VOICE);
    expect(FALLBACK_VOICE.gain).toBeGreaterThan(0);
  });

  it('never distorts and never lasts', () => {
    for (const voice of everyVoice()) {
      expect(voice.gain).toBeGreaterThan(0);
      // Above 1 clips before the compressor can help.
      expect(voice.gain).toBeLessThanOrEqual(1);
      expect(voice.duration).toBeGreaterThan(0);
      // This is feedback, not music. Two seconds is already a long death.
      expect(voice.duration).toBeLessThanOrEqual(2);
      expect(voice.attack).toBeGreaterThanOrEqual(0);
      expect(voice.attack).toBeLessThan(voice.duration);
    }
  });

  it('keeps every frequency inside the audible range', () => {
    for (const voice of everyVoice()) {
      if (voice.kind !== 'noise') {
        expect(voice.startHz).toBeGreaterThan(20);
        expect(voice.startHz).toBeLessThan(18000);
      }
      if (voice.endHz !== undefined) {
        // The synthesiser ramps exponentially, which cannot reach or cross zero.
        expect(voice.endHz).toBeGreaterThan(20);
      }
      if (voice.filterHz !== undefined) {
        expect(voice.filterHz).toBeGreaterThan(0);
        expect(voice.filterHz).toBeLessThan(20000);
      }
    }
  });

  it('keeps the UI quieter than the world', () => {
    // A menu that clicks loudly gets the whole game muted, and then the sounds
    // that matter go with it.
    const loudestUi = Math.max(
      ...['ui.tap', 'ui.confirm', 'ui.deny'].map((id) => VOICES[id]?.gain ?? 0),
    );
    const gunshot = VOICES['weapon.fire.smg']?.gain ?? 0;
    expect(loudestUi).toBeLessThan(gunshot * 0.5);
  });

  it('gives the three weapon classes distinguishable voices', () => {
    const smg = VOICES['weapon.fire.smg'];
    const marksman = VOICES['weapon.fire.marksman'];
    const shotgun = VOICES['weapon.fire.shotgun'];

    // A player has to tell them apart without looking: louder and longer as
    // the calibre grows, darker as it does.
    expect(marksman?.gain).toBeGreaterThan(smg?.gain ?? 1);
    expect(shotgun?.duration).toBeGreaterThan(smg?.duration ?? 1);
    expect(shotgun?.filterHz).toBeLessThan(smg?.filterHz ?? 0);
  });

  it('spaces out repeated voices so they read as separate hits', () => {
    for (const voice of everyVoice()) {
      if (!voice.repeats) continue;
      expect(voice.repeatGapSeconds ?? 0).toBeGreaterThan(0);
      expect(voice.repeats).toBeLessThanOrEqual(5);
    }
  });
});

describe('ambience', () => {
  it('stays under every one-shot, because it is a floor and not an event', () => {
    const quietestOneShot = Math.min(...everyVoice().map((voice) => voice.gain));
    for (const ambience of Object.values(AMBIENCES)) {
      expect(ambience.gain).toBeLessThan(quietestOneShot);
      expect(ambience.gain).toBeGreaterThan(0);
      // Without drift the bed is a drone, and a drone is the first thing a
      // player mutes.
      expect(ambience.driftHz).toBeGreaterThan(0);
      expect(ambience.driftSeconds).toBeGreaterThan(5);
    }
  });

  it('covers every place the game can be', () => {
    for (const id of ['menu', 'base', 'raid']) {
      expect(AMBIENCES[id], id).toBeDefined();
    }
  });
});
