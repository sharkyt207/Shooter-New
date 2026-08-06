/**
 * Telemetry — on the device, for the person who balances the game.
 *
 * **Nothing here leaves the phone.** There is no endpoint, no identifier, no
 * network call anywhere in this module or in anything it touches (ADR-017).
 * The value of these numbers is not that a server has them; it is that
 * `docs/02-ROADMAP.md` asks for balancing tools, and a balancing tool needs to
 * answer questions like "how often does a raid end in death, and to what".
 *
 * The recorder is a pure event consumer: it subscribes to the bus, counts, and
 * hands back a record when the raid ends. It reads no clock and no storage -
 * `app/` owns both (ADR-002). That is what makes it testable by replaying a
 * handful of events, which is exactly what `telemetry.test.ts` does.
 */

import type { EntityId } from '@/core/ecs/entity';
import type { EventBus } from '@/core/events/eventBus';
import type { DamageCause, GameEvents, RaidOutcome, RaidOutcomeKind } from '@/game/gameEvents';

/** How the raid ended, when it ended in death. */
export type DeathCause = DamageCause | 'unknown';

/**
 * One raid, reduced to the numbers a designer can act on.
 *
 * Everything here is a count or a scalar. No positions, no timestamps, no
 * entity ids: a record must stay meaningless to anyone but the balance sheet,
 * and it must stay small enough that fifty of them cost nothing to keep.
 */
export interface RaidRecord {
  seed: number;
  outcome: RaidOutcomeKind;
  durationSeconds: number;
  kills: number;
  /** Credits carried out. Zero unless extracted. */
  lootValue: number;
  /** Credits that came home in the secure container, on any outcome. */
  securedValue: number;
  damageTaken: number;
  shotsFired: number;
  /**
   * Damaging impacts from the player's own gunfire.
   *
   * Not "shots that hit": a shotgun lands up to seven pellets per trigger pull
   * and each one is an impact. The derived figure is therefore hits *per shot*
   * and legitimately exceeds 1 for shotguns. Naming it accuracy would have made
   * it look like a percentage and quietly lied about the shotgun.
   */
  hits: number;
  itemsLooted: number;
  containersOpened: number;
  anomaliesEntered: number;
  vaultsOpened: number;
  bossEngaged: boolean;
  /** Null unless `outcome === 'died'`. */
  deathCause: DeathCause | null;
  /** Which balance numbers produced this raid (see `balanceOverlay.ts`). */
  balanceVersion: string;
}

export interface TelemetryState {
  version: 1;
  /** Raids ever played, including the ones the ring buffer has forgotten. */
  totalRaids: number;
  /** The most recent raids, oldest first. */
  raids: RaidRecord[];
}

/**
 * How many raids to keep.
 *
 * Fifty is roughly a week of play, which is the window in which a balance
 * change is still attributable to that change. Keeping every raid forever
 * would bias every average towards a version of the game that no longer
 * exists — and grow a save file without bound.
 */
export const TELEMETRY_CAPACITY = 50;

export function emptyTelemetry(): TelemetryState {
  return { version: 1, totalRaids: 0, raids: [] };
}

export interface RaidRecorder {
  /** Stop listening and produce the record. Safe to call once. */
  finish(outcome: RaidOutcome): RaidRecord;
  /** Stop listening without producing anything (abandoned app, reload). */
  cancel(): void;
}

/**
 * Watch one raid.
 *
 * `balanceVersion` is stamped onto the record rather than looked up later,
 * because a config change between the raid and the readout would silently
 * relabel history.
 */
export function createRaidRecorder(
  bus: EventBus<GameEvents>,
  seed: number,
  balanceVersion: string,
  player: EntityId,
): RaidRecorder {
  let damageTaken = 0;
  let shotsFired = 0;
  let hits = 0;
  let itemsLooted = 0;
  let containersOpened = 0;
  let anomaliesEntered = 0;
  let bossEngaged = false;
  let lastHarm: DamageCause | null = null;

  const offs: Array<() => void> = [];

  offs.push(
    bus.on('weapon:fired', (e) => {
      // Enemies fire too, and constantly. Only the player's trigger pulls
      // belong in a figure about how the player is doing.
      if (e.entity === player) shotsFired++;
    }),
  );

  offs.push(
    bus.on('damage:dealt', (e) => {
      if (e.isPlayerTarget) {
        damageTaken += e.amount;
        // The last thing that hurt the player is what killed them. Held here
        // rather than read at death, because the death event carries no cause.
        lastHarm = e.cause;
      } else if (e.cause === 'gunfire' && e.source === player) {
        hits++;
      }
    }),
  );

  offs.push(bus.on('loot:pickedUp', (e) => void (itemsLooted += e.quantity)));
  offs.push(bus.on('container:opened', () => void containersOpened++));
  offs.push(bus.on('anomaly:entered', () => void anomaliesEntered++));
  offs.push(bus.on('boss:engaged', () => void (bossEngaged = true)));

  function stop(): void {
    for (const off of offs) off();
    offs.length = 0;
  }

  return {
    cancel: stop,
    finish(outcome) {
      stop();
      return {
        seed,
        outcome: outcome.kind,
        durationSeconds: outcome.durationSeconds,
        kills: outcome.kills,
        lootValue: outcome.lootValue,
        securedValue: outcome.securedValue,
        damageTaken,
        shotsFired,
        hits,
        itemsLooted,
        containersOpened,
        anomaliesEntered,
        vaultsOpened: outcome.vaultsOpened,
        bossEngaged,
        deathCause: outcome.kind === 'died' ? (lastHarm ?? 'unknown') : null,
        balanceVersion,
      };
    },
  };
}

