import { describe, expect, it } from 'vitest';
import { AI } from '@/content/balance';
import { getEnemy } from '@/content/enemies';
import type { EntityId } from '@/core/ecs/entity';
import type { Loadout } from '@/game/player/loadout';
import { createIntent } from '@/game/player/playerIntent';
import { RaidSimulation } from '@/game/simulation/raidSimulation';

function loadout(): Loadout {
  return {
    weaponItemId: 'itm_wpn_splitter',
    armorItemId: 'itm_armor_fiber',
    helmetItemId: null,
    backpackItemId: 'itm_bag_medium',
    attachments: {},
    preferredAmmoItemId: 'itm_ammo_9mm',
    weaponCondition: 1,
    carried: [{ itemId: 'itm_ammo_9mm', quantity: 120 }],
  };
}

function player(sim: RaidSimulation): EntityId {
  return sim.world.playerEntity as EntityId;
}

describe('squad formation', () => {
  it('groups spawned enemies into squads', () => {
    const sim = new RaidSimulation({ seed: 5001, loadout: loadout() });

    expect(sim.world.agents.size).toBeGreaterThan(0);
    expect(sim.squads.count).toBeGreaterThan(0);

    // Every enemy belongs to exactly one squad.
    for (const entity of sim.world.agents.keyArray()) {
      const member = sim.world.squadMembers.get(entity);
      expect(member, `entity ${entity} has no squad`).toBeDefined();
      expect(sim.squads.get(member?.squadId ?? -1)).toBeDefined();
    }
  });

  it('never exceeds the maximum squad size', () => {
    for (const seed of [11, 22, 33, 44]) {
      const sim = new RaidSimulation({ seed, loadout: loadout() });
      for (const squad of sim.squads.all()) {
        expect(squad.members.length).toBeLessThanOrEqual(AI.maxSquadSize);
      }
    }
  });

  it('never mixes factions inside a squad', () => {
    for (const seed of [101, 202, 303]) {
      const sim = new RaidSimulation({ seed, loadout: loadout() });
      for (const squad of sim.squads.all()) {
        for (const member of squad.members) {
          expect(sim.world.factions.get(member)?.id).toBe(squad.faction);
        }
      }
    }
  });

  it('forgets dead members', () => {
    const sim = new RaidSimulation({ seed: 5002, loadout: loadout() });
    const victim = sim.world.agents.keyArray()[0] as EntityId;
    const member = sim.world.squadMembers.require(victim);
    const squad = sim.squads.get(member.squadId);
    const before = squad?.members.length ?? 0;

    sim.world.healths.require(victim).current = 0;
    sim.step();

    const after = sim.squads.get(member.squadId);
    // Either the squad shrank, or it was dropped entirely when it emptied.
    expect(after === undefined || after.members.length < before).toBe(true);
    expect(after?.members.includes(victim) ?? false).toBe(false);
  });
});

describe('shared knowledge', () => {
  it('spreads a sighting to the whole squad', () => {
    const sim = new RaidSimulation({ seed: 5003, loadout: loadout() });

    // Find a squad with at least two members and drop the player next to one.
    const squad = [...sim.squads.all()].find((candidate) => candidate.members.length >= 2);
    if (!squad) return; // seed produced only lone enemies; nothing to assert

    const scout = squad.members[0] as EntityId;
    const scoutTransform = sim.world.transforms.require(scout);
    const playerTransform = sim.world.transforms.require(player(sim));
    playerTransform.x = scoutTransform.x + 1.5;
    playerTransform.y = scoutTransform.y;
    scoutTransform.rotation = 0;

    const intent = createIntent();
    for (let i = 0; i < 120; i++) {
      sim.applyIntent(intent);
      sim.step();
      if (squad.target !== null) break;
    }

    expect(squad.target).toBe(player(sim));
    // Every member now knows where to go, not just the one who looked.
    expect(Math.hypot(squad.lastKnownX - playerTransform.x, squad.lastKnownY - playerTransform.y))
      .toBeLessThan(6);
  });
});

describe('faction warfare', () => {
  it('lets hostile factions damage each other', () => {
    const sim = new RaidSimulation({ seed: 5004, loadout: loadout() });

    // Put a scavenger and an Order runner face to face, far from the player.
    const spawn = sim.map.playerSpawn;
    let placed = 0;
    let x = spawn.x;
    let y = spawn.y;
    for (let attempt = 0; attempt < 400 && placed === 0; attempt++) {
      const cx = 2 + (attempt % (sim.grid.width - 4));
      const cy = 2 + Math.floor(attempt / (sim.grid.width - 4));
      if (cy >= sim.grid.height - 2) break;
      if (!sim.grid.isOpen(cx, cy) || !sim.grid.isOpen(cx + 2, cy)) continue;
      x = sim.grid.cellCenterX(cx);
      y = sim.grid.cellCenterY(cy);
      if (Math.hypot(x - spawn.x, y - spawn.y) < 25) continue;
      placed = 1;
    }
    if (placed === 0) return;

    const scav = spawnFighter(sim, 'enm_scavenger', 'scavengers', x, y, 0);
    const order = spawnFighter(sim, 'enm_order_runner', 'order', x + 4, y, Math.PI);

    const scavHealth = sim.world.healths.require(scav);
    const orderHealth = sim.world.healths.require(order);

    const intent = createIntent();
    for (let i = 0; i < 900; i++) {
      sim.applyIntent(intent);
      sim.step();
      if (scavHealth.current < 58 || orderHealth.current < 105) break;
    }

    // Somebody shot somebody. Which one does not matter.
    expect(scavHealth.current < 58 || orderHealth.current < 105).toBe(true);
  });

  it('never has an enemy target an ally', () => {
    const sim = new RaidSimulation({ seed: 5005, loadout: loadout() });
    const intent = createIntent();
    for (let i = 0; i < 400; i++) {
      sim.applyIntent(intent);
      sim.step();
    }

    for (const [entity, agent] of sim.world.agents.entries()) {
      if (agent.target === null) continue;
      const self = sim.world.factions.get(entity);
      const target = sim.world.factions.get(agent.target);
      if (!self || !target) continue;
      expect(target.id, `${self.id} targeted an ally`).not.toBe(self.id);
    }
  });
});

