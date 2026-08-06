/**
 * The five anomalies.
 *
 * These are the most important identity mechanic in the game (docs/00-VISION.md).
 * They are why maps change, why equipment fails and why the world feels wrong
 * rather than merely dangerous - and each one is deliberately a different
 * *kind* of problem, not five variations of "damage over time":
 *
 *   Stillstand    slows - a movement problem
 *   Flüstern      blinds your instruments - an information problem
 *   Rückstoß      shoves and hurts in pulses - a timing problem
 *   Bleiche       drains silently - a problem you notice too late
 *   Echo-Schatten harmless, and it tells you who was here - a gift with a catch
 *
 * Every one of them sits next to something worth taking. That is the whole
 * design: the reward is inside the thing that wants you gone.
 */

export type AnomalyKind = 'stillness' | 'whisper' | 'recoil' | 'bleach' | 'echoshadow';

export interface AnomalyDef {
  kind: AnomalyKind;
  name: string;
  /** Base radius in metres; the generator varies it slightly. */
  radius: number;
  /** Fraction of the radius that counts as the lethal or intense core. */
  coreFraction: number;
  /** Colour used by the renderer, 0xRRGGBB. */
  color: number;
  /** How strongly the AI avoids routing through this field, 0 = ignores it. */
  avoidance: number;
  description: string;
}

export const ANOMALIES = {
  /**
   * Stillstand.
   * Slows everything inside, projectiles included. Watching a round crawl
   * through the field is the clearest possible signal of what it does.
   */
  stillness: {
    kind: 'stillness',
    name: 'Stillstand',
    radius: 4.5,
    coreFraction: 0.35,
    color: 0x38e1d4,
    avoidance: 0.7,
    description: 'Verlangsamt alles im Radius, auch Geschosse. Der Kern ist tödlich.',
  },

  /**
   * Flüstern.
   * Does no damage at all. It takes away the minimap, the ammo counter and the
   * extraction markers - which on a small screen is worse than damage, because
   * the player suddenly has to remember instead of read.
   */
  whisper: {
    kind: 'whisper',
    name: 'Flüstern',
    radius: 6.5,
    coreFraction: 0.5,
    color: 0xa96bff,
    avoidance: 0.2,
    description: 'Stört Elektronik. Minimap, Munitionsanzeige und Marker fallen aus.',
  },

  /**
   * Rückstoß.
   * Pulses on a fixed rhythm, shoving everything outward and hurting whatever
   * is close. Crossing it is possible - between two pulses.
   */
  recoil: {
    kind: 'recoil',
    name: 'Rückstoß',
    radius: 5.5,
    coreFraction: 0.4,
    color: 0xffb13d,
    avoidance: 0.9,
    description: 'Stößt in Wellen alles von sich weg. Wer zu nah ist, wird beschädigt.',
  },

  /**
   * Bleiche.
   * The quiet one. No push, no slow, no sound - just health leaving. The only
   * warning is the desaturation at the edge of the screen, and a player in a
   * hurry will miss it.
   */
  bleach: {
    kind: 'bleach',
    name: 'Bleiche',
    radius: 7,
    coreFraction: 0.6,
    color: 0xc9d1de,
    avoidance: 0.85,
    description: 'Entzieht lautlos Lebensenergie. Man merkt es meist zu spät.',
  },

  /**
   * Echo-Schatten.
   * Harmless, and genuinely useful: it replays what walked through it, so the
   * player learns who came this way. The catch is that enemies see the echoes
   * too and go to investigate them - which can be a warning or a weapon,
   * depending on who is standing where.
   */
  echoshadow: {
    kind: 'echoshadow',
    name: 'Echo-Schatten',
    radius: 8,
    coreFraction: 0.3,
    color: 0x5be37a,
    avoidance: 0,
    description: 'Spiegelt vergangene Bewegungen. Auch Gegner folgen dem, was sie sehen.',
  },
} as const satisfies Record<AnomalyKind, AnomalyDef>;

export const ALL_ANOMALY_KINDS = Object.keys(ANOMALIES) as AnomalyKind[];

export function getAnomaly(kind: AnomalyKind): AnomalyDef {
  return ANOMALIES[kind];
}

export function findAnomaly(kind: string): AnomalyDef | undefined {
  return (ANOMALIES as Record<string, AnomalyDef>)[kind];
}

/**
 * Weighted pick table for map generation.
 *
 * Stillstand stays the most common: it is the one the player learns first, and
 * a rift full of Bleiche would simply be unfair.
 */
export const ANOMALY_WEIGHTS: ReadonlyArray<{ kind: AnomalyKind; weight: number }> = [
  { kind: 'stillness', weight: 30 },
  { kind: 'whisper', weight: 22 },
  { kind: 'recoil', weight: 18 },
  { kind: 'bleach', weight: 14 },
  { kind: 'echoshadow', weight: 16 },
];
