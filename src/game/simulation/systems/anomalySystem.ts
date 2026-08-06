/**
 * Anomalies - the mechanic that makes the Echo world feel like the Echo world.
 *
 * The prototype implements `Stillstand` (Stillness): it slows everything inside
 * its radius, including projectiles, and its core is lethal. The remaining four
 * anomaly types follow in M4; they plug into the same system.
 *
 * Anomalies are deliberately both threat and reward: the best loot caches sit
 * next to them, so the player has to decide how far into the field to walk.
 */

import { ANOMALY } from '@/content/balance';
import { applyDamage } from '@/game/combat/damage';
import type { SimContext } from '@/game/simulation/simContext';

export function anomalySystem(ctx: SimContext): void {
  const { world, dt } = ctx;
  if (world.anomalies.size === 0) return;

  for (const anomaly of world.anomalies.values()) {
    // Advance the visual pulse in the simulation so every client renders the
    // same phase - cheap now, necessary if this ever runs multiplayer.
    anomaly.phase = (anomaly.phase + dt * 0.8) % (Math.PI * 2);
  }

  // Slow projectiles crossing an anomaly. Watching a round crawl through the
  // field is the clearest possible signal of what the anomaly does.
  for (const [entity, projectile] of world.projectiles.entries()) {
    const transform = world.transforms.get(entity);
    if (!transform) continue;
    const factor = fieldFactorAt(ctx, transform.x, transform.y);
    if (factor < 1) projectile.speed *= Math.pow(factor, dt * 4);
  }

  const player = world.playerEntity;
  if (player === null || !world.isAliveActor(player)) return;

  const transform = world.transforms.require(player);
  let strongest = 0;
  let coreDamage = 0;

  for (const [entity, anomaly] of world.anomalies.entries()) {
    const anomalyTransform = world.transforms.get(entity);
    if (!anomalyTransform) continue;

    const dx = transform.x - anomalyTransform.x;
    const dy = transform.y - anomalyTransform.y;
    const dist = Math.hypot(dx, dy);
    if (dist > anomaly.radius) continue;

    strongest = Math.max(strongest, 1 - dist / anomaly.radius);

    const coreRadius = anomaly.radius * ANOMALY.stillnessCoreFraction;
    if (dist <= coreRadius) {
      coreDamage = Math.max(coreDamage, ANOMALY.stillnessCoreDamagePerSecond);
    }
  }

  const wasInside = ctx.entitiesInAnomaly.has(player);
  const isInside = strongest > 0;

  if (isInside && !wasInside) {
    ctx.entitiesInAnomaly.add(player);
    ctx.bus.emit('anomaly:entered', { entity: player, kind: 'stillness' });
  } else if (!isInside && wasInside) {
    ctx.entitiesInAnomaly.delete(player);
    ctx.bus.emit('anomaly:exited', { entity: player, kind: 'stillness' });
  }

  if (coreDamage > 0) {
    applyDamage(ctx, player, player, coreDamage * dt, transform.x, transform.y);
  }
}

/**
 * Speed multiplier at a world position: 1 outside every anomaly, approaching
 * `stillnessSlowFactor` at the centre.
 */
export function fieldFactorAt(ctx: SimContext, x: number, y: number): number {
  let factor = 1;

  for (const [entity, anomaly] of ctx.world.anomalies.entries()) {
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
