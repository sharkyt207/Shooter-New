/**
 * The five anomalies, each tested for the thing that makes it different.
 *
 * They are deliberately five *kinds of problem*, not five damage numbers, so
 * the assertions are about behaviour: does the field slow, jam, pulse, drain
 * or remember?
 */

import { describe, expect, it } from 'vitest';
import { ANOMALY } from '@/content/balance';
import type { AnomalyKind } from '@/content/anomalies';
import type { EntityId } from '@/core/ecs/entity';
import { createEmptyLoadout, type Loadout } from '@/game/player/loadout';
import { createIntent } from '@/game/player/playerIntent';
import { RaidSimulation } from '@/game/simulation/raidSimulation';
import { createAnomaly } from '@/game/simulation/factories';
import { avoidanceAt, fieldFactorAt } from './systems/anomalySystem';

function loadout(): Loadout {
  return {
    ...createEmptyLoadout(),
    weaponItemId: 'itm_wpn_splitter',
    armorItemId: null,
    helmetItemId: null,
    backpackItemId: 'itm_bag_medium',
    attachments: {},
    preferredAmmoItemId: 'itm_ammo_9mm',
    weaponCondition: 1,
    carried: [{ itemId: 'itm_ammo_9mm', quantity: 60 }],
  };
}

/**
 * A raid with every generated anomaly removed, so a test can place exactly one
 * and attribute what happens to it.
 */
function cleanSim(seed = 4242): RaidSimulation {
  const sim = new RaidSimulation({ seed, loadout: loadout() });
  for (const entity of sim.world.anomalies.keyArray()) sim.world.destroyEntity(entity);
  sim.world.flushDestroyed();
  return sim;
}

/** Drop an anomaly of a kind directly on the player and return both ids. */
function anomalyOnPlayer(sim: RaidSimulation, kind: AnomalyKind, radius = 5): {
  player: EntityId;
  anomaly: EntityId;
} {
  const player = sim.world.playerEntity as EntityId;
  const transform = sim.world.transforms.require(player);
  const anomaly = createAnomaly(sim.world, kind, transform.x, transform.y, radius);
  return { player, anomaly };
}

function run(sim: RaidSimulation, ticks: number): void {
  const intent = createIntent();
  for (let i = 0; i < ticks; i++) {
    sim.applyIntent(intent);
    sim.step();
  }
}

describe('anomaly fields', () => {
  it('Stillstand slows movement at the centre and not outside', () => {
    const sim = cleanSim();
    const player = sim.world.playerEntity as EntityId;
    const at = sim.world.transforms.require(player);
    createAnomaly(sim.world, 'stillness', at.x, at.y, 6);

    run(sim, 1);
    // The factor is read through the same helper the movement code uses.
    const inside = probeFactor(sim, at.x, at.y);
    const outside = probeFactor(sim, at.x + 30, at.y + 30);

    expect(inside).toBeLessThan(1);
    expect(inside).toBeGreaterThanOrEqual(ANOMALY.stillnessSlowFactor - 0.001);
    expect(outside).toBe(1);
  });

  it('Stillstand hurts in its core', () => {
    const sim = cleanSim();
    const { player } = anomalyOnPlayer(sim, 'stillness', 6);
    const health = sim.world.healths.require(player);
    const before = health.current;

    run(sim, 60);
    expect(health.current).toBeLessThan(before);
  });

  it('Bleiche drains silently, without a single noise', () => {
    const sim = cleanSim();
    const { player } = anomalyOnPlayer(sim, 'bleach', 6);
    const health = sim.world.healths.require(player);
    const before = health.current;

    let pulses = 0;
    sim.bus.on('anomaly:pulsed', () => pulses++);

    run(sim, 60);
    expect(health.current).toBeLessThan(before);
    expect(pulses).toBe(0);
  });

  it('Flüstern jams the HUD instead of dealing damage', () => {
    const sim = cleanSim();
    const { player } = anomalyOnPlayer(sim, 'whisper', 6);
    const health = sim.world.healths.require(player);
    const before = health.current;

    run(sim, 30);
    expect(sim.hudJammed).toBe(true);
    expect(health.current).toBe(before);

    // Walk out of it: the instruments come back.
    const transform = sim.world.transforms.require(player);
    transform.x += 40;
    run(sim, 2);
    expect(sim.hudJammed).toBe(false);
  });

  it('Rückstoß pulses on a fixed rhythm and pushes what it hits', () => {
    const sim = cleanSim();
    const { player } = anomalyOnPlayer(sim, 'recoil', 6);
    const health = sim.world.healths.require(player);
    const before = health.current;

    const pulses: number[] = [];
    sim.bus.on('anomaly:pulsed', () => pulses.push(sim.tick));

    run(sim, Math.round(ANOMALY.recoilPulseSeconds * 60 * 2.5));

    expect(pulses.length).toBeGreaterThanOrEqual(2);
    // The rhythm is the mechanic: it has to be constant enough to time.
    const gap = (pulses[1] as number) - (pulses[0] as number);
    expect(Math.abs(gap - ANOMALY.recoilPulseSeconds * 60)).toBeLessThan(3);
    expect(health.current).toBeLessThan(before);
  });

  it('Echo-Schatten remembers a passer-by and replays them as noise', () => {
    const sim = cleanSim();
    const { anomaly } = anomalyOnPlayer(sim, 'echoshadow', 7);

    let echoes = 0;
    sim.bus.on('anomaly:echo', () => echoes++);

    run(sim, Math.round((ANOMALY.echoReplaySeconds + ANOMALY.echoSampleSeconds) * 60) + 30);

    expect(sim.world.anomalies.require(anomaly).samples.length).toBeGreaterThan(0);
    expect(echoes).toBeGreaterThan(0);
  });

  it('Echo-Schatten does no damage at all', () => {
    const sim = cleanSim();
    const { player } = anomalyOnPlayer(sim, 'echoshadow', 7);
    const health = sim.world.healths.require(player);
    const before = health.current;

    run(sim, 240);
    expect(health.current).toBe(before);
  });
});

describe('AI avoidance', () => {
  it('rates a Bleiche as worth walking around and a Flüstern as barely worth noticing', () => {
    const sim = cleanSim();
    const player = sim.world.playerEntity as EntityId;
    const at = sim.world.transforms.require(player);

    createAnomaly(sim.world, 'bleach', at.x, at.y, 6);
    const bleach = probeAvoidance(sim, at.x, at.y);

    for (const entity of sim.world.anomalies.keyArray()) sim.world.destroyEntity(entity);
    sim.world.flushDestroyed();

    createAnomaly(sim.world, 'whisper', at.x, at.y, 6);
    const whisper = probeAvoidance(sim, at.x, at.y);

    expect(bleach).toBeGreaterThan(whisper);
    expect(probeAvoidance(sim, at.x + 40, at.y + 40)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `fieldFactorAt` and `avoidanceAt` take the SimContext, which the simulation
 * deliberately keeps private. Rather than widen that API for tests, rebuild the
 * minimal context they actually read.
 */
function probeContext(sim: RaidSimulation): never {
  return { world: sim.world, grid: sim.grid } as never;
}

function probeFactor(sim: RaidSimulation, x: number, y: number): number {
  return fieldFactorAt(probeContext(sim), x, y);
}

function probeAvoidance(sim: RaidSimulation, x: number, y: number): number {
  return avoidanceAt(probeContext(sim), x, y);
}
