/**
 * Anomalies - the mechanic that makes the Echo world feel like the Echo world.
 *
 * Five kinds, each a different *kind* of problem rather than five flavours of
 * damage over time:
 *
 *   Stillstand    slows movement and projectiles       - a movement problem
 *   Flüstern      disables the HUD                     - an information problem
 *   Rückstoß      pulses outward, shoving and hurting  - a timing problem
 *   Bleiche       drains health silently               - noticed too late
 *   Echo-Schatten replays who passed through           - a gift with a catch
 *
 * All of them are deterministic: pulses run off the simulation tick, never off
 * wall-clock time, so the same seed produces the same rhythm (ADR-009).
 */

import { ANOMALY } from '@/content/balance';
import { getAnomaly } from '@/content/anomalies';
import type { EntityId } from '@/core/ecs/entity';
import { clamp01 } from '@/core/math/scalar';
import type { Anomaly } from '@/game/components';
import { applyDamage } from '@/game/combat/damage';
import { emitNoise, type SimContext } from '@/game/simulation/simContext';

export function anomalySystem(ctx: SimContext): void {
  const { world, dt } = ctx;
  if (world.anomalies.size === 0) return;

  const intensity = ctx.weather.id === 'riftpulse' ? ANOMALY.riftPulseIntensity : 1;

  for (const [entity, anomaly] of world.anomalies.entries()) {
    // Advance the visual pulse in the simulation so every client renders the
    // same phase - cheap now, necessary if this ever runs multiplayer.
    anomaly.phase = (anomaly.phase + dt * 0.8) % (Math.PI * 2);
    anomaly.timer += dt;

    const transform = world.transforms.get(entity);
    if (!transform) continue;

    switch (anomaly.kind) {
      case 'recoil':
        updateRecoil(ctx, entity, anomaly, transform, intensity);
        break;
      case 'echoshadow':
        updateEchoShadow(ctx, entity, anomaly, transform);
        break;
      default:
        break;
    }
  }

  // Slow projectiles crossing a Stillstand. Watching a round crawl through the
  // field is the clearest possible signal of what the anomaly does.
  for (const [entity, projectile] of world.projectiles.entries()) {
    const transform = world.transforms.get(entity);
    if (!transform) continue;
    const factor = fieldFactorAt(ctx, transform.x, transform.y);
    if (factor < 1) projectile.speed *= Math.pow(factor, dt * 4);
  }

  applyContinuousEffects(ctx, intensity);
}

/**
 * Per-actor effects that depend on standing inside a field.
 *
 * Applies to enemies as well as the player: an anomaly does not care who walks
 * into it, and an enemy dying to a Bleiche it chased the player through is one
 * of the better things that can happen in a raid.
 */
function applyContinuousEffects(ctx: SimContext, intensity: number): void {
  const { world, dt } = ctx;
  const player = world.playerEntity;

  ctx.hudJammed = false;

  for (const [actor, transform] of world.transforms.entries()) {
    const health = world.healths.get(actor);
    if (!health || health.current <= 0) continue;
    // Only actors care; loot and containers are not affected.
    if (!world.players.has(actor) && !world.agents.has(actor)) continue;

    let insideAny = false;

    for (const [entity, anomaly] of world.anomalies.entries()) {
      const anomalyTransform = world.transforms.get(entity);
      if (!anomalyTransform) continue;

      const dx = transform.x - anomalyTransform.x;
      const dy = transform.y - anomalyTransform.y;
      const dist = Math.hypot(dx, dy);
      if (dist > anomaly.radius) continue;

      insideAny = true;
      const def = getAnomaly(anomaly.kind);
      const core = anomaly.radius * def.coreFraction;
      // 0 at the edge, 1 at the core boundary and inward.
      const depth = clamp01(1 - Math.max(0, dist - core) / Math.max(0.001, anomaly.radius - core));

      switch (anomaly.kind) {
        case 'stillness':
          if (dist <= core) {
            applyDamage(
              ctx,
              actor,
              actor,
              ANOMALY.stillnessCoreDamagePerSecond * intensity * dt,
              transform.x,
              transform.y,
              { zone: null, cause: 'anomaly' },
            );
          }
          break;

        case 'bleach':
          // No push, no slow, no sound - just health leaving.
          applyDamage(
            ctx,
            actor,
            actor,
            ANOMALY.bleachDrainPerSecond * depth * intensity * dt,
            transform.x,
            transform.y,
            { zone: null, cause: 'anomaly' },
          );
          break;

        case 'whisper':
          // Instruments fail. On a small screen that is worse than damage,
          // because the player has to remember instead of read.
          if (actor === player) ctx.hudJammed = true;
          break;

        default:
          break;
      }

      recordEcho(ctx, entity, anomaly, actor, transform.x, transform.y);
    }

    const wasInside = ctx.entitiesInAnomaly.has(actor);
    if (insideAny && !wasInside) {
      ctx.entitiesInAnomaly.add(actor);
      if (actor === player) ctx.bus.emit('anomaly:entered', { entity: actor, kind: 'field' });
    } else if (!insideAny && wasInside) {
      ctx.entitiesInAnomaly.delete(actor);
      if (actor === player) ctx.bus.emit('anomaly:exited', { entity: actor, kind: 'field' });
    }
  }
}