describe('the Warden', () => {
  it('appears in some raids and not others', () => {
    let withBoss = 0;
    const runs = 40;
    for (let seed = 0; seed < runs; seed++) {
      const sim = new RaidSimulation({ seed: 90000 + seed, loadout: loadout() });
      if (sim.map.enemies.some((enemy) => enemy.enemyId === 'enm_warden')) withBoss++;
    }
    expect(withBoss).toBeGreaterThan(0);
    expect(withBoss).toBeLessThan(runs);
  });

  it('spawns far from the player', () => {
    for (let seed = 0; seed < 60; seed++) {
      const sim = new RaidSimulation({ seed: 70000 + seed, loadout: loadout() });
      const warden = sim.map.enemies.find((enemy) => enemy.enemyId === 'enm_warden');
      if (!warden) continue;
      const distance = Math.hypot(
        warden.x - sim.map.playerSpawn.x,
        warden.y - sim.map.playerSpawn.y,
      );
      expect(distance).toBeGreaterThanOrEqual(30);
    }
  });

  it('changes phase as its health falls', () => {
    const def = getEnemy('enm_warden');
    expect(def.phases).toBeDefined();
    const phases = def.phases ?? [];

    // Phases must be ordered and cover the whole range down to zero.
    for (let i = 1; i < phases.length; i++) {
      expect((phases[i] as { healthAbove: number }).healthAbove).toBeLessThan(
        (phases[i - 1] as { healthAbove: number }).healthAbove,
      );
    }
    expect(phases[phases.length - 1]?.healthAbove).toBe(0);
    // It gets faster as it gets hurt, never slower.
    expect(phases[phases.length - 1]?.speedMult as number).toBeGreaterThan(
      phases[0]?.speedMult as number,
    );
  });

  it('announces itself only once it has the player', () => {
    const sim = findSimWithWarden();
    if (!sim) return;

    const wardenEntry = [...sim.world.agents.entries()].find(
      ([, agent]) => agent.enemyId === 'enm_warden',
    );
    expect(wardenEntry).toBeDefined();
    const [warden, agent] = wardenEntry as [EntityId, { announced: boolean; target: EntityId | null }];

    let engaged = 0;
    sim.bus.on('boss:engaged', () => engaged++);

    // Nothing announced while it has not seen anyone.
    sim.step();
    expect(engaged).toBe(0);

    // Force contact.
    agent.target = player(sim);
    sim.step();

    expect(engaged).toBe(1);
    expect(sim.world.agents.get(warden)?.announced).toBe(true);

    // The banner must not repeat every tick.
    sim.step();
    sim.step();
    expect(engaged).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function findSimWithWarden(): RaidSimulation | null {
  for (let seed = 0; seed < 80; seed++) {
    const sim = new RaidSimulation({ seed: 70000 + seed, loadout: loadout() });
    if (sim.map.enemies.some((enemy) => enemy.enemyId === 'enm_warden')) return sim;
  }
  return null;
}

/** Drop an armed, alert enemy at a position, already facing a direction. */
function spawnFighter(
  sim: RaidSimulation,
  enemyId: string,
  faction: 'scavengers' | 'order',
  x: number,
  y: number,
  rotation: number,
): EntityId {
  const entity = sim.world.createEntity();
  const def = getEnemy(enemyId as never);

  sim.world.transforms.set(entity, { x, y, rotation, prevX: x, prevY: y, prevRotation: rotation });
  sim.world.velocities.set(entity, { x: 0, y: 0 });
  sim.world.colliders.set(entity, { radius: def.radius, isStatic: false });
  sim.world.healths.set(entity, {
    current: def.health,
    max: def.health,
    lastDamageTick: -9999,
    lastAttacker: null,
  });
  sim.world.factions.set(entity, { id: faction });
  sim.world.weapons.set(entity, {
    weaponId: def.weaponId,
    magazine: 30,
    loadedAmmoItemId: null,
    cooldown: 0,
    reloadRemaining: 0,
    bloomDeg: 0,
    durability: 100,
    durabilityMax: 100,
    jamRemaining: 0,
  });
  sim.world.agents.set(entity, {
    enemyId,
    state: 'idle',
    stateTime: 0,
    target: null,
    lastKnownX: x,
    lastKnownY: y,
    awareness: 0,
    timeSinceSeen: 999,
    homeX: x,
    homeY: y,
    destX: x,
    destY: y,
    attackCooldown: 0,
    burstRemaining: 0,
    perceptionTimer: 0,
    waitTimer: 0,
    phaseLabel: '',
    announced: false,
  });

  const squad = sim.squads.create(faction);
  squad.members.push(entity);
  sim.world.squadMembers.set(entity, { squadId: squad.id, role: 'assault', throwCooldown: 0 });

  return entity;
}
