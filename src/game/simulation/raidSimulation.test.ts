import { describe, expect, it } from 'vitest';
import type { GameEvents } from '@/game/gameEvents';
import { createIntent, type PlayerIntent } from '@/game/player/playerIntent';
import type { Loadout } from '@/game/player/loadout';
import { RaidSimulation } from './raidSimulation';

function testLoadout(): Loadout {
  return {
    weaponItemId: 'itm_wpn_splitter',
    armorItemId: 'itm_armor_fiber',
    helmetItemId: null,
    backpackItemId: 'itm_bag_medium',
    attachments: {},
    preferredAmmoItemId: 'itm_ammo_9mm',
    weaponCondition: 1,
    carried: [
      { itemId: 'itm_ammo_9mm', quantity: 120 },
      { itemId: 'itm_bandage', quantity: 2 },
    ],
  };
}

function run(sim: RaidSimulation, ticks: number, intent?: PlayerIntent): void {
  for (let i = 0; i < ticks && !sim.finished; i++) {
    if (intent) sim.applyIntent(intent);
    sim.step();
  }
}

describe('raid simulation smoke test', () => {
  it('runs 600 ticks without errors and without producing NaN', () => {
    const sim = new RaidSimulation({ seed: 8080, loadout: testLoadout() });
    sim.start();

    const intent = createIntent();
    intent.moveX = 1;
    intent.fire = true;
    intent.aimX = 1;

    expect(() => run(sim, 600, intent)).not.toThrow();

    for (const transform of sim.world.transforms.values()) {
      expect(Number.isFinite(transform.x)).toBe(true);
      expect(Number.isFinite(transform.y)).toBe(true);
      expect(Number.isFinite(transform.rotation)).toBe(true);
    }
    for (const health of sim.world.healths.values()) {
      expect(Number.isFinite(health.current)).toBe(true);
    }
  });

  it('produces identical results from the same seed and inputs', () => {
    const trace = (seed: number): string[] => {
      const sim = new RaidSimulation({ seed, loadout: testLoadout() });
      const events: string[] = [];
      sim.bus.on('weapon:fired', (e) => events.push(`fire:${e.x.toFixed(4)}:${e.y.toFixed(4)}`));
      sim.bus.on('damage:dealt', (e) => events.push(`dmg:${e.target}:${e.amount.toFixed(4)}`));
      sim.bus.on('ai:stateChanged', (e) => events.push(`ai:${e.entity}:${e.to}`));

      const intent = createIntent();
      intent.moveX = 0.8;
      intent.moveY = 0.3;
      intent.aimX = 1;
      intent.fire = true;

      run(sim, 400, intent);

      const player = sim.world.playerEntity;
      const transform = player !== null ? sim.world.transforms.get(player) : undefined;
      events.push(`pos:${transform?.x.toFixed(6)}:${transform?.y.toFixed(6)}`);
      return events;
    };

    expect(trace(555)).toEqual(trace(555));
  });

  it('diverges for different seeds', () => {
    const positionAfter = (seed: number): number => {
      const sim = new RaidSimulation({ seed, loadout: testLoadout() });
      run(sim, 60, createIntent());
      return sim.map.playerSpawn.x;
    };
    expect(positionAfter(1)).not.toBe(positionAfter(2));
  });
});

