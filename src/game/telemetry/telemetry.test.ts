import { describe, expect, it } from 'vitest';

import { EventBus } from '@/core/events/eventBus';
import type { EntityId } from '@/core/ecs/entity';
import type { GameEvents, RaidOutcome, RaidOutcomeKind } from '@/game/gameEvents';
import {
  TELEMETRY_CAPACITY,
  createRaidRecorder,
  emptyTelemetry,
  parseTelemetry,
  recordRaid,
  summarise,
  type DeathCause,
  type RaidRecord,
} from './telemetry';

const PLAYER = 1 as EntityId;
const ENEMY = 2 as EntityId;

function outcome(kind: RaidOutcomeKind, overrides: Partial<RaidOutcome> = {}): RaidOutcome {
  return {
    kind,
    durationSeconds: 300,
    kills: 0,
    xp: 0,
    lootValue: 0,
    loot: [],
    securedLoot: [],
    securedValue: 0,
    vaultsOpened: 0,
    anomaliesSurvived: 0,
    retainedShards: 0,
    zoneName: null,
    weaponCondition: 1,
    ...overrides,
  };
}

function damage(overrides: Partial<GameEvents['damage:dealt']>): GameEvents['damage:dealt'] {
  return {
    target: ENEMY,
    source: PLAYER,
    amount: 10,
    cause: 'gunfire',
    absorbed: 0,
    x: 0,
    y: 0,
    isPlayerTarget: false,
    wasUnaware: false,
    zone: null,
    penetrated: true,
    fragmented: false,
    ...overrides,
  };
}

function record(overrides: Partial<RaidRecord> = {}): RaidRecord {
  return {
    seed: 1,
    outcome: 'extracted',
    durationSeconds: 300,
    kills: 0,
    lootValue: 0,
    securedValue: 0,
    damageTaken: 0,
    shotsFired: 0,
    hits: 0,
    itemsLooted: 0,
    containersOpened: 0,
    anomaliesEntered: 0,
    vaultsOpened: 0,
    bossEngaged: false,
    deathCause: null,
    balanceVersion: 'default',
    ...overrides,
  };
}