/**
 * Rückstoß: a pulse on a fixed rhythm that shoves everything outward.
 *
 * Crossing it is possible - between two pulses. That is the entire mechanic,
 * and it is why the rhythm has to be visible and constant.
 */
function updateRecoil(
  ctx: SimContext,
  entity: EntityId,
  anomaly: Anomaly,
  transform: { x: number; y: number },
  intensity: number,
): void {
  if (anomaly.timer < ANOMALY.recoilPulseSeconds) return;
  anomaly.timer = 0;

  ctx.bus.emit('anomaly:pulsed', {
    entity,
    kind: 'recoil',
    x: transform.x,
    y: transform.y,
    radius: anomaly.radius,
  });
  emitNoise(ctx, entity, 'weaved', transform.x, transform.y, anomaly.radius * 2.5);

  const radiusSq = anomaly.radius * anomaly.radius;
  for (const [actor, actorTransform] of ctx.world.transforms.entries()) {
    const health = ctx.world.healths.get(actor);
    if (!health || health.current <= 0) continue;
    if (!ctx.world.players.has(actor) && !ctx.world.agents.has(actor)) continue;

    const dx = actorTransform.x - transform.x;
    const dy = actorTransform.y - transform.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > radiusSq) continue;

    const dist = Math.sqrt(distSq) || 0.001;
    const falloff = 1 - dist / anomaly.radius;

    // Shove outward. Velocity is enough - the movement systems resolve the
    // collision, so nobody gets pushed through a wall.
    const velocity = ctx.world.velocities.get(actor);
    if (velocity) {
      velocity.x += (dx / dist) * ANOMALY.recoilPushSpeed * falloff;
      velocity.y += (dy / dist) * ANOMALY.recoilPushSpeed * falloff;
    }

    applyDamage(
      ctx,
      actor,
      actor,
      ANOMALY.recoilPulseDamage * falloff * falloff * intensity,
      actorTransform.x,
      actorTransform.y,
      { zone: null, cause: 'anomaly' },
    );
  }
}

/**
 * Echo-Schatten: remembers who walked through and replays them.
 *
 * Harmless and genuinely useful - the player learns who came this way. The
 * catch is that enemies react to the echoes too, so a replay can be a warning
 * or a weapon depending on who is standing where.
 */
function recordEcho(
  ctx: SimContext,
  entity: EntityId,
  anomaly: Anomaly,
  actor: EntityId,
  x: number,
  y: number,
): void {
  if (anomaly.kind !== 'echoshadow') return;

  const sampleInterval = ANOMALY.echoSampleSeconds * 60;
  const last = anomaly.samples[anomaly.samples.length - 1];
  if (last && ctx.tick - last.tick < sampleInterval) return;

  void entity;
  void actor;
  anomaly.samples.push({ x, y, tick: ctx.tick });

  // Bounded memory: the anomaly forgets, and so does the intel it gives.
  const cutoff = ctx.tick - ANOMALY.echoMemorySeconds * 60;
  while (anomaly.samples.length > 0 && (anomaly.samples[0] as { tick: number }).tick < cutoff) {
    anomaly.samples.shift();
  }
}

