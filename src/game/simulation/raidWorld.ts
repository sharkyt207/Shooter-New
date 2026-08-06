/**
 * The ECS world for a single raid.
 *
 * `core/ecs/World` is deliberately game-agnostic; this subclass is where the
 * simulation declares what actually exists in PROJECT ECHO. Every component
 * store is registered once here, which also makes this file the authoritative
 * list of what an entity can be.
 */

import { World } from '@/core/ecs/world';
import type { ComponentStore } from '@/core/ecs/componentStore';
import type { EntityId } from '@/core/ecs/entity';
import type {
  Anomaly,
  Carrier,
  Collider,
  ContainerState,
  Disoriented,
  Equipment,
  Faction,
  Health,
  HitFlash,
  LootDrop,
  PlayerTag,
  Projectile,
  Renderable,
  SquadMember,
  Stamina,
  Thrown,
  Transform,
  UsingItem,
  Velocity,
  WeaponState,
  EnemyAgent,
  ExtractionZone,
} from '@/game/components';

export class RaidWorld extends World {
  readonly transforms: ComponentStore<Transform>;
  readonly velocities: ComponentStore<Velocity>;
  readonly colliders: ComponentStore<Collider>;
  readonly healths: ComponentStore<Health>;
  readonly factions: ComponentStore<Faction>;
  readonly players: ComponentStore<PlayerTag>;
  readonly staminas: ComponentStore<Stamina>;
  readonly weapons: ComponentStore<WeaponState>;
  readonly projectiles: ComponentStore<Projectile>;
  readonly agents: ComponentStore<EnemyAgent>;
  readonly lootDrops: ComponentStore<LootDrop>;
  readonly containers: ComponentStore<ContainerState>;
  readonly extractionZones: ComponentStore<ExtractionZone>;
  readonly anomalies: ComponentStore<Anomaly>;
  readonly renderables: ComponentStore<Renderable>;
  readonly equipments: ComponentStore<Equipment>;
  readonly carriers: ComponentStore<Carrier>;
  readonly usingItems: ComponentStore<UsingItem>;
  readonly hitFlashes: ComponentStore<HitFlash>;
  readonly thrown: ComponentStore<Thrown>;
  readonly disoriented: ComponentStore<Disoriented>;
  readonly squadMembers: ComponentStore<SquadMember>;

  /** The player entity, or NULL once the player has died. */
  playerEntity: EntityId | null = null;

  constructor() {
    super();
    this.transforms = this.registerStore<Transform>('transform');
    this.velocities = this.registerStore<Velocity>('velocity');
    this.colliders = this.registerStore<Collider>('collider');
    this.healths = this.registerStore<Health>('health');
    this.factions = this.registerStore<Faction>('faction');
    this.players = this.registerStore<PlayerTag>('player');
    this.staminas = this.registerStore<Stamina>('stamina');
    this.weapons = this.registerStore<WeaponState>('weapon');
    this.projectiles = this.registerStore<Projectile>('projectile');
    this.agents = this.registerStore<EnemyAgent>('agent');
    this.lootDrops = this.registerStore<LootDrop>('lootDrop');
    this.containers = this.registerStore<ContainerState>('container');
    this.extractionZones = this.registerStore<ExtractionZone>('extractionZone');
    this.anomalies = this.registerStore<Anomaly>('anomaly');
    this.renderables = this.registerStore<Renderable>('renderable');
    this.equipments = this.registerStore<Equipment>('equipment');
    this.carriers = this.registerStore<Carrier>('carrier');
    this.usingItems = this.registerStore<UsingItem>('usingItem');
    this.hitFlashes = this.registerStore<HitFlash>('hitFlash');
    this.thrown = this.registerStore<Thrown>('thrown');
    this.disoriented = this.registerStore<Disoriented>('disoriented');
    this.squadMembers = this.registerStore<SquadMember>('squadMember');
  }

  /** Convenience: does this entity still exist and have health left? */
  isAliveActor(entity: EntityId | null): entity is EntityId {
    if (entity === null || !this.isAlive(entity)) return false;
    const health = this.healths.get(entity);
    return health !== undefined && health.current > 0;
  }

  override reset(): void {
    super.reset();
    this.playerEntity = null;
  }
}
