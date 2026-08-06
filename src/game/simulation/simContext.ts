/**
 * Shared context handed to every system.
 *
 * Systems are plain functions `(ctx) => void`. Passing one context object keeps
 * their signatures uniform and makes the execution order in `raidSimulation`
 * the single source of truth about how a tick unfolds.
 */

import type { EventBus } from '@/core/events/eventBus';
import type { RandomStreams } from '@/core/math/random';
import type { EntityId } from '@/core/ecs/entity';
import type { FactionId } from '@/game/components';
import type { GameEvents, RaidOutcomeKind } from '@/game/gameEvents';
import type { MapGrid } from '@/game/map/mapGrid';
import type { PlayerIntent } from '@/game/player/playerIntent';
import type { RaidWorld } from './raidWorld';

/**
 * A sound made this tick. Enemies check these during perception, which is what
 * turns "I fired a gun" into "they know roughly where I am".
 */
export interface NoiseEvent {
  x: number;
  y: number;
  radius: number;
  /** Who made the noise - an enemy does not investigate its own faction's shots. */
  faction: FactionId;
  source: EntityId;
}

export type InteractionKind = 'loot' | 'container';

/** What the player's interact button would act on right now. */
export interface InteractionTarget {
  entity: EntityId;
  kind: InteractionKind;
  label: string;
  /** 0..1 progress of an in-flight container search. */
  progress: number;
  distance: number;
}

export interface SimContext {
  readonly world: RaidWorld;
  readonly grid: MapGrid;
  readonly rng: RandomStreams;
  readonly bus: EventBus<GameEvents>;
  readonly intent: PlayerIntent;

  /** Current simulation tick. The canonical clock of the raid. */
  tick: number;
  /** Fixed delta in seconds. Always the same value (ADR-004). */
  dt: number;

  /** Noises emitted this tick, cleared at the end of every tick. */
  noises: NoiseEvent[];

  /** Refreshed every tick by the interaction system; read by the view model. */
  interactionTarget: InteractionTarget | null;

  /** Entities currently inside an anomaly, so enter/exit events fire exactly once. */
  readonly entitiesInAnomaly: Set<EntityId>;

  /** Seconds until the player may swing again. */
  meleeCooldown: number;

  /** Set by a system to end the raid. Consumed by the simulation. */
  pendingOutcome: RaidOutcomeKind | null;
  /** Name of the zone the player extracted through, for the result screen. */
  extractedZoneName: string | null;
}

export function emitNoise(
  ctx: SimContext,
  source: EntityId,
  faction: FactionId,
  x: number,
  y: number,
  radius: number,
): void {
  ctx.noises.push({ x, y, radius, faction, source });
}