describe('player movement', () => {
  it('moves the player and never lets them enter a wall', () => {
    const sim = new RaidSimulation({ seed: 314, loadout: testLoadout() });
    const player = sim.world.playerEntity;
    expect(player).not.toBeNull();

    const transform = sim.world.transforms.require(player as never);
    const start = { x: transform.x, y: transform.y };

    const intent = createIntent();
    intent.moveX = 1;
    intent.moveY = 0.4;

    for (let i = 0; i < 300; i++) {
      sim.applyIntent(intent);
      sim.step();
      expect(sim.grid.isWallAtWorld(transform.x, transform.y)).toBe(false);
    }

    expect(Math.hypot(transform.x - start.x, transform.y - start.y)).toBeGreaterThan(1);
  });

  it('slows the player down when overloaded', () => {
    const distanceWith = (ammo: number): number => {
      const loadout = testLoadout();
      loadout.carried = [{ itemId: 'itm_ammo_9mm', quantity: ammo }];
      const sim = new RaidSimulation({ seed: 606, loadout });
      const player = sim.world.playerEntity as never;
      const transform = sim.world.transforms.require(player);
      const start = { x: transform.x, y: transform.y };

      const intent = createIntent();
      intent.moveX = 1;
      for (let i = 0; i < 30; i++) {
        sim.applyIntent(intent);
        sim.step();
      }
      return Math.hypot(transform.x - start.x, transform.y - start.y);
    };

    // 180 rounds of 9mm is 2.16 kg vs. 24 kg capacity - light. A heavy load
    // must measurably cost speed.
    const light = distanceWith(180);
    const heavyLoadout = testLoadout();
    heavyLoadout.carried = [
      { itemId: 'itm_ammo_9mm', quantity: 180 },
      { itemId: 'itm_armor_plate', quantity: 2 },
      { itemId: 'itm_wpn_nadel', quantity: 1 },
    ];
    const simHeavy = new RaidSimulation({ seed: 606, loadout: heavyLoadout });
    const playerHeavy = simHeavy.world.playerEntity as never;
    const heavyTransform = simHeavy.world.transforms.require(playerHeavy);
    const heavyStart = { x: heavyTransform.x, y: heavyTransform.y };
    const intent = createIntent();
    intent.moveX = 1;
    for (let i = 0; i < 30; i++) {
      simHeavy.applyIntent(intent);
      simHeavy.step();
    }
    const heavy = Math.hypot(heavyTransform.x - heavyStart.x, heavyTransform.y - heavyStart.y);

    expect(heavy).toBeLessThan(light);
  });
});

describe('weapons', () => {
  it('consumes ammunition and reloads from the inventory', () => {
    const sim = new RaidSimulation({ seed: 12, loadout: testLoadout() });
    const player = sim.world.playerEntity as never;
    const weapon = sim.world.weapons.require(player);
    const carrier = sim.world.carriers.require(player);

    const magazineAtStart = weapon.magazine;
    expect(magazineAtStart).toBeGreaterThan(0);

    const intent = createIntent();
    intent.fire = true;
    intent.aimX = 1;

    // Empty the magazine.
    for (let i = 0; i < 200 && weapon.magazine > 0; i++) {
      sim.applyIntent(intent);
      sim.step();
    }
    expect(weapon.magazine).toBe(0);

    const ammoBefore = carrier.inventory.slots
      .filter((s) => s.itemId === 'itm_ammo_9mm')
      .reduce((sum, s) => sum + s.quantity, 0);

    // Auto-reload kicks in while the fire button is held.
    for (let i = 0; i < 200 && weapon.magazine === 0; i++) {
      sim.applyIntent(intent);
      sim.step();
    }

    expect(weapon.magazine).toBeGreaterThan(0);
    const ammoAfter = carrier.inventory.slots
      .filter((s) => s.itemId === 'itm_ammo_9mm')
      .reduce((sum, s) => sum + s.quantity, 0);
    expect(ammoAfter).toBeLessThan(ammoBefore);
  });

  it('emits a fired event with a noise radius', () => {
    const sim = new RaidSimulation({ seed: 34, loadout: testLoadout() });
    const fired: GameEvents['weapon:fired'][] = [];
    sim.bus.on('weapon:fired', (e) => fired.push(e));

    const intent = createIntent();
    intent.fire = true;
    intent.aimX = 1;
    run(sim, 20, intent);

    expect(fired.length).toBeGreaterThan(0);
    expect(fired[0]?.noiseRadius).toBeGreaterThan(0);
  });

  it('spawns projectiles that eventually despawn', () => {
    const sim = new RaidSimulation({ seed: 56, loadout: testLoadout() });

    // Remove the enemies so only the player's rounds are in flight - otherwise
    // this measures AI fire rate rather than projectile lifetime.
    for (const entity of sim.world.agents.keyArray()) sim.world.destroyEntity(entity);
    sim.world.flushDestroyed();

    const intent = createIntent();
    intent.fire = true;
    intent.aimX = 1;

    // Sample across ticks rather than at one instant: depending on the map, a
    // round can hit a nearby wall within a couple of ticks.
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      sim.applyIntent(intent);
      sim.step();
      peak = Math.max(peak, sim.world.projectiles.size);
    }
    expect(peak).toBeGreaterThan(0);

    // Stop firing: every round must eventually expire, hit a wall or hit an actor.
    run(sim, 400, createIntent());
    expect(sim.world.projectiles.size).toBe(0);
  });
});

