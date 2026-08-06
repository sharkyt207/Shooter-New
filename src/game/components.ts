/**
 * Every component type in the simulation.
 *
 * Components are plain data - no methods, no class instances, nothing that
 * would not survive a JSON round-trip. That is what makes the world
 * serialisable, testable and - later - transferable over a network.
 *
 * `prevX/prevY/prevRotation` exist so the renderer can interpolate between two
 * simulation ticks (ADR-004). The simulation itself never reads them.
 */

import type { EntityId } from '@/core/ecs/entity';
import type { AttachmentLoadout } from '@/content/types';
import type { FactionId } from '@/content/factions';
import type { AnomalyKind } from '@/content/anomalies';
import type { InventoryState } from './inventory/inventory';

export interface Transform {
  x: number;
  y: number;
  rotation: number;
  prevX: number;
  prevY: number;
  prevRotation: number;
}

export interface Velocity {
  x: number;
  y: number;
}

export interface Collider {
  radius: number;
  /** Static colliders never move and are skipped by the movement pass. */
  isStatic: boolean;
}

export interface Health {
  current: number;
  max: number;
  /** Tick of the most recent damage. Drives the grace period and UI flashes. */
  lastDamageTick: number;
  /** Entity that dealt the killing blow, set on death. */
  lastAttacker: EntityId | null;
}

export type { FactionId };

export interface Faction {
  id: FactionId;
}

/** Squad this entity belongs to, or -1 when it fights alone. */
export interface SquadMember {
  squadId: number;
  /** Role assigned by the squad each tick. */
  role: SquadRole;
  /** Seconds until this member may throw again. */
  throwCooldown: number;
}

export type SquadRole = 'assault' | 'suppress' | 'flank';

/** Marks the single player-controlled entity. */
export interface PlayerTag {
  /** Accumulated experience earned during this raid. */
  raidXp: number;
  kills: number;
  /**
   * Flashlight. Lets the player see in the dark and lets everyone else see the
   * player - which is the entire decision the night side of a fragment poses.
   */
  lightOn: boolean;
  /**
   * True while the player is holding an aim direction.
   *
   * Simulation state, not presentation: the renderer reads it to draw the aim
   * line, and it exists here rather than in the renderer because the renderer
   * has no access to intent (ADR-002).
   */
  aiming: boolean;
  /** True on the ticks the weapon is actually firing. Drives the aim line's colour. */
  firing: boolean;
}

export interface Stamina {
  current: number;
  max: number;
  /** Seconds until regeneration resumes. */
  regenDelay: number;
}

export interface WeaponState {
  weaponId: string;
  /** Rounds currently in the magazine. */
  magazine: number;
  /** Which round is chambered. Null means the weapon's default load. */
  loadedAmmoItemId: string | null;
  /** Seconds until the weapon may fire again. */
  cooldown: number;
  /** Seconds remaining on the reload, 0 when not reloading. */
  reloadRemaining: number;
  /** Extra spread accumulated from sustained fire, in degrees. */
  bloomDeg: number;
  /** Remaining durability. Wear widens spread and invites jams. */
  durability: number;
  /** Maximum durability, so wear can be expressed as a fraction. */
  durabilityMax: number;
  /** Seconds left clearing a jam. Greater than zero means the weapon is dead. */
  jamRemaining: number;
}

export interface Projectile {
  owner: EntityId;
  ownerFaction: FactionId;
  damage: number;
  /** Ammunition properties, carried so the hit can be resolved on impact. */
  penetration: number;
  fragmentation: number;
  fragmentationBonus: number;
  /** Hit-zone weighting of the weapon that fired this round. */
  zoneBias: { head: number; torso: number; limbs: number };
  /** Direction, always unit length. */
  dirX: number;
  dirY: number;
  speed: number;
  /** Metres travelled so far - used for range falloff and despawn. */
  travelled: number;
  effectiveRange: number;
  maxRange: number;
  minDamageFactor: number;
  /** Seconds until forced despawn, a safety net against stuck projectiles. */
  lifetime: number;
}

export type AiState = 'idle' | 'patrol' | 'investigate' | 'chase' | 'attack' | 'flee';

export interface EnemyAgent {
  enemyId: string;
  state: AiState;
  /** Seconds spent in the current state. */
  stateTime: number;
  target: EntityId | null;
  /** Last position the target was seen or heard at. */
  lastKnownX: number;
  lastKnownY: number;
  /** Seconds of continuous sight, compared against `awarenessSeconds`. */
  awareness: number;
  /** Seconds since the target was last seen. */
  timeSinceSeen: number;
  /** Anchor the enemy patrols around. */
  homeX: number;
  homeY: number;
  /** Current movement destination. */
  destX: number;
  destY: number;
  /** Seconds until the next burst may start. */
  attackCooldown: number;
  /** Rounds left in the current burst. */
  burstRemaining: number;
  /** Staggers expensive perception checks across enemies. */
  perceptionTimer: number;
  /** Seconds to wait before choosing the next patrol point. */
  waitTimer: number;
  /** Last boss phase label emitted, so a change fires exactly once. */
  phaseLabel: string;
  /** True once a boss has announced itself to the player. */
  announced: boolean;
}

