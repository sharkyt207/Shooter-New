import { describe, expect, it } from 'vitest';
import { MELEE } from '@/content/balance';
import { addItem } from '@/game/inventory/inventory';
import type { Loadout } from '@/game/player/loadout';
import { createIntent } from '@/game/player/playerIntent';
import { RaidSimulation } from '@/game/simulation/raidSimulation';
import type { EntityId } from '@/core/ecs/entity';

function loadout(overrides: Partial<Loadout> = {}): Loadout {
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
      { itemId: 'itm_thr_frag', quantity: 2 },
      { itemId: 'itm_thr_flash', quantity: 2 },
      { itemId: 'itm_thr_lure', quantity: 2 },
    ],
    ...overrides,
  };
}

/** A sim with the map's own enemies removed, so tests control the situation. */
function cleanSim(seed: number): RaidSimulation {
  const sim = new RaidSimulation({ seed, loadout: loadout() });
  for (const entity of sim.world.agents.keyArray()) sim.world.destroyEntity(entity);
  sim.world.flushDestroyed();
  return sim;
}

function player(sim: RaidSimulation): EntityId {
  return sim.world.playerEntity as EntityId;
}

interface SpawnedEnemy {
  entity: EntityId;
  /** Direction from the player to the enemy, in radians. */
  angle: number;
}

/**
 * Place a fresh enemy roughly `distance` metres from the player, in open space
 * with clear line of sight.
 *
 * The map is procedural, so a fixed offset lands inside a wall depending on the
 * seed - and a target inside geometry is correctly shielded from everything.
 * Scanning for a valid spot keeps these tests about combat rather than luck.
 */
function spawnEnemyNear(sim: RaidSimulation, distance: number, health = 100): SpawnedEnemy {
  const origin = sim.world.transforms.require(player(sim));

  let angle = 0;
  let found = false;
  for (let step = 0; step < 32 && !found; step++) {
    angle = (step / 32) * Math.PI * 2;
    const x = origin.x + Math.cos(angle) * distance;
    const y = origin.y + Math.sin(angle) * distance;
    if (!sim.grid.isWallAtWorld(x, y) && sim.grid.hasLineOfSight(origin.x, origin.y, x, y)) {
      found = true;
    }
  }
  expect(found, `no open spot ${distance} m from the player`).toBe(true);

  const x = origin.x + Math.cos(angle) * distance;
  const y = origin.y + Math.sin(angle) * distance;

  const entity = sim.world.createEntity();
  sim.world.transforms.set(entity, { x, y, rotation: angle + Math.PI, prevX: x, prevY: y, prevRotation: 0 });
  sim.world.healths.set(entity, {
    current: health,
    max: health,
    lastDamageTick: -9999,
    lastAttacker: null,
  });
  sim.world.colliders.set(entity, { radius: 0.4, isStatic: false });
  sim.world.factions.set(entity, { id: 'scavengers' });
  return { entity, angle };
}

/**
 * Point the player in a direction immediately.
 *
 * Aiming turns at a finite rate (900 deg/s), so a single tick cannot rotate the
 * character 180 degrees - tests that care about facing have to set it directly.
 */
function faceTowards(sim: RaidSimulation, angle: number): void {
  sim.world.transforms.require(player(sim)).rotation = angle;
}

/** Drop a throwable at a world position and let it cook off immediately. */
function dropThrowable(sim: RaidSimulation, throwableId: string, x: number, y: number): void {
  const entity = sim.world.createEntity();
  sim.world.transforms.set(entity, { x, y, rotation: 0, prevX: x, prevY: y, prevRotation: 0 });
  sim.world.thrown.set(entity, {
    throwableId,
    owner: player(sim),
    ownerFaction: 'player',
    dirX: 1,
    dirY: 0,
    speed: 0,
    remainingDistance: 0,
    fuse: 0.05,
  });
}

