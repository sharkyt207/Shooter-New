/**
 * Audio behind an interface.
 *
 * The prototype ships `NullAudio`: the full call surface exists and is wired
 * up throughout the game, but nothing plays. When real audio lands in M7 it is
 * one new adapter, not a hunt through the codebase for the right places to add
 * sound. Audio carries half this game's atmosphere (docs/00-VISION.md), so its
 * seams are worth getting right early.
 */

export type SoundId =
  | 'weapon.fire.smg'
  | 'weapon.fire.marksman'
  | 'weapon.fire.shotgun'
  | 'weapon.reload'
  | 'weapon.dryfire'
  | 'impact.flesh'
  | 'impact.wall'
  | 'player.hurt'
  | 'player.die'
  | 'enemy.die'
  | 'enemy.alert'
  | 'loot.pickup'
  | 'loot.denied'
  | 'container.open'
  | 'ui.tap'
  | 'ui.confirm'
  | 'ui.deny'
  | 'extraction.open'
  | 'extraction.progress'
  | 'extraction.success'
  | 'anomaly.enter'
  | 'anomaly.exit'
  | 'anomaly.pulse'
  | 'anomaly.echo'
  | 'door.open'
  | 'door.locked';

export interface PlayOptions {
  /** 0..1 */
  volume?: number;
  /** Playback rate; used for cheap variation so repeats do not fatigue. */
  rate?: number;
  /** World position, for panning and distance attenuation. */
  x?: number;
  y?: number;
}

export interface AudioService {
  readonly name: string;
  play(id: SoundId, options?: PlayOptions): void;
  /** Cross-fade the ambient bed, e.g. when entering a different biome. */
  setAmbience(id: string | null): void;
  /** Where the listener is, for positional audio. */
  setListener(x: number, y: number): void;
  setMasterVolume(volume: number): void;
  suspend(): void;
  resume(): void;
}

/** No-op implementation used until M7. */
export class NullAudio implements AudioService {
  readonly name = 'null';

  play(): void {
    /* intentionally silent */
  }

  setAmbience(): void {
    /* intentionally silent */
  }

  setListener(): void {
    /* intentionally silent */
  }

  setMasterVolume(): void {
    /* intentionally silent */
  }

  suspend(): void {
    /* intentionally silent */
  }

  resume(): void {
    /* intentionally silent */
  }
}
