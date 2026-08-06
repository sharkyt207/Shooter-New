/**
 * Extraction zones - the heart of the risk decision (Pillar P1).
 *
 * Zones open on a staggered schedule and close again. The one nearest the spawn
 * opens first and shuts first; the far ones open later. That single rule is
 * what forces the question the whole game is built around: leave now with what
 * you have, or push deeper and gamble on reaching the next exit in time.
 */

import { RAID } from '@/content/balance';
import type { ExtractionZone } from '@/game/components';
import type { SimContext } from '@/game/simulation/simContext';

export function extractionSystem(ctx: SimContext): void {
  const { world } = ctx;
  const player = world.playerEntity;
  const playerTransform = player !== null ? world.transforms.get(player) : undefined;
  const playerAlive = player !== null && world.isAliveActor(player);

  for (const [entity, zone] of world.extractionZones.entries()) {
    updatePhase(ctx, zone);

    if (zone.phase !== 'available' && zone.phase !== 'closing') {
      if (zone.holdProgress > 0) {
        zone.holdProgress = 0;
        ctx.bus.emit('extraction:holdCancelled', { zoneId: zone.zoneId });
      }
      continue;
    }

    if (!playerAlive || !playerTransform) continue;

    const transform = world.transforms.get(entity);
    if (!transform) continue;

    const dx = playerTransform.x - transform.x;
    const dy = playerTransform.y - transform.y;
    const inside = dx * dx + dy * dy <= zone.radius * zone.radius;

    if (!inside) {
      if (zone.holdProgress > 0) {
        zone.holdProgress = 0;
        ctx.bus.emit('extraction:holdCancelled', { zoneId: zone.zoneId });
      }
      continue;
    }

    // Taking fire cancels the hold. Standing in the open for five seconds has
    // to be a real commitment, not a formality.
    const health = player !== null ? world.healths.get(player) : undefined;
    if (health && ctx.tick - health.lastDamageTick < 30) {
      if (zone.holdProgress > 0) {
        zone.holdProgress = 0;
        ctx.bus.emit('extraction:holdCancelled', { zoneId: zone.zoneId });
      }
      continue;
    }

    if (zone.holdProgress <= 0) {
      ctx.bus.emit('extraction:holdStarted', { zoneId: zone.zoneId });
    }

    zone.holdProgress += ctx.dt;
    ctx.bus.emit('extraction:progress', {
      zoneId: zone.zoneId,
      progress: Math.min(1, zone.holdProgress / RAID.extractionHoldSeconds),
    });

    if (zone.holdProgress >= RAID.extractionHoldSeconds) {
      zone.phase = 'used';
      ctx.pendingOutcome = 'extracted';
      ctx.extractedZoneName = zone.name;
      return;
    }
  }
}

function updatePhase(ctx: SimContext, zone: ExtractionZone): void {
  if (zone.phase === 'used' || zone.phase === 'closed') return;

  const warningTicks = RAID.extractionWarningSeconds * 60;

  if (zone.phase === 'locked' && ctx.tick >= zone.opensAtTick) {
    zone.phase = 'available';
    const transform = findZoneTransform(ctx, zone);
    ctx.bus.emit('extraction:opened', {
      zoneId: zone.zoneId,
      name: zone.name,
      x: transform.x,
      y: transform.y,
    });
    return;
  }

  if (zone.phase === 'available' && ctx.tick >= zone.closesAtTick - warningTicks) {
    zone.phase = 'closing';
    ctx.bus.emit('extraction:closing', {
      zoneId: zone.zoneId,
      secondsLeft: (zone.closesAtTick - ctx.tick) / 60,
    });
    return;
  }

  if (zone.phase === 'closing' && ctx.tick >= zone.closesAtTick) {
    zone.phase = 'closed';
    zone.holdProgress = 0;
    ctx.bus.emit('extraction:closed', { zoneId: zone.zoneId });
  }
}

function findZoneTransform(ctx: SimContext, zone: ExtractionZone): { x: number; y: number } {
  for (const [entity, candidate] of ctx.world.extractionZones.entries()) {
    if (candidate !== zone) continue;
    const transform = ctx.world.transforms.get(entity);
    if (transform) return transform;
  }
  return { x: 0, y: 0 };
}