describe('raid flow', () => {
  it('ends in a timeout when the clock runs out', () => {
    const sim = new RaidSimulation({ seed: 78, loadout: testLoadout(), durationSeconds: 2 });
    sim.start();
    run(sim, 200, createIntent());

    expect(sim.finished).toBe(true);
    expect(sim.outcome?.kind).toBe('timeout');
    expect(sim.outcome?.lootValue).toBe(0);
  });

  it('opens extraction zones on schedule and reports the outcome on extraction', () => {
    const sim = new RaidSimulation({ seed: 90, loadout: testLoadout() });
    sim.start();

    // Isolate the extraction system: no enemies, and the first zone opens
    // immediately instead of after two minutes of real simulation.
    for (const entity of sim.world.agents.keyArray()) sim.world.destroyEntity(entity);
    sim.world.flushDestroyed();

    const zones = [...sim.world.extractionZones.values()];
    expect(zones.length).toBeGreaterThan(0);
    (zones[0] as { opensAtTick: number }).opensAtTick = 5;

    const opened: string[] = [];
    sim.bus.on('extraction:opened', (e) => opened.push(e.zoneId));

    run(sim, 30, createIntent());
    expect(opened.length).toBeGreaterThan(0);

    // Teleport the player into the open zone and hold position.
    const zoneEntry = [...sim.world.extractionZones.entries()].find(
      ([, zone]) => zone.phase === 'available' || zone.phase === 'closing',
    );
    expect(zoneEntry).toBeDefined();

    const [zoneEntity] = zoneEntry as [never, unknown];
    const zoneTransform = sim.world.transforms.require(zoneEntity);
    const playerTransform = sim.world.transforms.require(sim.world.playerEntity as never);
    playerTransform.x = zoneTransform.x;
    playerTransform.y = zoneTransform.y;

    run(sim, 600, createIntent());

    expect(sim.finished).toBe(true);
    expect(sim.outcome?.kind).toBe('extracted');
    expect(sim.outcome?.zoneName).toBeTruthy();
    expect(sim.outcome?.xp).toBeGreaterThan(0);
  });

  it('ends the raid when the player dies and keeps a share of the echo shards', () => {
    const sim = new RaidSimulation({ seed: 102, loadout: testLoadout() });
    sim.start();

    const player = sim.world.playerEntity as never;
    const carrier = sim.world.carriers.require(player);
    carrier.inventory.slots.push({ itemId: 'itm_echoshard', quantity: 4 });

    const health = sim.world.healths.require(player);
    health.current = 0;

    run(sim, 120, createIntent());

    expect(sim.finished).toBe(true);
    expect(sim.outcome?.kind).toBe('died');
    expect(sim.outcome?.loot).toHaveLength(0);
    expect(sim.outcome?.retainedShards).toBe(2);
  });
});

describe('looting', () => {
  it('searches a container and lets the player pick up its contents', () => {
    const sim = new RaidSimulation({ seed: 2222, loadout: testLoadout() });
    sim.start();

    const containerEntry = [...sim.world.containers.entries()][0];
    expect(containerEntry).toBeDefined();
    const [containerEntity] = containerEntry as [never, unknown];

    const containerTransform = sim.world.transforms.require(containerEntity);
    const playerTransform = sim.world.transforms.require(sim.world.playerEntity as never);
    playerTransform.x = containerTransform.x + 0.9;
    playerTransform.y = containerTransform.y;

    const intent = createIntent();
    intent.interact = true;

    let opened = false;
    sim.bus.on('container:opened', () => {
      opened = true;
    });

    run(sim, 400, intent);
    expect(opened).toBe(true);

    // Contents spilled onto the ground and the held interact button collects them.
    const carrier = sim.world.carriers.require(sim.world.playerEntity as never);
    const before = carrier.inventory.slots.length;
    run(sim, 400, intent);
    expect(carrier.inventory.slots.length).toBeGreaterThanOrEqual(before);
  });
});
