/**
 * Hit zones, armour penetration and fragmentation.
 *
 * This is the heart of M2: a shot is no longer "damage minus a percentage".
 * Where it lands, what is loaded and what the target wears now all matter, and
 * each of those is a decision the player made before the raid.
 *
 * Everything here is pure and deterministic - the only randomness comes from
 * the `SeededRandom` passed in (ADR-009).
 */

import { ARMOR, HIT_ZONES } from '@/content/balance';
import { findEnemy } from '@/content/enemies';
import { findItem } from '@/content/items';
import type { ArmorStats, HitZone } from '@/content/types';
import type { EntityId } from '@/core/ecs/entity';
import { clamp01 } from '@/core/math/scalar';
import type { SeededRandom } from '@/core/math/random';
import type { SimContext } from '@/game/simulation/simContext';

export interface ZoneWeights {
  head: number;
  torso: number;
  limbs: number;
}

/**
 * Roll which body zone a shot lands in.
 *
 * The camera cannot support aiming at a head, so the zone is a weighted roll
 * shaped by the weapon: a marksman rifle finds the head far more often than a
 * shotgun does. An unaware target is easier to hit well, which is what makes
 * opening from concealment worthwhile.
 */
export function rollHitZone(
  rng: SeededRandom,
  bias: ZoneWeights,
  targetUnaware: boolean,
): HitZone {
  const head = bias.head + (targetUnaware ? HIT_ZONES.unawareHeadBonusWeight : 0);
  const total = head + bias.torso + bias.limbs;
  if (total <= 0) return 'torso';

  const roll = rng.float() * total;
  if (roll < head) return 'head';
  if (roll < head + bias.torso) return 'torso';
  return 'limbs';
}

export function zoneMultiplier(zone: HitZone): number {
  switch (zone) {
    case 'head':
      return HIT_ZONES.headMultiplier;
    case 'torso':
      return HIT_ZONES.torsoMultiplier;
    case 'limbs':
      return HIT_ZONES.limbsMultiplier;
  }
}

/**
 * Effective armour class after wear.
 *
 * A ruined plate is not worthless - it keeps `ruinedClassFactor` of its rating.
 * Armour that drops to literally zero would make late-raid fights feel arbitrary.
 */
export function effectiveArmorClass(stats: ArmorStats, durability: number): number {
  const fraction = stats.durability > 0 ? clamp01(durability / stats.durability) : 0;
  const kept = ARMOR.ruinedClassFactor + (1 - ARMOR.ruinedClassFactor) * fraction;
  return stats.armorClass * kept;
}

/**
 * Probability that a round with `penetration` defeats an armour class.
 *
 * A smooth ramp rather than a threshold: near the break-even point the outcome
 * is close to a coin flip, so marginal ammunition stays genuinely tense instead
 * of flipping between "always works" and "never works".
 */
export function penetrationChance(penetration: number, armorClass: number): number {
  const required = armorClass * ARMOR.penetrationPerClass;
  const delta = penetration - required;
  return clamp01(0.5 + delta / ARMOR.penetrationWindow);
}

export interface ArmorPiece {
  /** Entity-independent stats of the piece. */
  stats: ArmorStats;
  /** Current durability, mutated when the piece takes a hit. */
  durability: number;
  /** Which equipment field it came from, so the caller can write back. */
  slot: 'body' | 'head';
}

/** The armour piece covering a zone, or undefined when the zone is bare. */
export function armorCovering(
  ctx: SimContext,
  entity: EntityId,
  zone: HitZone,
): ArmorPiece | undefined {
  const equipment = ctx.world.equipments.get(entity);
  if (!equipment) return undefined;

  const body = findItem(equipment.armorItemId ?? '')?.armor;
  if (body && body.coverage.includes(zone)) {
    return { stats: body, durability: equipment.armorDurability, slot: 'body' };
  }

  const helmet = findItem(equipment.helmetItemId ?? '')?.armor;
  if (helmet && helmet.coverage.includes(zone)) {
    return { stats: helmet, durability: equipment.helmetDurability, slot: 'head' };
  }

  return undefined;
}

