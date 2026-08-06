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
import { aiSystem } from '@/game/ai/aiSystem';
import { perceptionSystem } from '@/game/ai/perception';
import { updateWeapons } from '@/game/weapons/firing';
import {
  createAnomaly,
  createContainer,
  createEnemy,
  createExtractionZone,
  createPlayer,
} from './factories';
import { RaidWorld } from './raidWorld';
import type { SimContext } from './simContext';
import { throwableSystem } from '@/game/combat/throwables';
import { anomalySystem } from './systems/anomalySystem';
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
      meleeCooldown: 0,
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

  /** Feed the current input state. Safe to call many times between ticks. */
  applyIntent(intent: Readonly<PlayerIntent>): void {
    copyIntent(this.intent, intent);
  }

  start(): void {
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
  }

  // ── Setup ────────────────────────────────────────────────────────────────

  private populateWorld(): void {
    const spawn = this.map.playerSpawn;
    createPlayer(this.world, this.loadout, spawn.x, spawn.y);

    for (const enemy of this.map.enemies) {
      createEnemy(this.world, enemy.enemyId, enemy.x, enemy.y);
    }
    for (const container of this.map.containers) {
      createContainer(this.world, container.containerId, container.x, container.y);
    }
    for (const zone of this.map.extractions) {
      createExtractionZone(this.world, zone);
    }
    for (const anomaly of this.map.anomalies) {
      createAnomaly(this.world, anomaly.kind, anomaly.x, anomaly.y, anomaly.radius);
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
      retainedShards,
      zoneName: this.ctx.extractedZoneName,
      weaponCondition,
    };

    this.bus.emit('raid:ended', { outcome: this.finishedOutcome });
  }
}
