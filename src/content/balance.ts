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

  /** Seconds of invulnerability after taking damage. Prevents burst-frame death. */
  damageGraceSeconds: 0.05,

  /** Aim assist: max degrees the aim direction is nudged toward a target. */
  aimAssistMaxDeg: 8,
  /** Only targets within this cone are considered for assist. */
  aimAssistConeDeg: 26,
  aimAssistMaxRange: 18,
} as const;

/**
 * Weapon handling, wear and jamming (M2).
 *
 * Wear is deliberately slow and jams start only past a threshold: a weapon that
 * could jam at any moment is just noise, one that jams when neglected teaches
 * maintenance.
 */
export const WEAPON = {
  /** Extra spread at zero durability, as a fraction of base spread. */
  wearSpreadPenalty: 0.85,
  /** Wear fraction below which a weapon never jams. */
  jamWearThreshold: 0.45,
  /** Jam chance per shot at total ruin, before ergonomics relief. */
  jamChanceAtRuin: 0.16,
  /** How much perfect ergonomics reduces the jam chance (0..1). */
  jamErgonomicsRelief: 0.6,
  /** Seconds to clear a jam. Long enough to hurt, short enough to survive. */
  jamClearSeconds: 1.6,

  /** Degrees of accumulated spread shed per second at 0 / 100 ergonomics. */
  bloomRecoveryMin: 4,
  bloomRecoveryMax: 13,

  /** Repair cost per durability point, in credits. */
  repairCostPerPoint: 9,
  /** Fraction of maximum durability permanently lost per repair. */
  repairWearPenalty: 0.06,
} as const;

/**
 * Penetration versus armour (M2).
 *
 * A round's penetration is compared against the target's effective armour
 * class. Around the break-even point the outcome is a coin flip, which keeps
 * marginal ammunition genuinely tense rather than simply "works" or "does not".
 */
export const ARMOR = {
  /** Penetration value one armour class is worth. */
  penetrationPerClass: 11,
  /** Penetration spread over which the chance goes from 0 to 1. */
  penetrationWindow: 26,
  /** Durability lost when armour stops a round. */
  durabilityPerBlock: 3.2,
  /** Durability lost when a round goes through. */
  durabilityPerPenetration: 1.1,
  /** Damage that still gets through a successful block, as a floor. */
  minDamageThroughArmor: 0.12,
  /** Armour keeps only this share of its class at zero durability. */
  ruinedClassFactor: 0.25,
} as const;

/** Hit zone damage multipliers and base weighting (M2). */
export const HIT_ZONES = {
  headMultiplier: 2.6,
  torsoMultiplier: 1,
  limbsMultiplier: 0.72,
  /** Unaware targets are easier to hit well. */
  unawareHeadBonusWeight: 6,
} as const;

/** Throwables and melee (M2). */
export const THROWABLE = {
  /** Seconds the throw animation locks the player. */
  windupSeconds: 0.25,
  /** Minimum throw distance, so a tap never drops it at your feet. */
  minRange: 2,
  /** Metres a frag's noise carries. */
  fragNoiseRadius: 30,
  flashNoiseRadius: 22,
} as const;

