/**
 * The event contract between simulation and presentation (ADR-002).
 *
 * The simulation emits facts. It never plays a sound, never spawns a particle
 * and never touches the DOM - `render` and `ui` subscribe and decide what that
 * fact should look and sound like.
 *
 * Adding an event here is cheap. Calling into the renderer from a system is a
 * boundary violation and fails the build.
 */

import type { EntityId } from '@/core/ecs/entity';
import type { HitZone } from '@/content/types';
import type { AiState, FactionId } from './components';

/**
 * Declared as a type alias rather than an interface on purpose: only type
 * aliases get an implicit index signature, which is what lets this satisfy the
 * `EventMap` constraint of the generic bus.
 */
export type GameEvents = {
  // ── Combat ───────────────────────────────────────────────────────────────
  'weapon:fired': {
    entity: EntityId;
    weaponId: string;
    x: number;
    y: number;
    rotation: number;
    /** Metres within which this shot can be heard. */
    noiseRadius: number;
  };
  'weapon:reloadStarted': { entity: EntityId; weaponId: string; seconds: number };
  'weapon:reloadFinished': { entity: EntityId; weaponId: string };
  'weapon:dryFire': { entity: EntityId; weaponId: string };
  'weapon:jammed': { entity: EntityId; weaponId: string };
  'weapon:jamCleared': { entity: EntityId; weaponId: string };

  'damage:dealt': {
    target: EntityId;
    source: EntityId;
    amount: number;
    /** Damage prevented by armour. */
    absorbed: number;
    x: number;
    y: number;
    isPlayerTarget: boolean;
    wasUnaware: boolean;
    /** Where the shot landed. Null for area damage such as a grenade. */
    zone: HitZone | null;
    /** True when armour was hit and the round went through anyway. */
    penetrated: boolean;
    fragmented: boolean;
  };

  'projectile:impact': {
    x: number;
    y: number;
    /** What the projectile hit - drives the impact VFX. */
    surface: 'wall' | 'actor';
  };

  'entity:died': {
    entity: EntityId;
    faction: FactionId;
    x: number;
    y: number;
    killer: EntityId | null;
    xp: number;
  };

  // ── Loot & inventory ─────────────────────────────────────────────────────
  'loot:pickedUp': { itemId: string; quantity: number; x: number; y: number };
  'loot:dropped': { itemId: string; quantity: number; x: number; y: number };
  'loot:rejected': { itemId: string; reason: 'overweight' };
  'container:searchStarted': { entity: EntityId; containerId: string; seconds: number };
  'container:searchCancelled': { entity: EntityId };
  'container:opened': {
    entity: EntityId;
    containerId: string;
    contents: Array<{ itemId: string; quantity: number }>;
  };
  'item:used': { entity: EntityId; itemId: string };

  // ── Throwables and melee ─────────────────────────────────────────────────
  'throwable:thrown': { entity: EntityId; throwableId: string; x: number; y: number };
  'throwable:detonated': {
    throwableId: string;
    kind: string;
    x: number;
    y: number;
    radius: number;
  };
  'melee:swing': { entity: EntityId; x: number; y: number; rotation: number };
  'melee:hit': { entity: EntityId; target: EntityId; silent: boolean };

  // ── AI ───────────────────────────────────────────────────────────────────
  'ai:stateChanged': { entity: EntityId; from: AiState; to: AiState };
  'ai:alerted': { entity: EntityId; x: number; y: number };

  // ── Extraction & raid flow ───────────────────────────────────────────────
  'extraction:opened': { zoneId: string; name: string; x: number; y: number };
  'extraction:closing': { zoneId: string; secondsLeft: number };
  'extraction:closed': { zoneId: string };
  'extraction:holdStarted': { zoneId: string };
  'extraction:holdCancelled': { zoneId: string };
  'extraction:progress': { zoneId: string; progress: number };

  'raid:started': { seed: number; durationSeconds: number };
  'raid:ended': { outcome: RaidOutcome };
  'raid:timeWarning': { secondsLeft: number };

  // ── Anomalies ────────────────────────────────────────────────────────────
  'anomaly:entered': { entity: EntityId; kind: string };
  'anomaly:exited': { entity: EntityId; kind: string };

  // ── Player feedback ──────────────────────────────────────────────────────
  'player:healthChanged': { current: number; max: number };
  'player:staminaChanged': { current: number; max: number };
  'player:weightChanged': { weight: number; capacity: number };
  'camera:shake': { intensity: number };
};

export type RaidOutcomeKind = 'extracted' | 'died' | 'timeout';

export interface RaidOutcome {
  kind: RaidOutcomeKind;
  /** Seconds the raid lasted. */
  durationSeconds: number;
  kills: number;
  xp: number;
  /** Value of everything carried out. Zero unless extracted. */
  lootValue: number;
  /** Items secured. Empty unless extracted. */
  loot: Array<{ itemId: string; quantity: number }>;
  /** Echo shards retained even on death (Pillar P5). */
  retainedShards: number;
  zoneName: string | null;
  /** Condition the weapon came back in, 0..1. Only meaningful on extraction. */
  weaponCondition: number;
}