/** Append a record, dropping the oldest once the buffer is full. */
export function recordRaid(state: TelemetryState, record: RaidRecord): TelemetryState {
  const raids = [...state.raids, record];
  return {
    version: 1,
    totalRaids: state.totalRaids + 1,
    raids: raids.length > TELEMETRY_CAPACITY ? raids.slice(-TELEMETRY_CAPACITY) : raids,
  };
}

export interface CauseShare {
  cause: DeathCause;
  count: number;
  /** Of all deaths, not of all raids. */
  share: number;
}

export interface TelemetrySummary {
  raids: number;
  totalRaids: number;
  extractionRate: number;
  deathRate: number;
  timeoutRate: number;
  averageDurationSeconds: number;
  averageKills: number;
  /** Credits per raid, secure container included. The economy drift signal. */
  averageValuePerRaid: number;
  /**
   * Damaging impacts per trigger pull. Null when nobody fired.
   *
   * Above 1 is normal for shotguns and is not a bug - see `RaidRecord.hits`.
   */
  hitsPerShot: number | null;
  averageDamageTaken: number;
  bossEngagementRate: number;
  deathCauses: CauseShare[];
  /**
   * Longest run of consecutive deaths.
   *
   * The one number here that is about how the game *feels*: averages hide a
   * player who lost six raids in a row and stopped playing.
   */
  worstDeathStreak: number;
}

/**
 * Reduce the buffer to a readout.
 *
 * Pure, so the diagnostics screen and the tests see the same arithmetic.
 * Ratios are 0 on an empty buffer rather than NaN — a readout full of NaN
 * teaches nobody anything.
 */
export function summarise(state: TelemetryState): TelemetrySummary {
  const raids = state.raids;
  const n = raids.length;
  if (n === 0) {
    return {
      raids: 0,
      totalRaids: state.totalRaids,
      extractionRate: 0,
      deathRate: 0,
      timeoutRate: 0,
      averageDurationSeconds: 0,
      averageKills: 0,
      averageValuePerRaid: 0,
      hitsPerShot: null,
      averageDamageTaken: 0,
      bossEngagementRate: 0,
      deathCauses: [],
      worstDeathStreak: 0,
    };
  }

  let extracted = 0;
  let died = 0;
  let timeout = 0;
  let duration = 0;
  let kills = 0;
  let value = 0;
  let fired = 0;
  let hit = 0;
  let damage = 0;
  let bosses = 0;
  let streak = 0;
  let worstStreak = 0;
  const causes = new Map<DeathCause, number>();

  for (const raid of raids) {
    if (raid.outcome === 'extracted') extracted++;
    else if (raid.outcome === 'died') died++;
    else timeout++;

    if (raid.outcome === 'died') {
      streak++;
      if (streak > worstStreak) worstStreak = streak;
      const cause = raid.deathCause ?? 'unknown';
      causes.set(cause, (causes.get(cause) ?? 0) + 1);
    } else {
      streak = 0;
    }

    duration += raid.durationSeconds;
    kills += raid.kills;
    value += raid.lootValue + raid.securedValue;
    fired += raid.shotsFired;
    hit += raid.hits;
    damage += raid.damageTaken;
    if (raid.bossEngaged) bosses++;
  }

  const deathCauses = [...causes.entries()]
    .map(([cause, count]) => ({ cause, count, share: count / died }))
    .sort((a, b) => b.count - a.count);

  return {
    raids: n,
    totalRaids: state.totalRaids,
    extractionRate: extracted / n,
    deathRate: died / n,
    timeoutRate: timeout / n,
    averageDurationSeconds: duration / n,
    averageKills: kills / n,
    averageValuePerRaid: value / n,
    hitsPerShot: fired > 0 ? hit / fired : null,
    averageDamageTaken: damage / n,
    bossEngagementRate: bosses / n,
    deathCauses,
    worstDeathStreak: worstStreak,
  };
}

/**
 * Rebuild state from storage, rejecting anything that is not recognisably ours.
 *
 * Telemetry is diagnostic, so the failure mode is deliberately blunt: a record
 * that does not parse is dropped rather than repaired. Losing a statistic costs
 * nothing; a summary computed over half-parsed junk is worse than no summary.
 */
export function parseTelemetry(raw: string | null): TelemetryState {
  if (raw === null) return emptyTelemetry();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return emptyTelemetry();
  }
  if (typeof data !== 'object' || data === null) return emptyTelemetry();

  const candidate = data as Partial<TelemetryState>;
  if (candidate.version !== 1 || !Array.isArray(candidate.raids)) return emptyTelemetry();

  const raids = candidate.raids.filter(isRaidRecord).slice(-TELEMETRY_CAPACITY);
  const total =
    typeof candidate.totalRaids === 'number' && Number.isFinite(candidate.totalRaids)
      ? Math.max(candidate.totalRaids, raids.length)
      : raids.length;

  return { version: 1, totalRaids: total, raids };
}

const NUMERIC_FIELDS: ReadonlyArray<keyof RaidRecord> = [
  'seed',
  'durationSeconds',
  'kills',
  'lootValue',
  'securedValue',
  'damageTaken',
  'shotsFired',
  'hits',
  'itemsLooted',
  'containersOpened',
  'anomaliesEntered',
  'vaultsOpened',
];

function isRaidRecord(value: unknown): value is RaidRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record['outcome'] !== 'extracted' && record['outcome'] !== 'died' && record['outcome'] !== 'timeout') {
    return false;
  }
  for (const field of NUMERIC_FIELDS) {
    const n = record[field];
    if (typeof n !== 'number' || !Number.isFinite(n)) return false;
  }
  return true;
}
