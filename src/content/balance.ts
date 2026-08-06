/**
 * Central balance constants (ADR-010).
 *
 * Every tunable number lives here - never inline in a system. Balancing is a
 * high-frequency design activity and must not require code archaeology.
 * In M8 this file becomes the schema for remote config, so values can be tuned
 * without shipping an app update.
 */

export const PLAYER = {
  maxHealth: 100,
  maxStamina: 100,
  radius: 0.42,

  /** Metres per second at zero carried weight. */
  baseSpeed: 4.2,
  /** Acceleration and braking, metres per second squared. */
  acceleration: 34,
  friction: 26,

  /** Sprint multiplier and its stamina cost per second. */
  sprintMultiplier: 1.55,
  sprintStaminaPerSecond: 18,
  staminaRegenPerSecond: 12,
  /** Seconds after sprinting before stamina starts regenerating. */
  staminaRegenDelaySeconds: 0.9,

  /** Health regenerates only just enough to avoid death spirals. */
  healthRegenPerSecond: 0,

  /** Carry capacity in kilograms with no backpack equipped. */
  baseCapacityKg: 8,

  /** Metres. How close the player must be to loot or a container. */
  interactRange: 1.7,
  /** Metres. Ground loot inside this radius is highlighted. */
  lootHighlightRange: 3.2,

  /** Metres the player's own footsteps carry while walking / sprinting. */
  footstepNoiseWalk: 5,
  footstepNoiseSprint: 11,
} as const;

export const ENCUMBRANCE = {
  /** Below this fraction of capacity there is no penalty at all. */
  freeFraction: 0.5,
  /** Speed multiplier at exactly 100% capacity. */
  speedAtFull: 0.72,
  /** Speed multiplier at the hard overload cap. */
  speedAtOverload: 0.45,
  /** Fraction of capacity beyond which nothing more can be picked up. */
  hardCapFraction: 1.0,
  /** Extra stamina drain per second when above `freeFraction`. */
  staminaDrainAtFull: 6,
} as const;

export const COMBAT = {
  /** Metres. Projectiles are removed beyond this distance from their origin. */
  projectileMaxLifetimeSeconds: 3.0,
  projectileRadius: 0.08,

  /** Multiplier applied when a shot lands while the target is unaware. */
  unawareDamageMultiplier: 1.5,

  /** Degrees of accumulated spread shed per second once the trigger is released. */
  bloomDecayDegPerSecond: 7.5,

  /** Armor cannot reduce damage below this fraction. */
  minDamageAfterArmor: 0.15,
  /** Durability lost per absorbed hit. */
  armorDurabilityPerHit: 1.4,

  /** Seconds of invulnerability after taking damage. Prevents burst-frame death. */
  damageGraceSeconds: 0.05,

  /** Aim assist: max degrees the aim direction is nudged toward a target. */
  aimAssistMaxDeg: 8,
  /** Only targets within this cone are considered for assist. */
  aimAssistConeDeg: 26,
  aimAssistMaxRange: 18,
} as const;

export const AI = {
  /** Seconds between expensive perception updates (staggered across enemies). */
  perceptionIntervalSeconds: 0.15,
  /** Metres of slack when moving to a destination. */
  arriveRadius: 0.6,
  /** Seconds an enemy investigates a noise before giving up. */
  investigateSeconds: 6,
  /** Seconds an enemy holds position at a patrol point. */
  patrolPauseSeconds: 2.4,
  /** Metres. How far a patrol point may be from the spawn anchor. */
  patrolRadius: 9,
  /** Metres per second added to fleeing enemies. */
  fleeSpeedBonus: 0.8,
  /** Seconds a fleeing enemy runs before re-evaluating. */
  fleeSeconds: 4,
  /** Degrees per second an enemy can turn. */
  turnRateDeg: 220,
  /** Noise made by an enemy firing, in metres, alerting its allies. */
  allyAlertRadius: 16,
} as const;

export const RAID = {
  /** Total raid duration in seconds. */
  durationSeconds: 600,
  /** Seconds before the first extraction zone opens. */
  firstExtractionAtSeconds: 120,
  /** Seconds between extraction zone openings. */
  extractionIntervalSeconds: 180,
  /** How long a zone stays open once available. */
  extractionOpenSeconds: 180,
  /** Seconds of warning before a zone closes (UI starts blinking). */
  extractionWarningSeconds: 60,
  /** Seconds the player must stand in the zone to extract. */
  extractionHoldSeconds: 5,
  /** Radius of an extraction zone in metres. */
  extractionRadius: 3.4,
  /** Minimum distance in metres between the spawn and any extraction zone. */
  minSpawnToExtractionDistance: 28,
} as const;

export const MAP = {
  /** World units per grid cell, in metres. */
  cellSize: 2,
  /** Fragments chained together to form one raid map. */
  fragmentCount: 3,
  /** Fragment size in cells (square). */
  fragmentCells: 22,
  /** Cells of seam corridor between two fragments. */
  seamCells: 4,
  /** Minimum number of open cells a fragment must have to be usable. */
  minOpenCells: 120,
} as const;

export const LOOT = {
  /** Metres. Ground loot within this radius is auto-collected when walking over it. */
  autoPickupRadius: 0.0,
  /** Seconds a dropped item stays before despawning. 0 = never. */
  despawnSeconds: 0,
  /** Fraction of an enemy's carried ammo that actually drops. */
  enemyAmmoDropFactor: 0.5,
} as const;

export const ECONOMY = {
  startingCredits: 500,
  /** Trader buys at this fraction of item value. */
  sellFactor: 0.55,
  /** Trader sells at this multiple of item value. */
  buyFactor: 1.35,
  /** Echo shards kept after death, as a fraction of those carried (Pillar P5). */
  deathShardRetention: 0.5,
  /** XP awarded for a successful extraction. */
  extractionXp: 120,
  /** XP per 1000 credits of extracted loot value. */
  xpPerThousandValue: 40,
  /** XP needed for level n is base * n^exponent. */
  xpCurveBase: 400,
  xpCurveExponent: 1.35,
} as const;

export const ANOMALY = {
  /** Radius in metres of a Stillstand anomaly. */
  stillnessRadius: 4.5,
  /** Movement and projectile speed multiplier inside it. */
  stillnessSlowFactor: 0.35,
  /** Damage per second taken at the very core. */
  stillnessCoreDamagePerSecond: 9,
  /** Fraction of the radius that counts as the lethal core. */
  stillnessCoreFraction: 0.35,
} as const;

export const INPUT = {
  /** Stick deflection below this is ignored. */
  deadzone: 0.12,
  /** Deflection at which movement reaches full speed. */
  fullThrottleAt: 0.7,
  /** Right-stick deflection above which the weapon fires automatically. */
  autoFireThreshold: 0.25,
  /** Virtual stick radius in CSS pixels. */
  stickRadiusPx: 90,
} as const;

export const CAMERA = {
  /** Seconds for the camera to cover half the distance to its target. */
  followHalfLife: 0.12,
  /** Metres the camera leads ahead in the aim direction. */
  aimLeadDistance: 2.2,
  /** Metres of camera shake at maximum intensity. */
  maxShake: 0.35,
  shakeDecayPerSecond: 3.2,
} as const;