describe('createRaidRecorder', () => {
  it("counts only the player's shots, not the whole firefight", () => {
    const bus = new EventBus<GameEvents>();
    const recorder = createRaidRecorder(bus, 7, 'default', PLAYER);

    const shot = { weaponId: 'w', x: 0, y: 0, rotation: 0, noiseRadius: 10 };
    bus.emit('weapon:fired', { entity: PLAYER, ...shot });
    bus.emit('weapon:fired', { entity: ENEMY, ...shot });
    bus.emit('weapon:fired', { entity: PLAYER, ...shot });

    expect(recorder.finish(outcome('extracted')).shotsFired).toBe(2);
  });

  it('separates damage taken from damage dealt', () => {
    const bus = new EventBus<GameEvents>();
    const recorder = createRaidRecorder(bus, 7, 'default', PLAYER);

    bus.emit('damage:dealt', damage({ target: PLAYER, source: ENEMY, amount: 30, isPlayerTarget: true }));
    bus.emit('damage:dealt', damage({ amount: 12 }));
    bus.emit('damage:dealt', damage({ amount: 12 }));

    const result = recorder.finish(outcome('extracted'));
    expect(result.damageTaken).toBe(30);
    expect(result.hits).toBe(2);
  });

  it('does not credit the player for damage somebody else dealt', () => {
    const bus = new EventBus<GameEvents>();
    const recorder = createRaidRecorder(bus, 7, 'default', PLAYER);
    bus.emit('damage:dealt', damage({ source: ENEMY, target: 3 as EntityId }));
    expect(recorder.finish(outcome('extracted')).hits).toBe(0);
  });

  it.each<[DeathCause, DeathCause]>([
    ['gunfire', 'gunfire'],
    ['anomaly', 'anomaly'],
    ['explosion', 'explosion'],
    ['melee', 'melee'],
  ])('records %s as the cause of death', (cause, expected) => {
    const bus = new EventBus<GameEvents>();
    const recorder = createRaidRecorder(bus, 7, 'default', PLAYER);

    // Shot first, then finished off by something else: the *last* thing that
    // hurt the player is what killed them.
    bus.emit('damage:dealt', damage({ target: PLAYER, isPlayerTarget: true, cause: 'gunfire' }));
    bus.emit('damage:dealt', damage({ target: PLAYER, isPlayerTarget: true, cause: cause as never }));

    expect(recorder.finish(outcome('died')).deathCause).toBe(expected);
  });

  it('reports "unknown" for a death nothing was seen to cause', () => {
    const bus = new EventBus<GameEvents>();
    const recorder = createRaidRecorder(bus, 7, 'default', PLAYER);
    expect(recorder.finish(outcome('died')).deathCause).toBe('unknown');
  });

  it('leaves the cause null when the player did not die', () => {
    const bus = new EventBus<GameEvents>();
    const recorder = createRaidRecorder(bus, 7, 'default', PLAYER);
    bus.emit('damage:dealt', damage({ target: PLAYER, isPlayerTarget: true }));
    expect(recorder.finish(outcome('extracted')).deathCause).toBeNull();
  });

  it('stops listening once finished, so the next raid starts clean', () => {
    const bus = new EventBus<GameEvents>();
    const recorder = createRaidRecorder(bus, 7, 'default', PLAYER);
    const first = recorder.finish(outcome('extracted'));

    bus.emit('weapon:fired', {
      entity: PLAYER,
      weaponId: 'w',
      x: 0,
      y: 0,
      rotation: 0,
      noiseRadius: 10,
    });
    expect(first.shotsFired).toBe(0);
  });

  it("takes the outcome's own figures rather than recounting them", () => {
    const bus = new EventBus<GameEvents>();
    const recorder = createRaidRecorder(bus, 99, 'v2', PLAYER);
    const result = recorder.finish(
      outcome('extracted', { kills: 4, lootValue: 1200, securedValue: 300, vaultsOpened: 2 }),
    );
    expect(result).toMatchObject({
      seed: 99,
      balanceVersion: 'v2',
      kills: 4,
      lootValue: 1200,
      securedValue: 300,
      vaultsOpened: 2,
    });
  });
});

describe('recordRaid', () => {
  it('keeps the newest records and forgets the oldest', () => {
    let state = emptyTelemetry();
    for (let i = 0; i < TELEMETRY_CAPACITY + 10; i++) {
      state = recordRaid(state, record({ seed: i }));
    }
    expect(state.raids).toHaveLength(TELEMETRY_CAPACITY);
    expect(state.raids[0]?.seed).toBe(10);
    expect(state.raids.at(-1)?.seed).toBe(TELEMETRY_CAPACITY + 9);
  });

  it('keeps counting raids it no longer stores', () => {
    let state = emptyTelemetry();
    for (let i = 0; i < TELEMETRY_CAPACITY + 10; i++) state = recordRaid(state, record());
    expect(state.totalRaids).toBe(TELEMETRY_CAPACITY + 10);
  });
});