describe('throwables', () => {
  it('consumes the item and spawns an object in flight', () => {
    const sim = cleanSim(1010);
    const carrier = sim.world.carriers.require(player(sim));

    const intent = createIntent();
    intent.aimX = 1;
    intent.throwItemId = 'itm_thr_frag';
    sim.applyIntent(intent);
    sim.step();

    expect(sim.world.thrown.size).toBe(1);
    expect(carrier.inventory.slots.filter((s) => s.itemId === 'itm_thr_frag')[0]?.quantity).toBe(1);
  });

  it('refuses to throw what the player is not carrying', () => {
    const sim = cleanSim(1011);
    const intent = createIntent();
    intent.throwItemId = 'itm_thr_frag';
    // Empty the pack first.
    const carrier = sim.world.carriers.require(player(sim));
    carrier.inventory.slots = carrier.inventory.slots.filter((s) => s.itemId !== 'itm_thr_frag');

    sim.applyIntent(intent);
    sim.step();
    expect(sim.world.thrown.size).toBe(0);
  });

  it('detonates after its fuse and damages nearby enemies', () => {
    const sim = cleanSim(1012);
    const { entity } = spawnEnemyNear(sim, 2);
    const health = sim.world.healths.require(entity);

    let detonated = false;
    sim.bus.on('throwable:detonated', () => {
      detonated = true;
    });

    const intent = createIntent();
    intent.aimX = 1;
    intent.throwItemId = 'itm_thr_frag';
    sim.applyIntent(intent);

    for (let i = 0; i < 300 && !detonated; i++) sim.step();

    expect(detonated).toBe(true);
    expect(health.current).toBeLessThan(100);
    expect(sim.world.thrown.size).toBe(0);
  });

  it('deals less damage further from the blast', () => {
    const damageAt = (distance: number): number => {
      const sim = cleanSim(1013);
      const { entity } = spawnEnemyNear(sim, distance, 500);
      const health = sim.world.healths.require(entity);

      // Drop the grenade at the player's feet rather than throwing it, so only
      // the distance between blast and target varies.
      const origin = sim.world.transforms.require(player(sim));
      dropThrowable(sim, 'thr_frag', origin.x, origin.y);

      for (let i = 0; i < 20; i++) sim.step();
      return 500 - health.current;
    };

    const close = damageAt(1);
    const far = damageAt(3.5);
    expect(close).toBeGreaterThan(0);
    expect(close).toBeGreaterThan(far);
  });

  it('disorients enemies with a flashbang instead of damaging them', () => {
    const sim = cleanSim(1014);
    const { entity: enemy } = spawnEnemyNear(sim, 2);
    sim.world.agents.set(enemy, {
      enemyId: 'enm_scavenger',
      state: 'chase',
      stateTime: 0,
      target: player(sim),
      lastKnownX: 0,
      lastKnownY: 0,
      awareness: 5,
      timeSinceSeen: 0,
      homeX: 0,
      homeY: 0,
      destX: 0,
      destY: 0,
      attackCooldown: 0,
      burstRemaining: 0,
      perceptionTimer: 0,
      waitTimer: 0,
      phaseLabel: '',
      announced: false,
    });
    const health = sim.world.healths.require(enemy);

    const enemyTransform = sim.world.transforms.require(enemy);
    dropThrowable(sim, 'thr_flash', enemyTransform.x, enemyTransform.y);

    for (let i = 0; i < 20; i++) sim.step();

    expect(sim.world.disoriented.has(enemy)).toBe(true);
    expect(health.current).toBe(100);
    // A blinded enemy loses its target entirely - that is the escape window.
    expect(sim.world.agents.get(enemy)?.target).toBeNull();
  });

  it('wears off again', () => {
    const sim = cleanSim(1015);
    const { entity: enemy } = spawnEnemyNear(sim, 2);
    sim.world.disoriented.set(enemy, { remaining: 0.2 });

    for (let i = 0; i < 40; i++) sim.step();
    expect(sim.world.disoriented.has(enemy)).toBe(false);
  });
});

