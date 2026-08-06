/**
 * Procedural sound design.
 *
 * This is to audio what `PlaceholderFactory` is to art: every logical sound id
 * resolves to *something* audible, synthesised from a handful of parameters,
 * so development is never blocked waiting for a sound designer. When real
 * samples arrive they are registered against the same ids and take precedence,
 * exactly as a manifest entry overrides a placeholder texture (ADR-008).
 *
 * The vocabulary is deliberately small - noise, tone, sweep, and a filter - and
 * it turns out to be enough. A gunshot is a filtered noise burst with a fast
 * decay; a Rückstoß pulse is a falling sine with a long tail; a door is a low
 * thud plus a short scrape. What matters at this stage is not fidelity but
 * *distinguishability*: the player has to tell a reload from a jam without
 * looking, and that is a question of envelope and pitch, not of recording
 * quality.
 */

export type VoiceKind = 'noise' | 'tone' | 'sweep';

export interface VoiceDef {
  kind: VoiceKind;
  /** Seconds. Everything here is short - this is feedback, not music. */
  duration: number;
  /** Start and end frequency in Hz. A tone ignores `endHz`. */
  startHz: number;
  endHz?: number;
  /** Band-pass or low-pass cutoff for noise, in Hz. */
  filterHz?: number;
  filterQ?: number;
  /** Peak gain, 0..1, before the master volume. */
  gain: number;
  /** Seconds of attack. Zero is a click, which is right for an impact. */
  attack: number;
  /** Layered second voice, for sounds that need body and edge. */
  layer?: VoiceDef;
  /** Repeat count and spacing, for anything that reads as a rattle. */
  repeats?: number;
  repeatGapSeconds?: number;
}

/**
 * The catalogue.
 *
 * Grouped by what the sound has to *tell* the player, which is why a jam and a
 * dry fire sound related but not alike: both mean "no shot", and the player has
 * to know which without reading the HUD.
 */