describe('summarise', () => {
  it('returns zeros rather than NaN on an empty buffer', () => {
    const summary = summarise(emptyTelemetry());
    expect(summary.extractionRate).toBe(0);
    expect(summary.hitsPerShot).toBeNull();
    expect(summary.deathCauses).toEqual([]);
  });

  it('splits the outcomes into rates that sum to one', () => {
    const state = build([
      record({ outcome: 'extracted' }),
      record({ outcome: 'extracted' }),
      record({ outcome: 'died', deathCause: 'gunfire' }),
      record({ outcome: 'timeout' }),
    ]);
    const summary = summarise(state);
    expect(summary.extractionRate).toBe(0.5);
    expect(summary.deathRate).toBe(0.25);
    expect(summary.timeoutRate).toBe(0.25);
    expect(summary.extractionRate + summary.deathRate + summary.timeoutRate).toBe(1);
  });

  it('ranks death causes by frequency, as a share of deaths', () => {
    const state = build([
      record({ outcome: 'died', deathCause: 'gunfire' }),
      record({ outcome: 'died', deathCause: 'gunfire' }),
      record({ outcome: 'died', deathCause: 'anomaly' }),
      record({ outcome: 'extracted' }),
    ]);
    const summary = summarise(state);
    expect(summary.deathCauses).toEqual([
      { cause: 'gunfire', count: 2, share: 2 / 3 },
      { cause: 'anomaly', count: 1, share: 1 / 3 },
    ]);
  });

  it('counts the secure container towards the value of a lost raid', () => {
    // The whole point of the secure container: a death is not a zero.
    const state = build([
      record({ outcome: 'died', lootValue: 0, securedValue: 400 }),
      record({ outcome: 'extracted', lootValue: 1000, securedValue: 200 }),
    ]);
    expect(summarise(state).averageValuePerRaid).toBe(800);
  });

  it('finds the longest run of deaths, not the last one', () => {
    const died = record({ outcome: 'died', deathCause: 'gunfire' });
    const out = record({ outcome: 'extracted' });
    const state = build([died, died, died, out, died, died, out, died]);
    expect(summarise(state).worstDeathStreak).toBe(3);
  });

  it('does not let a timeout break a death streak into two', () => {
    // A timeout is not a death, so it interrupts the streak. This asserts the
    // reading, because the opposite is just as defensible and must not drift.
    const died = record({ outcome: 'died', deathCause: 'gunfire' });
    const state = build([died, record({ outcome: 'timeout' }), died]);
    expect(summarise(state).worstDeathStreak).toBe(1);
  });

  it('divides hits by shots across the whole window, not per raid', () => {
    const state = build([
      record({ shotsFired: 10, hits: 2 }),
      record({ shotsFired: 30, hits: 18 }),
    ]);
    expect(summarise(state).hitsPerShot).toBe(20 / 40);
  });

  it('reports more hits than shots for a shotgun instead of clamping', () => {
    const state = build([record({ shotsFired: 4, hits: 21 })]);
    expect(summarise(state).hitsPerShot).toBeGreaterThan(1);
  });
});

describe('parseTelemetry', () => {
  it('round-trips through JSON', () => {
    const state = build([record({ seed: 5, outcome: 'died', deathCause: 'anomaly' })]);
    expect(parseTelemetry(JSON.stringify(state))).toEqual(state);
  });

  it.each([
    ['nothing stored', null],
    ['broken JSON', '{oh no'],
    ['a bare number', '42'],
    ['a future version', '{"version":2,"totalRaids":3,"raids":[]}'],
    ['a missing array', '{"version":1,"totalRaids":3}'],
  ])('starts fresh on %s', (_label, raw) => {
    expect(parseTelemetry(raw)).toEqual(emptyTelemetry());
  });

  it('drops individual records that are not recognisably records', () => {
    const good = record({ seed: 1 });
    const raw = JSON.stringify({
      version: 1,
      totalRaids: 3,
      raids: [good, { seed: 2 }, null, { ...good, outcome: 'vanished' }],
    });
    const parsed = parseTelemetry(raw);
    expect(parsed.raids).toEqual([good]);
    expect(parsed.totalRaids).toBe(3);
  });

  it('never reports fewer total raids than it holds records', () => {
    const raw = JSON.stringify({ version: 1, totalRaids: 0, raids: [record(), record()] });
    expect(parseTelemetry(raw).totalRaids).toBe(2);
  });
});

function build(raids: RaidRecord[]) {
  return { version: 1 as const, totalRaids: raids.length, raids };
}
