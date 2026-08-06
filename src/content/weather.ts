/**
 * Weather.
 *
 * A rift stitches worlds together, so the sky over one fragment has no reason
 * to match the next. Mechanically, weather is a single dial that turns the same
 * map into a different raid: how far anyone can see, how far sound carries, and
 * how dark it is.
 *
 * The design rule is that weather is never purely bad. Fog hides the player as
 * much as it hides the enemy; a rift pulse blinds everyone. What changes is
 * *which* approach the raid rewards.
 */

export type WeatherId = 'clear' | 'fog' | 'storm' | 'riftpulse' | 'night';

export interface WeatherDef {
  id: WeatherId;
  name: string;
  /** Multiplier on every actor's vision range, the player's light included. */
  visionMultiplier: number;
  /** Multiplier on how far sound carries. */
  hearingMultiplier: number;
  /** Ambient light multiplier, 0 = pitch black, 1 = as authored. */
  lightMultiplier: number;
  /** Screen tint as 0xRRGGBB. */
  tint: number;
  /** 0..1, drives the renderer's particle density. */
  particleDensity: number;
  weight: number;
  /** One line for the briefing screen. */
  briefing: string;
}

export const WEATHER = {
  clear: {
    id: 'clear',
    name: 'Klar',
    visionMultiplier: 1,
    hearingMultiplier: 1,
    lightMultiplier: 1,
    tint: 0xffffff,
    particleDensity: 0,
    weight: 30,
    briefing: 'Ruhige Sicht. Keine Besonderheiten gemeldet.',
  },

  /** Cuts sight for everyone. Rewards moving quietly and close. */
  fog: {
    id: 'fog',
    name: 'Nebel',
    visionMultiplier: 0.55,
    hearingMultiplier: 1.1,
    lightMultiplier: 0.85,
    tint: 0xb8c4d4,
    particleDensity: 0.7,
    weight: 20,
    briefing: 'Dichter Nebel. Sichtweiten stark reduziert, Geräusche tragen weiter.',
  },

  /** Drowns sound. Rewards aggression - nobody hears you coming, or leaving. */
  storm: {
    id: 'storm',
    name: 'Sturm',
    visionMultiplier: 0.8,
    hearingMultiplier: 0.5,
    lightMultiplier: 0.7,
    tint: 0x8fa0b8,
    particleDensity: 1,
    weight: 16,
    briefing: 'Sturm. Er schluckt Geräusche - deine wie ihre.',
  },

  /** The rift breathing. Everything is worse, and the loot knows it. */
  riftpulse: {
    id: 'riftpulse',
    name: 'Riss-Puls',
    visionMultiplier: 0.7,
    hearingMultiplier: 0.85,
    lightMultiplier: 0.5,
    tint: 0x38e1d4,
    particleDensity: 0.5,
    weight: 12,
    briefing: 'Der Riss pulsiert. Anomalien sind aktiver als sonst.',
  },

  /** Darkness. The flashlight becomes essential - and visible from far away. */
  night: {
    id: 'night',
    name: 'Nachtseite',
    visionMultiplier: 0.6,
    hearingMultiplier: 1.15,
    lightMultiplier: 0.32,
    tint: 0x5a6b8c,
    particleDensity: 0.15,
    weight: 22,
    briefing: 'Nachtseite des Fragments. Ohne Licht siehst du nichts - mit Licht sehen sie dich.',
  },
} as const satisfies Record<WeatherId, WeatherDef>;

export const ALL_WEATHER_IDS = Object.keys(WEATHER) as WeatherId[];

export function getWeather(id: WeatherId): WeatherDef {
  return WEATHER[id];
}

export function findWeather(id: string): WeatherDef | undefined {
  return (WEATHER as Record<string, WeatherDef>)[id];
}