/** An item lying on the ground, ready to be picked up. */
export interface LootDrop {
  itemId: string;
  quantity: number;
  /** Tick the drop was created - used for the spawn animation. */
  createdTick: number;
}

export interface ContainerState {
  containerId: string;
  /** Seconds of searching accumulated so far. */
  searchProgress: number;
  searched: boolean;
  /** Rolled contents, revealed when the search completes. */
  contents: Array<{ itemId: string; quantity: number }>;
  /**
   * Contents this container holds no matter what the loot roll says.
   * Keycards live here: a key that depends on a roll is a vault that sometimes
   * cannot be opened.
   */
  guaranteed: Array<{ itemId: string; quantity: number }>;
}

export type ExtractionPhase = 'locked' | 'available' | 'closing' | 'closed' | 'used';

export interface ExtractionZone {
  zoneId: string;
  name: string;
  radius: number;
  /** Simulation tick at which the zone opens / closes. */
  opensAtTick: number;
  closesAtTick: number;
  phase: ExtractionPhase;
  /** Seconds the player has held position, 0..extractionHoldSeconds. */
  holdProgress: number;
}

export type { AnomalyKind };

/** One recorded passer-by, kept by an Echo-Schatten so it can replay them. */
export interface EchoSample {
  x: number;
  y: number;
  tick: number;
}

export interface Anomaly {
  kind: AnomalyKind;
  radius: number;
  /** Drives the visual pulse; advanced by the simulation so it stays deterministic. */
  phase: number;
  /** Seconds since the last discrete event - a Rückstoß pulse, for instance. */
  timer: number;
  /** Echo-Schatten memory. Empty for every other kind. */
  samples: EchoSample[];
  /** Seconds since the last echo replay. */
  replayTimer: number;
}

export type DoorState = 'closed' | 'open' | 'locked';

/**
 * A door in a stamped room prefab.
 *
 * The grid cell is the authority on whether the doorway blocks anything; this
 * component carries the reason, the key and the identity the renderer needs.
 */
export interface Door {
  cx: number;
  cy: number;
  state: DoorState;
  /** Item that unlocks this door. Null for an ordinary one. */
  keyItemId: string | null;
  /** True once anything has passed through - the renderer keeps it swung open. */
  everOpened: boolean;
}

/**
 * What the renderer should draw for this entity.
 *
 * This is a logical asset key, never a file path (ADR-008). It lives in the
 * simulation because "this entity is a scavenger" is game data - resolving that
 * key to a texture is the renderer's job alone.
 */
export interface Renderable {
  assetKey: string;
  /** Metres above ground, used for depth sorting and shadow scale. */
  height: number;
  /** Optional tint as 0xRRGGBB, for placeholder art and status effects. */
  tint: number;
}

export interface Equipment {
  weaponItemId: string | null;
  armorItemId: string | null;
  helmetItemId: string | null;
  backpackItemId: string | null;
  /** Remaining armour durability; low values stop far less. */
  armorDurability: number;
  helmetDurability: number;
  /** Attachments fitted to the equipped weapon. */
  attachments: AttachmentLoadout;
}

/** A thrown object in flight, before it detonates. */
export interface Thrown {
  throwableId: string;
  owner: EntityId;
  ownerFaction: FactionId;
  /** Direction, unit length. */
  dirX: number;
  dirY: number;
  speed: number;
  /** Metres still to travel before the object comes to rest. */
  remainingDistance: number;
  /** Seconds until detonation. Counts down in flight and at rest. */
  fuse: number;
}

/** Applied by a flashbang: the enemy cannot see or act coherently. */
export interface Disoriented {
  remaining: number;
}

export interface Carrier {
  inventory: InventoryState;
  /**
   * The secure container, when one was brought along.
   *
   * Its contents come home whatever happens to the carrier - which is why it is
   * a separate inventory rather than a flag on a slot: weight, capacity and the
   * "does it fit" question all have to work exactly as they do for the pack.
   */
  secure: InventoryState | null;
}

/** Applied while an entity uses a consumable - it cannot fire or sprint. */
export interface UsingItem {
  itemId: string;
  remaining: number;
  total: number;
}

/** Transient marker so the renderer can flash an entity that was just hit. */
export interface HitFlash {
  remaining: number;
}