export const MELEE = {
  damage: 34,
  /** Multiplier against a target that has not noticed you. */
  unawareMultiplier: 3.2,
  range: 1.5,
  /** Half-angle of the attack arc, in degrees. */
  arcDeg: 55,
  cooldownSeconds: 0.75,
  /** Metres the swing carries. Quiet by design - this is the stealth option. */
  noiseRadius: 3,
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

  // ── M3: squads, navigation, hearing ──────────────────────────────────────
  /** Ticks a squad acts on what it last knew before treating it as stale. */
  squadMemoryTicks: 60 * 12,
  /** Metres a flanker swings out to the side of the target. */
  flankOffset: 7,
  /** Metres squad mates try to keep between each other. */
  separationRadius: 1.6,
  /** Strength of the separation push, 0..1. */
  separationStrength: 0.55,
  /** Maximum enemies grouped into one squad. */
  maxSquadSize: 4,
  /** Metres within which spawned enemies of one faction form a squad. */
  squadGroupRadius: 14,

  /**
   * Fraction of a sound that survives each wall it passes through.
   * Two walls leave a quarter of the radius - which is what makes a suppressor
   * plus a corner genuinely quiet.
   */
  wallSoundDamping: 0.5,
  /** Walls beyond this count block a sound entirely. */
  maxWallsHeard: 4,

  /** Seconds without line of sight before an enemy considers a grenade. */
  grenadeAfterBlindSeconds: 2.2,
  /** Seconds between grenade attempts per enemy. */
  grenadeCooldownSeconds: 14,
  /** Metres: closer than this and the enemy would catch its own blast. */
  grenadeMinRange: 5,
  grenadeMaxRange: 15,

  /** How far a suppressing enemy stays back, as a factor of preferred range. */
  suppressRangeFactor: 1.25,

  /** Metres around itself a suppressing enemy will look for an authored cover post. */
  coverSearchRadius: 16,
  /** Within this distance of a cover post an enemy counts as "in cover" and holds. */
  coverHoldRadius: 1.3,
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
  /** Prefab rooms stamped into each fragment. */
  prefabsPerFragment: { min: 1, max: 3 },
  /** Cells of clearance kept around a stamped prefab. */
  prefabMargin: 2,

  /**
   * Chance a raid contains a Warden.
   * Not every raid: a boss in every rift would make it routine rather than an
   * event worth telling someone about.
   */
  wardenChance: 0.35,
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

/**
 * The meta layer between raids.
 *
 * Two principles run through every number here.
 *
 * **Time is measured in raids.** A build or a craft that takes longer than one
 * raid is a reason to go on another one; a timer that outlives an evening is a
 * reason to stop playing. Nothing waits longer than an hour.
 *
 * **Nothing is ever a total loss.** A failed craft returns most of its
 * materials, insurance brings gear back, and the secure container never opens
 * for anyone but its owner. The raid is allowed to be brutal precisely because
 * the base is not.
 */
export const META = {
  /** Global multiplier on every build and craft timer. A tuning handle. */
  timeScale: 1,

  // ── Crafting ─────────────────────────────────────────────────────────────
  /**
   * Fraction of the inputs returned when a craft fails.
   * High on purpose: a failure should cost time and a little material, never a
   * morning's looting. Losing everything teaches players not to craft.
   */
  craftFailureRefund: 0.6,
  /** Failure chance removed per module level above the recipe's requirement. */
  craftFailureReductionPerLevel: 0.35,
  /** Jobs that may run at the same time, per workbench level. */
  craftSlotsPerLevel: 1,

  // ── Reputation ───────────────────────────────────────────────────────────
  /**
   * Reputation earned per credit of trade volume, in either direction.
   * Calibrated against a real raid: a good haul is worth roughly 15-20k in
   * trade, which should be visible progress towards the first tier rather than
   * a rounding error.
   */
  reputationPerCredit: 0.03,
  /** Reputation thresholds for tier 1, 2 and 3. Tier 0 needs nothing. */
  reputationTiers: [0, 300, 900, 2000],
  /** Better prices per reputation tier, both when buying and when selling. */
  sellBonusPerTier: 0.05,
  buyDiscountPerTier: 0.05,

  // ── Contracts ────────────────────────────────────────────────────────────
  contractSlots: 3,
  /** Hours before the offered contracts are replaced. */
  contractRefreshHours: 8,

  // ── Insurance ────────────────────────────────────────────────────────────
  /** Premium as a fraction of the insured gear's value. */
  insurancePremiumFactor: 0.16,
  /** Premium reduction per level of the medical module. */
  insuranceDiscountPerMedicalLevel: 0.18,
  /**
   * Chance an insured item finds its way back.
   * Not 1: insurance softens a loss, it does not cancel one. A raid you cannot
   * lose is a raid with no tension left (Pillar P1).
   */
  insuranceReturnChance: 0.7,
  /** Minutes before insured gear arrives back at the base. */
  insuranceReturnMinutes: 20,
  /** Minutes removed per level of the medical module. */
  insuranceMinutesPerMedicalLevel: 6,
} as const;

export const DOORS = {
  /**
   * Metres at which an actor pushes a door open.
   *
   * Doors open on approach rather than on a button. On a touch screen an extra
   * verb the player must find mid-fight is a design failure (Pillar P4), and an
   * automatic door removes a whole class of AI-stuck-on-the-frame bugs.
   */
  autoOpenRange: 1.5,
  /** Metres the sound of a door carries. Opening one is not free. */
  noiseRadius: 11,
  /** Extra hearing radius for a door that had to be forced with a key. */
  lockedNoiseRadius: 16,
} as const;

export const LIGHT = {
  /** Ambient level below which the game counts as dark enough to need a lamp. */
  darkThreshold: 0.72,
  /** Metres the flashlight reaches. */
  coneRange: 11,
  /** Full width of the flashlight cone, in degrees. */
  coneDeg: 62,
  /**
   * How much further an enemy spots a player carrying a lit lamp.
   * This is the trade the night side of a fragment is built on: see, or be
   * unseen. Never both.
   */
  spottedRangeBonus: 1.55,
} as const;

export const ANOMALY = {
  /** Movement and projectile speed multiplier at the centre of a Stillstand. */
  stillnessSlowFactor: 0.35,
  /** Damage per second at the very core of a Stillstand. */
  stillnessCoreDamagePerSecond: 9,

  /** Seconds between Rückstoß pulses. Long enough to time a crossing. */
  recoilPulseSeconds: 3.2,
  /** Metres per second imparted at the centre of a pulse. */
  recoilPushSpeed: 11,
  /** Damage at the centre of a pulse, falling off to the edge. */
  recoilPulseDamage: 26,

  /** Health per second drained by a Bleiche at its core. */
  bleachDrainPerSecond: 7,

  /** Seconds an Echo-Schatten remembers a passer-by. */
  echoMemorySeconds: 45,
  /** Seconds between recorded samples. */
  echoSampleSeconds: 1.5,
  /** Metres an echo's ghost noise carries when it replays. */
  echoNoiseRadius: 9,
  /** Seconds between echo replays. */
  echoReplaySeconds: 6,

  /** Extra strength every anomaly gains during a rift pulse. */
  riftPulseIntensity: 1.4,
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