export const VOICES: Record<string, VoiceDef> = {
  // ── Weapons ──────────────────────────────────────────────────────────────
  // Class is audible: an SMG is tight and mid, a marksman rifle is louder and
  // lower, a shotgun is broad and slow to decay.
  'weapon.fire.smg': {
    kind: 'noise',
    duration: 0.12,
    startHz: 0,
    filterHz: 1800,
    filterQ: 0.9,
    gain: 0.55,
    attack: 0.001,
    layer: { kind: 'sweep', duration: 0.09, startHz: 320, endHz: 90, gain: 0.4, attack: 0.001 },
  },
  'weapon.fire.marksman': {
    kind: 'noise',
    duration: 0.28,
    startHz: 0,
    filterHz: 1100,
    filterQ: 0.7,
    gain: 0.7,
    attack: 0.001,
    layer: { kind: 'sweep', duration: 0.22, startHz: 220, endHz: 48, gain: 0.55, attack: 0.001 },
  },
  'weapon.fire.shotgun': {
    kind: 'noise',
    duration: 0.34,
    startHz: 0,
    filterHz: 800,
    filterQ: 0.5,
    gain: 0.75,
    attack: 0.002,
    layer: { kind: 'sweep', duration: 0.3, startHz: 160, endHz: 40, gain: 0.6, attack: 0.002 },
  },
  // Mechanical, not explosive: three short metallic clicks.
  'weapon.reload': {
    kind: 'noise',
    duration: 0.05,
    startHz: 0,
    filterHz: 3200,
    filterQ: 4,
    gain: 0.3,
    attack: 0.001,
    repeats: 3,
    repeatGapSeconds: 0.13,
  },
  'weapon.dryfire': {
    kind: 'noise',
    duration: 0.04,
    startHz: 0,
    filterHz: 2600,
    filterQ: 6,
    gain: 0.28,
    attack: 0.001,
  },

  // ── Impacts and bodies ───────────────────────────────────────────────────
  'impact.flesh': {
    kind: 'noise',
    duration: 0.14,
    startHz: 0,
    filterHz: 420,
    filterQ: 1.4,
    gain: 0.4,
    attack: 0.002,
  },
  'impact.wall': {
    kind: 'noise',
    duration: 0.09,
    startHz: 0,
    filterHz: 2400,
    filterQ: 2.2,
    gain: 0.32,
    attack: 0.001,
  },
  'player.hurt': {
    kind: 'sweep',
    duration: 0.4,
    startHz: 210,
    endHz: 120,
    gain: 0.42,
    attack: 0.004,
    layer: { kind: 'noise', duration: 0.18, startHz: 0, filterHz: 600, gain: 0.3, attack: 0.002 },
  },
  'player.die': {
    kind: 'sweep',
    duration: 1.8,
    startHz: 180,
    endHz: 28,
    gain: 0.55,
    attack: 0.02,
  },
  'enemy.die': {
    kind: 'sweep',
    duration: 0.6,
    startHz: 260,
    endHz: 70,
    gain: 0.36,
    attack: 0.006,
  },
  // A rising two-tone: the one sound the player must never miss.
  'enemy.alert': {
    kind: 'sweep',
    duration: 0.3,
    startHz: 420,
    endHz: 700,
    gain: 0.34,
    attack: 0.01,
  },

  // ── Loot and interaction ─────────────────────────────────────────────────
  'loot.pickup': { kind: 'sweep', duration: 0.16, startHz: 620, endHz: 980, gain: 0.24, attack: 0.004 },
  'loot.denied': { kind: 'sweep', duration: 0.22, startHz: 300, endHz: 160, gain: 0.26, attack: 0.004 },
  'container.open': {
    kind: 'noise',
    duration: 0.4,
    startHz: 0,
    filterHz: 900,
    filterQ: 1.1,
    gain: 0.3,
    attack: 0.05,
  },

  // ── UI ───────────────────────────────────────────────────────────────────
  // Quiet and short. A menu that clicks loudly gets muted by the player, and a
  // muted game loses the sounds that actually matter.
  'ui.tap': { kind: 'tone', duration: 0.05, startHz: 660, gain: 0.14, attack: 0.002 },
  'ui.confirm': { kind: 'sweep', duration: 0.14, startHz: 520, endHz: 880, gain: 0.18, attack: 0.003 },
  'ui.deny': { kind: 'sweep', duration: 0.16, startHz: 340, endHz: 200, gain: 0.18, attack: 0.003 },

  // ── Extraction ───────────────────────────────────────────────────────────
  'extraction.open': { kind: 'sweep', duration: 1.1, startHz: 200, endHz: 520, gain: 0.34, attack: 0.08 },
  'extraction.progress': { kind: 'tone', duration: 0.08, startHz: 880, gain: 0.16, attack: 0.004 },
  'extraction.success': {
    kind: 'sweep',
    duration: 1.6,
    startHz: 320,
    endHz: 760,
    gain: 0.42,
    attack: 0.06,
    layer: { kind: 'tone', duration: 1.2, startHz: 480, gain: 0.2, attack: 0.2 },
  },

  // ── Anomalies ────────────────────────────────────────────────────────────
  // The identity sounds. Each matches its field's *kind of problem*: the
  // Stillstand drags downward, the Rückstoß hits and rings, the echo is a
  // ghost of a footstep.
  'anomaly.enter': { kind: 'sweep', duration: 1.4, startHz: 460, endHz: 150, gain: 0.3, attack: 0.15 },
  'anomaly.exit': { kind: 'sweep', duration: 0.9, startHz: 180, endHz: 420, gain: 0.24, attack: 0.1 },
  'anomaly.pulse': {
    kind: 'sweep',
    duration: 0.9,
    startHz: 140,
    endHz: 36,
    gain: 0.6,
    attack: 0.004,
    layer: { kind: 'noise', duration: 0.5, startHz: 0, filterHz: 320, gain: 0.36, attack: 0.002 },
  },
  'anomaly.echo': {
    kind: 'noise',
    duration: 0.3,
    startHz: 0,
    filterHz: 1400,
    filterQ: 3.5,
    gain: 0.2,
    attack: 0.03,
  },

  // ── Doors ────────────────────────────────────────────────────────────────
  'door.open': {
    kind: 'noise',
    duration: 0.5,
    startHz: 0,
    filterHz: 520,
    filterQ: 1.2,
    gain: 0.34,
    attack: 0.03,
    layer: { kind: 'sweep', duration: 0.22, startHz: 120, endHz: 60, gain: 0.3, attack: 0.004 },
  },
  'door.locked': {
    kind: 'noise',
    duration: 0.09,
    startHz: 0,
    filterHz: 1600,
    filterQ: 5,
    gain: 0.34,
    attack: 0.001,
    repeats: 2,
    repeatGapSeconds: 0.1,
  },
};

/** Fallback for a sound id that has no voice yet - audible, and obviously placeholder. */
export const FALLBACK_VOICE: VoiceDef = {
  kind: 'tone',
  duration: 0.06,
  startHz: 440,
  gain: 0.12,
  attack: 0.003,
};

export function voiceFor(id: string): VoiceDef {
  return VOICES[id] ?? FALLBACK_VOICE;
}

/**
 * Ambience beds.
 *
 * A slow-moving filtered noise floor. Half this game's atmosphere is audio
 * (docs/00-VISION.md), and most of that half is the sound of a room being
 * empty - not the sound of anything happening in it.
 */
export interface AmbienceDef {
  /** Low-pass cutoff of the noise floor. */
  filterHz: number;
  gain: number;
  /** How far the cutoff drifts, and how slowly - this is what stops it droning. */
  driftHz: number;
  driftSeconds: number;
}

export const AMBIENCES: Record<string, AmbienceDef> = {
  base: { filterHz: 260, gain: 0.06, driftHz: 80, driftSeconds: 17 },
  raid: { filterHz: 190, gain: 0.09, driftHz: 120, driftSeconds: 23 },
  menu: { filterHz: 320, gain: 0.05, driftHz: 60, driftSeconds: 29 },
};