export interface BallisticResult {
  zone: HitZone;
  /** Final damage after zone, armour and fragmentation. */
  damage: number;
  /** Damage the armour absorbed. Zero when the round penetrated or hit bare flesh. */
  absorbed: number;
  penetrated: boolean;
  /** True when the round hit armour at all. */
  hitArmor: boolean;
  fragmented: boolean;
}

export interface BallisticInput {
  baseDamage: number;
  penetration: number;
  fragmentation: number;
  fragmentationBonus: number;
  zoneBias: ZoneWeights;
  targetUnaware: boolean;
}

/**
 * Resolve a single projectile hit against a target.
 *
 * Applies (in order) zone roll, zone multiplier, armour penetration, and
 * fragmentation - fragmentation only ever triggers on flesh, which is what
 * makes hollow-point rounds a deliberate anti-unarmoured choice.
 *
 * Mutates the target's armour durability as a side effect, because armour wear
 * is part of resolving the hit and splitting it would let the two drift apart.
 */
export function resolveHit(
  ctx: SimContext,
  target: EntityId,
  input: BallisticInput,
): BallisticResult {
  const rng = ctx.rng.combat;
  const zone = rollHitZone(rng, input.zoneBias, input.targetUnaware);

  let damage = input.baseDamage * zoneMultiplier(zone);
  let absorbed = 0;
  let penetrated = true;
  let fragmented = false;

  const piece = armorCovering(ctx, target, zone);
  const naturalArmor = naturalArmorClassOf(ctx, target);

  if (piece) {
    const armorClass = effectiveArmorClass(piece.stats, piece.durability);
    penetrated = rng.chance(penetrationChance(input.penetration, armorClass));

    if (penetrated) {
      applyArmorWear(ctx, target, piece, ARMOR.durabilityPerPenetration);
    } else {
      const blocked = damage * piece.stats.reduction;
      const throughFloor = damage * ARMOR.minDamageThroughArmor;
      const remaining = Math.max(throughFloor, damage - blocked);
      absorbed = damage - remaining;
      damage = remaining;
      applyArmorWear(ctx, target, piece, ARMOR.durabilityPerBlock);
    }
  } else if (naturalArmor > 0) {
    // Enemies without an equipment component carry an archetype armour class.
    penetrated = rng.chance(penetrationChance(input.penetration, naturalArmor));
    if (!penetrated) {
      const remaining = Math.max(damage * ARMOR.minDamageThroughArmor, damage * 0.45);
      absorbed = damage - remaining;
      damage = remaining;
    }
  }

  // Fragmentation only happens in flesh - that is the whole trade-off of a
  // fragmenting round versus an armour-piercing one.
  const metArmor = piece !== undefined || naturalArmor > 0;
  if (penetrated && !metArmor && input.fragmentation > 0 && rng.chance(input.fragmentation)) {
    fragmented = true;
    damage *= 1 + input.fragmentationBonus;
  }

  return { zone, damage, absorbed, penetrated, hitArmor: metArmor, fragmented };
}

function applyArmorWear(
  ctx: SimContext,
  entity: EntityId,
  piece: ArmorPiece,
  amount: number,
): void {
  const equipment = ctx.world.equipments.get(entity);
  if (!equipment) return;

  if (piece.slot === 'body') {
    equipment.armorDurability = Math.max(0, equipment.armorDurability - amount);
  } else {
    equipment.helmetDurability = Math.max(0, equipment.helmetDurability - amount);
  }
}

/** Armour class an enemy archetype has without wearing anything. */
function naturalArmorClassOf(ctx: SimContext, entity: EntityId): number {
  const agent = ctx.world.agents.get(entity);
  if (!agent) return 0;
  return findEnemy(agent.enemyId)?.armorClass ?? 0;
}