function updateEchoShadow(
  ctx: SimContext,
  entity: EntityId,
  anomaly: Anomaly,
  transform: { x: number; y: number },
): void {
  anomaly.replayTimer += ctx.dt;
  if (anomaly.replayTimer < ANOMALY.echoReplaySeconds) return;
  anomaly.replayTimer = 0;

  const sample = ctx.rng.misc.pick(anomaly.samples);
  if (!sample) return;

  // A ghost of a past passer-by. It makes a sound, so enemies investigate it -
  // which is exactly what makes this anomaly double-edged.
  ctx.bus.emit('anomaly:echo', { entity, x: sample.x, y: sample.y });
  emitNoise(ctx, entity, 'weaved', sample.x, sample.y, ANOMALY.echoNoiseRadius);
  void transform;
}

/**
 * Speed multiplier at a world position: 1 outside every Stillstand, approaching
 * `stillnessSlowFactor` at the centre.
 */
export function fieldFactorAt(ctx: SimContext, x: number, y: number): number {
  let factor = 1;

  for (const [entity, anomaly] of ctx.world.anomalies.entries()) {
    if (anomaly.kind !== 'stillness') continue;

    const transform = ctx.world.transforms.get(entity);
    if (!transform) continue;

    const dx = x - transform.x;
    const dy = y - transform.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > anomaly.radius * anomaly.radius) continue;

    const t = 1 - Math.sqrt(distSq) / anomaly.radius;
    const local = 1 - (1 - ANOMALY.stillnessSlowFactor) * t;
    factor = Math.min(factor, local);
  }

  return factor;
}

/**
 * How strongly the AI should avoid a cell.
 *
 * Fed into the flow field as extra cost, so enemies route around a Bleiche
 * instead of walking through it. They still cross a Flüstern - it does not hurt
 * them, and they have no instruments to lose.
 */
export function avoidanceAt(ctx: SimContext, x: number, y: number): number {
  let worst = 0;

  for (const [entity, anomaly] of ctx.world.anomalies.entries()) {
    const def = getAnomaly(anomaly.kind);
    if (def.avoidance <= 0) continue;

    const transform = ctx.world.transforms.get(entity);
    if (!transform) continue;

    const dx = x - transform.x;
    const dy = y - transform.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > anomaly.radius * anomaly.radius) continue;

    const t = 1 - Math.sqrt(distSq) / anomaly.radius;
    worst = Math.max(worst, def.avoidance * t);
  }

  return worst;
}

/**
 * Bake anomaly avoidance into a per-cell navigation cost map.
 *
 * Anomalies never move, so this runs once per raid instead of per flow field.
 * The result is an enemy that walks *around* a Bleiche rather than through it -
 * and, more usefully for the player, an enemy whose route can be predicted by
 * looking at what is on the floor.
 */
export function buildAvoidanceOverlay(ctx: SimContext): Int32Array | null {
  if (ctx.world.anomalies.size === 0) return null;

  const { grid } = ctx;
  const overlay = new Int32Array(grid.width * grid.height);
  let any = false;

  for (let cy = 0; cy < grid.height; cy++) {
    for (let cx = 0; cx < grid.width; cx++) {
      if (grid.isNavBlocked(cx, cy)) continue;

      const avoidance = avoidanceAt(ctx, grid.cellCenterX(cx), grid.cellCenterY(cy));
      if (avoidance <= 0) continue;

      // Scaled against the flow field's straight-step cost of 10: a full-
      // strength field is worth a detour of roughly twelve cells, which is
      // enough to route around one but not enough to give up on a target.
      overlay[cy * grid.width + cx] = Math.round(avoidance * 120);
      any = true;
    }
  }

  return any ? overlay : null;
}
