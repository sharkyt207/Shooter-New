/**
 * The raid simulation.
 *
 * Owns the world, the RNG streams, the map and the fixed system order. This is
 * the only class the rest of the application needs to run a raid, and it has no
 * knowledge whatsoever of rendering, input devices or the DOM (ADR-002).
 *
 * Usage:
 *   const sim = new RaidSimulation({ seed, loadout });
 *   sim.applyIntent(intent);
 *   sim.tick();               // exactly one fixed step
 *   const view = sim.snapshot();
 */

import { ECONOMY, RAID } from '@/content/balance';
import { EventBus } from '@/core/events/eventBus';
import { RandomStreams } from '@/core/math/random';
import { FIXED_DT } from '@/core/time/fixedClock';
import type { EntityId } from '@/core/ecs/entity';
import type { GameEvents, RaidOutcome, RaidOutcomeKind } from '@/game/gameEvents';
import { generateMap, type GeneratedMap } from '@/game/map/mapGenerator';
import type { MapGrid } from '@/game/map/mapGrid';
import { cloneLoadout, type Loadout } from '@/game/player/loadout';
import { clearOneShots, copyIntent, createIntent, type PlayerIntent } from '@/game/player/playerIntent';
import { totalValue } from '@/game/inventory/inventory';
import { AI } from '@/content/balance';
import type { FactionId } from '@/content/factions';
import { aiSystem } from '@/game/ai/aiSystem';
import { NavigationCache } from '@/game/ai/navigation';
import { perceptionSystem } from '@/game/ai/perception';
import { SquadRegistry } from '@/game/ai/squad';
import { updateWeapons } from '@/game/weapons/firing';
import {
  createAnomaly,
  createContainer,
  createDoor,
  createEnemy,
  createExtractionZone,
  createPlayer,
} from './factories';
import { RaidWorld } from './raidWorld';
import type { SimContext } from './simContext';
import { throwableSystem } from '@/game/combat/throwables';
import { anomalySystem, buildAvoidanceOverlay } from './systems/anomalySystem';
import { doorSystem } from './systems/doorSystem';
import { deathSystem } from './systems/deathSystem';
import { extractionSystem } from './systems/extractionSystem';
import { interactionSystem } from './systems/interactionSystem';
import { playerSystem } from './systems/playerSystem';
import { projectileSystem } from './systems/projectileSystem';

export interface RaidConfig {
  seed: number;
  loadout: Loadout;
  /** Overrides the default raid length. Used by tests. */
  durationSeconds?: number;
  fragmentCount?: number;
}

export interface RaidSnapshot {
  tick: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  finished: boolean;
  outcome: RaidOutcome | null;
}

export class RaidSimulation {
  readonly world = new RaidWorld();
  readonly bus = new EventBus<GameEvents>();
  readonly rng: RandomStreams;
  readonly map: GeneratedMap;
  readonly grid: MapGrid;
  readonly seed: number;

  private readonly ctx: SimContext;
  private readonly intent: PlayerIntent = createIntent();
  private readonly durationTicks: number;
  private readonly loadout: Loadout;

  private currentTick = 0;
  private finishedOutcome: RaidOutcome | null = null;
  /** Locked rooms the player forced open. Reported to the quest line. */
  private vaultsOpened = 0;
  /** Anomalies the player entered; only counted as survived if they get out. */
  private anomaliesEntered = 0;
  /** Ticks the death animation is allowed to play before the raid resolves. */
  private deathDelayTicks = -1;
  private lastTimeWarning = -1;