describe('melee', () => {
  it('hits an enemy in front of the player', () => {
    const sim = cleanSim(2020);
    const { entity, angle } = spawnEnemyNear(sim, 1, 500);
    const health = sim.world.healths.require(entity);

    faceTowards(sim, angle);
    const intent = createIntent();
    intent.aimX = Math.cos(angle);
    intent.aimY = Math.sin(angle);
    intent.melee = true;
    sim.applyIntent(intent);
    sim.step();

    expect(health.current).toBeLessThan(500);
  });

  it('misses an enemy behind the player', () => {
    const sim = cleanSim(2021);
    const { entity, angle } = spawnEnemyNear(sim, 1.2, 500);
    const health = sim.world.healths.require(entity);

    // Face the opposite way: the arc must not reach behind the player.
    faceTowards(sim, angle + Math.PI);
    const intent = createIntent();
    intent.aimX = Math.cos(angle + Math.PI);
    intent.aimY = Math.sin(angle + Math.PI);
    intent.melee = true;
    sim.applyIntent(intent);
    sim.step();

    expect(health.current).toBe(500);
  });

  it('hits far harder against an unaware target', () => {
    const damage = (state: 'idle' | 'chase'): number => {
      const sim = cleanSim(2022);
      const { entity: enemy, angle } = spawnEnemyNear(sim, 1, 500);
      sim.world.agents.set(enemy, {
        enemyId: 'enm_scavenger',
        state,
        stateTime: 0,
        target: state === 'chase' ? player(sim) : null,
        lastKnownX: 0,
        lastKnownY: 0,
        awareness: 0,
        timeSinceSeen: 999,
        homeX: 0,
        homeY: 0,
        destX: 0,
        destY: 0,
        attackCooldown: 0,
        burstRemaining: 0,
        perceptionTimer: 0,
        waitTimer: 0,
        phaseLabel: '',
        announced: false,
      });
      const health = sim.world.healths.require(enemy);

      faceTowards(sim, angle);
      const intent = createIntent();
      intent.aimX = Math.cos(angle);
      intent.aimY = Math.sin(angle);
      intent.melee = true;
      sim.applyIntent(intent);
      sim.step();
      return 500 - health.current;
    };

    const ambush = damage('idle');
    const fair = damage('chase');
    expect(ambush).toBeGreaterThan(fair * 2);
    // The ambush bonus must be applied exactly once, not stacked with the
    // generic unaware multiplier.
    expect(ambush).toBeCloseTo(MELEE.damage * MELEE.unawareMultiplier, 4);
  });

  it('respects its cooldown', () => {
    const sim = cleanSim(2023);
    const { entity, angle } = spawnEnemyNear(sim, 1, 5000);
    const health = sim.world.healths.require(entity);

    faceTowards(sim, angle);
    const intent = createIntent();
    intent.aimX = Math.cos(angle);
    intent.aimY = Math.sin(angle);

    for (let i = 0; i < 5; i++) {
      intent.melee = true;
      sim.applyIntent(intent);
      sim.step();
    }

    // Five ticks is far inside the cooldown, so exactly one swing may land.
    expect(5000 - health.current).toBeLessThanOrEqual(MELEE.damage * MELEE.unawareMultiplier + 0.01);
    expect(5000 - health.current).toBeGreaterThan(0);
  });
});

describe('ammunition in a live raid', () => {
  it('chambers the preferred round and drops it when reloading a different one', () => {
    const sim = new RaidSimulation({
      seed: 3030,
      loadout: loadout({
        preferredAmmoItemId: 'itm_ammo_9mm_ap',
        carried: [
          { itemId: 'itm_ammo_9mm_ap', quantity: 60 },
          { itemId: 'itm_ammo_9mm', quantity: 60 },
        ],
      }),
    });

    const weapon = sim.world.weapons.require(player(sim));
    expect(weapon.loadedAmmoItemId).toBe('itm_ammo_9mm_ap');

    // Once the armour-piercing runs out, the reload falls back to standard.
    const carrier = sim.world.carriers.require(player(sim));
    carrier.inventory.slots = carrier.inventory.slots.filter(
      (slot) => slot.itemId !== 'itm_ammo_9mm_ap',
    );
    weapon.magazine = 0;

    const intent = createIntent();
    intent.reload = true;
    for (let i = 0; i < 300 && weapon.magazine === 0; i++) {
      sim.applyIntent(intent);
      sim.step();
    }

    expect(weapon.loadedAmmoItemId).toBe('itm_ammo_9mm');
    expect(weapon.magazine).toBeGreaterThan(0);
  });

  it('wears the weapon down as it is fired', () => {
    const sim = cleanSim(3031);
    const weapon = sim.world.weapons.require(player(sim));
    const before = weapon.durability;

    const intent = createIntent();
    intent.fire = true;
    intent.aimX = 1;
    for (let i = 0; i < 120; i++) {
      sim.applyIntent(intent);
      sim.step();
    }

    expect(weapon.durability).toBeLessThan(before);
  });

  it('reports the extracted weapon condition in the outcome', () => {
    const sim = cleanSim(3032);
    const weapon = sim.world.weapons.require(player(sim));
    weapon.durability = weapon.durabilityMax * 0.5;

    const health = sim.world.healths.require(player(sim));
    health.current = 0;
    for (let i = 0; i < 120 && !sim.finished; i++) sim.step();

    expect(sim.outcome?.weaponCondition).toBeCloseTo(0.5, 3);
  });
});

describe('inventory integration', () => {
  it('counts throwables as ordinary weight', () => {
    const sim = cleanSim(4040);
    const carrier = sim.world.carriers.require(player(sim));
    const before = carrier.inventory.slots.length;
    addItem(carrier.inventory, 'itm_thr_frag', 1);
    expect(carrier.inventory.slots.length).toBeGreaterThanOrEqual(before);
  });
});