  constructor(config: RaidConfig) {
    this.seed = config.seed;
    this.rng = new RandomStreams(config.seed);
    this.loadout = cloneLoadout(config.loadout);
    this.durationTicks = Math.round((config.durationSeconds ?? RAID.durationSeconds) * 60);

    this.map = generateMap(this.rng.map, { fragmentCount: config.fragmentCount });
    this.grid = this.map.grid;

    this.ctx = {
      world: this.world,
      grid: this.grid,
      rng: this.rng,
      bus: this.bus,
      intent: this.intent,
      tick: 0,
      dt: FIXED_DT,
      noises: [],
      interactionTarget: null,
      entitiesInAnomaly: new Set<EntityId>(),
      weather: this.map.weather,
      hudJammed: false,
      coverPoints: this.map.coverPoints,
      meleeCooldown: 0,
      navigation: new NavigationCache(this.grid),
      squads: new SquadRegistry(),
      pendingOutcome: null,
      extractedZoneName: null,
    };

    this.populateWorld();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  get tick(): number {
    return this.currentTick;
  }

  get elapsedSeconds(): number {
    return this.currentTick / 60;
  }

  get remainingSeconds(): number {
    return Math.max(0, (this.durationTicks - this.currentTick) / 60);
  }

  get finished(): boolean {
    return this.finishedOutcome !== null;
  }

  get outcome(): RaidOutcome | null {
    return this.finishedOutcome;
  }

  get interactionTarget() {
    return this.ctx.interactionTarget;
  }

  /** Squad blackboards. Read-only from outside the simulation. */
  get squads(): SquadRegistry {
    return this.ctx.squads;
  }

  /** Weather this raid was generated with. */
  get weather() {
    return this.ctx.weather;
  }

  /** True while a Flüstern has the player's instruments down. */
  get hudJammed(): boolean {
    return this.ctx.hudJammed;
  }

  /** Feed the current input state. Safe to call many times between ticks. */
  applyIntent(intent: Readonly<PlayerIntent>): void {
    copyIntent(this.intent, intent);
  }

  start(): void {
    // Counted here rather than in a system: these are facts *about the raid*,
    // not state any system needs, and the meta layer is their only consumer.
    this.bus.on('door:opened', (event) => {
      if (event.wasLocked) this.vaultsOpened++;
    });
    this.bus.on('anomaly:entered', () => {
      this.anomaliesEntered++;
    });

    this.bus.emit('raid:started', {
      seed: this.seed,
      durationSeconds: this.durationTicks / 60,
    });
  }

  /**
   * Advance the simulation by exactly one fixed step.
   *
   * The system order below is part of the determinism contract
   * (docs/01-ARCHITECTURE.md, section 5). Do not reorder casually.
   */
  step(): void {
    if (this.finished) return;

    this.currentTick++;
    this.ctx.tick = this.currentTick;
    this.ctx.noises.length = 0;

    this.storePreviousTransforms();

    playerSystem(this.ctx);
    // Doors run right after movement: whether one is open decides what the
    // perception pass can see and what the AI can path through this tick.
    doorSystem(this.ctx);
    perceptionSystem(this.ctx);
    aiSystem(this.ctx);
    updateWeapons(this.ctx);
    projectileSystem(this.ctx);
    throwableSystem(this.ctx);
    deathSystem(this.ctx);
    interactionSystem(this.ctx);
    anomalySystem(this.ctx);
    extractionSystem(this.ctx);
    this.updateRaidTimer();

    this.world.flushDestroyed();
    clearOneShots(this.intent);

    this.resolvePendingOutcome();
  }

  snapshot(): RaidSnapshot {
    return {
      tick: this.currentTick,
      elapsedSeconds: this.elapsedSeconds,
      remainingSeconds: this.remainingSeconds,
      finished: this.finished,
      outcome: this.finishedOutcome,
    };
  }

  /** Release listeners so nothing leaks into the next raid. */
  dispose(): void {
    this.bus.clear();
    this.world.reset();
    this.ctx.navigation.clear();
    this.ctx.squads.clear();
  }

  // ── Setup ────────────────────────────────────────────────────────────────

  private populateWorld(): void {
    const spawn = this.map.playerSpawn;
    createPlayer(this.world, this.loadout, spawn.x, spawn.y, this.map.weather.lightMultiplier);

    this.spawnEnemies();
    for (const container of this.map.containers) {
      createContainer(this.world, container);
    }
    for (const zone of this.map.extractions) {
      createExtractionZone(this.world, zone);
    }
    for (const anomaly of this.map.anomalies) {
      createAnomaly(this.world, anomaly.kind, anomaly.x, anomaly.y, anomaly.radius);
    }
    for (const door of this.map.doors) {
      createDoor(this.world, door);
    }

    // Anomalies never move, so the AI's caution is baked into a static cost map
    // once rather than recomputed every time a flow field is built.
    this.ctx.navigation.setCostOverlay(buildAvoidanceOverlay(this.ctx));
  }

  /**
   * Spawn enemies and group them into squads.
   *
   * Grouping is spatial and per faction: enemies that start near each other
   * fight together. That is deliberately simple - the interesting behaviour
   * comes from the shared blackboard, not from clever grouping.
   */
  private spawnEnemies(): void {
    interface PendingSquad {
      faction: FactionId;
      squad: ReturnType<SquadRegistry['create']>;
      anchorX: number;
      anchorY: number;
    }
    const pending: PendingSquad[] = [];

    for (const spawn of this.map.enemies) {
      const entity = createEnemy(this.world, spawn.enemyId, spawn.x, spawn.y);
      if (entity === null) continue;

      const faction = this.world.factions.get(entity);
      if (!faction) continue;

      // A boss always gets its own squad: it never takes orders and never
      // takes a supporting role.
      if (spawn.isBoss) {
        const solo = this.ctx.squads.create(faction.id);
        solo.members.push(entity);
        this.world.squadMembers.set(entity, { squadId: solo.id, role: 'assault', throwCooldown: 0 });
        continue;
      }

      let joined = pending.find(
        (candidate) =>
          candidate.faction === faction.id &&
          candidate.squad.members.length < AI.maxSquadSize &&
          Math.hypot(candidate.anchorX - spawn.x, candidate.anchorY - spawn.y) <= AI.squadGroupRadius,
      );

      if (!joined) {
        joined = {
          faction: faction.id,
          squad: this.ctx.squads.create(faction.id),
          anchorX: spawn.x,
          anchorY: spawn.y,
        };
        pending.push(joined);
      }

      joined.squad.members.push(entity);
      this.world.squadMembers.set(entity, {
        squadId: joined.squad.id,
        role: 'assault',
        throwCooldown: 0,
      });
    }
  }

  // ── Per-tick helpers ─────────────────────────────────────────────────────

  /** Snapshot positions so the renderer can interpolate (ADR-004). */
  private storePreviousTransforms(): void {
    for (const transform of this.world.transforms.values()) {
      transform.prevX = transform.x;
      transform.prevY = transform.y;
      transform.prevRotation = transform.rotation;
    }
  }

  private updateRaidTimer(): void {
    const remaining = this.durationTicks - this.currentTick;
    if (remaining <= 0) {
      this.ctx.pendingOutcome = 'timeout';
      return;
    }

    // Warn at 120 s and 60 s so the player can still act on the information.
    const seconds = Math.ceil(remaining / 60);
    if ((seconds === 120 || seconds === 60) && seconds !== this.lastTimeWarning) {
      this.lastTimeWarning = seconds;
      this.bus.emit('raid:timeWarning', { secondsLeft: seconds });
    }
  }

  private resolvePendingOutcome(): void {
    if (this.finished) return;

    // A player death gets a short grace window so the renderer can play the
    // death beat before the result screen takes over.
    if (this.deathDelayTicks > 0) {
      this.deathDelayTicks--;
      return;
    }
    if (this.deathDelayTicks === 0) {
      this.finishRaid('died');
      return;
    }

    const pending = this.ctx.pendingOutcome;
    if (pending === null) return;

    if (pending === 'died') {
      this.ctx.pendingOutcome = null;
      this.deathDelayTicks = 48;
      return;
    }

    this.finishRaid(pending);
  }

  private finishRaid(kind: RaidOutcomeKind): void {
    const player = this.world.playerEntity;
    const tag = player !== null ? this.world.players.get(player) : undefined;
    const carrier = player !== null ? this.world.carriers.get(player) : undefined;

    const extracted = kind === 'extracted';
    const loot = extracted && carrier
      ? carrier.inventory.slots.map((slot) => ({ itemId: slot.itemId, quantity: slot.quantity }))
      : [];
    const lootValue = extracted && carrier ? totalValue(carrier.inventory) : 0;

    // The secure container comes home whatever happened to its owner. That is
    // the whole reason it exists, so it is deliberately outside the `extracted`
    // branch above.
    const secure = carrier?.secure ?? null;
    const securedLoot = secure
      ? secure.slots.map((slot) => ({ itemId: slot.itemId, quantity: slot.quantity }))
      : [];
    const securedValue = secure ? totalValue(secure) : 0;

    // Echo shards survive death, so even a failed raid moves the meta forward
    // (Pillar P5).
    const carriedShards = carrier
      ? carrier.inventory.slots
          .filter((slot) => slot.itemId === 'itm_echoshard')
          .reduce((sum, slot) => sum + slot.quantity, 0)
      : 0;
    const retainedShards = extracted
      ? 0
      : Math.floor(carriedShards * ECONOMY.deathShardRetention);

    const xp =
      (tag?.raidXp ?? 0) +
      (extracted ? ECONOMY.extractionXp : 0) +
      Math.floor((lootValue / 1000) * ECONOMY.xpPerThousandValue);

    // Wear carries back into the profile, so a weapon that survived a hard raid
    // is genuinely more worn on the next one.
    const weaponState = player !== null ? this.world.weapons.get(player) : undefined;
    const weaponCondition =
      weaponState && weaponState.durabilityMax > 0
        ? weaponState.durability / weaponState.durabilityMax
        : 1;

    this.finishedOutcome = {
      kind,
      durationSeconds: this.elapsedSeconds,
      kills: tag?.kills ?? 0,
      xp,
      lootValue,
      loot,
      securedLoot,
      securedValue,
      vaultsOpened: this.vaultsOpened,
      // Only survivors get the credit: an anomaly you died in was not survived.
      anomaliesSurvived: kind === 'died' ? 0 : this.anomaliesEntered,
      retainedShards,
      zoneName: this.ctx.extractedZoneName,
      weaponCondition,
    };

    this.bus.emit('raid:ended', { outcome: this.finishedOutcome });
  }
}
