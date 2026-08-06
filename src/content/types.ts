/**
 * Content type definitions.
 *
 * `content/**` is purely declarative (see docs/04-MODULES.md): data objects, no
 * behaviour. These interfaces are the schema every content file is checked
 * against at compile time, so a malformed weapon or loot table is a build error
 * rather than a runtime surprise.
 *
 * Note that every visual reference is a LOGICAL ASSET KEY, never a file path
 * (ADR-008). Swapping Canva placeholders for final art touches no code.
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type ItemCategory =
  | 'weapon'
  | 'ammo'
  | 'medical'
  | 'material'
  | 'valuable'
  | 'armor'
  | 'backpack'
  | 'attachment'
  | 'throwable';

/**
 * Where a hit lands.
 *
 * In an isometric top-down view the player cannot aim at a head deliberately,
 * so zones are resolved by a weighted roll rather than by geometry. Weapon
 * class shifts the weights: a marksman rifle finds the head far more often than
 * a shotgun does. That keeps the genre's "one good shot ends it" tension
 * without pretending to a precision the camera cannot offer.
 */
export type HitZone = 'head' | 'torso' | 'limbs';

/** Ammunition calibres. A weapon accepts any ammo item of its calibre. */
export type Caliber = 'cal_9mm' | 'cal_74' | 'cal_12';

/**
 * Ammunition behaviour.
 *
 * Penetration is compared against the target's armour class: the same rifle
 * becomes a different weapon depending on what is loaded. This is the core of
 * M2 - a shot is no longer just "damage".
 */
export interface AmmoStats {
  caliber: Caliber;
  /** Multiplier on the weapon's base damage. */
  damageMultiplier: number;
  /** 0..100, compared against effective armour class. */
  penetration: number;
  /** 0..1 chance of extra damage when the round meets no armour. */
  fragmentation: number;
  /** Bonus damage factor applied when a round fragments. */
  fragmentationBonus: number;
  /** Multiplier on projectile speed. */
  speedMultiplier: number;
  /** Overrides the weapon's pellet count. A slug turns a shotgun into a rifle. */
  pelletsOverride?: number;
  /** Multiplier on the weapon's base spread. */
  spreadMultiplier?: number;
}

/**
 * Armour behaviour.
 *
 * `armorClass` decides *whether* a round gets through; `reduction` decides how
 * much is absorbed when it does not. Durability erodes the effective class, so
 * a battered plate carrier stops progressively less.
 */
export interface ArmorStats {
  /** 1..6. Higher classes stop higher penetration values. */
  armorClass: number;
  durability: number;
  /** Damage reduction 0..1 when the round fails to penetrate. */
  reduction: number;
  /** Which hit zones this piece covers. */
  coverage: readonly HitZone[];
  /** Movement speed penalty 0..1, applied on top of encumbrance. */
  speedPenalty: number;
}

export type AttachmentSlot = 'barrel' | 'sight' | 'magazine' | 'muzzle';

/**
 * Stat deltas of a weapon attachment.
 *
 * Multipliers default to 1, additions to 0 - an omitted field means "changes
 * nothing", which keeps the data files readable.
 */
export interface AttachmentModifiers {
  spreadDegMult?: number;
  spreadPerShotDegMult?: number;
  maxSpreadDegMult?: number;
  effectiveRangeAdd?: number;
  maxRangeAdd?: number;
  projectileSpeedMult?: number;
  magazineSizeAdd?: number;
  reloadSecondsMult?: number;
  noiseRadiusMult?: number;
  /** Ergonomics: higher recovers spread faster and steadies quicker. */
  ergonomicsAdd?: number;
  damageMult?: number;
  /** Extra kilograms. Attachments are never free. */
  weightAdd?: number;
}

/** Attachment ids fitted per slot. A missing slot means "nothing fitted". */
export type AttachmentLoadout = Partial<Record<AttachmentSlot, string>>;

export interface AttachmentDef {
  id: string;
  itemId: string;
  name: string;
  slot: AttachmentSlot;
  /** Weapon ids this attachment fits. Empty means "fits everything". */
  compatibleWeapons: readonly string[];
  modifiers: AttachmentModifiers;
}

export type ThrowableKind = 'frag' | 'flash' | 'lure';

export interface ThrowableDef {
  id: string;
  itemId: string;
  name: string;
  kind: ThrowableKind;
  /** Seconds from throw to detonation. */
  fuseSeconds: number;
  /** Metres per second the object travels. */
  throwSpeed: number;
  /** Maximum throw distance in metres. */
  throwRange: number;
  /** Effect radius in metres. */
  radius: number;
  /** Damage at the centre, falling off to zero at the edge. Frag only. */
  damage: number;
  /** Seconds enemies stay disoriented. Flash only. */
  disorientSeconds: number;
  /** Noise radius on detonation - the whole point of the lure. */
  noiseRadius: number;
  visual: string;
}

/** What happens when the player uses a consumable. */
export interface ConsumableEffect {
  /** Health restored, absolute points. */
  health?: number;
  /** Stamina restored, absolute points. */
  stamina?: number;
  /** Seconds the item takes to apply. The player is vulnerable meanwhile. */
  useSeconds: number;
}

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  rarity: Rarity;
  /** Kilograms. The core currency of the inventory decision (ADR-005). */
  weight: number;
  /** Base trader value in credits. */
  value: number;
  /** How many fit in one inventory entry. 1 = not stackable. */
  stackSize: number;
  /** Logical asset key, resolved through the asset manifest. */
  icon: string;
  consumable?: ConsumableEffect;
  armor?: ArmorStats;
  ammo?: AmmoStats;
  /** For backpacks: how much weight the player can carry with it equipped. */
  capacityKg?: number;
}

export type WeaponClass = 'smg' | 'marksman' | 'shotgun';

export interface WeaponDef {
  id: string;
  /** The inventory item that represents this weapon. */
  itemId: string;
  name: string;
  weaponClass: WeaponClass;
  tier: number;
  /** Damage per projectile, before armor and falloff. */
  damage: number;
  /** Projectiles fired per trigger pull. > 1 for shotguns. */
  pellets: number;
  roundsPerMinute: number;
  magazineSize: number;
  /** Base cone half-angle in degrees, applied as a gaussian. */
  spreadDeg: number;
  /** Extra spread added per shot, decaying over time. */
  spreadPerShotDeg: number;
  maxSpreadDeg: number;
  reloadSeconds: number;
  /** Metres per second. Slow enough that leading a target matters. */
  projectileSpeed: number;
  /** Metres. Beyond this, damage falls off to `minDamageFactor`. */
  effectiveRange: number;
  maxRange: number;
  minDamageFactor: number;
  /** The calibre this weapon chambers. Any ammo item of that calibre fits. */
  caliber: Caliber;
  /** Ammo used when nothing better is available (AI, starter loadouts). */
  defaultAmmoItemId: string;
  /** Metres. Enemies within this radius hear the shot. */
  noiseRadius: number;
  /** 0..100. Higher recovers spread faster and jams less under wear. */
  ergonomics: number;
  /** Full durability pool. Wear reduces accuracy and invites jams. */
  durabilityMax: number;
  /** Durability lost per shot. */
  wearPerShot: number;
  /** Attachment slots this weapon offers. */
  slots: readonly AttachmentSlot[];
  /** Shifts hit-zone weights; a marksman rifle finds the head more often. */
  zoneBias: { head: number; torso: number; limbs: number };
  visual: string;
}

export interface PerceptionDef {
  /** Metres the enemy can see. */
  visionRange: number;
  /** Full cone opening in degrees. */
  visionConeDeg: number;
  /** Metres at which noise is noticed. */
  hearingRange: number;
  /** Seconds of continuous sight before the target is confirmed. */
  awarenessSeconds: number;
  /** Seconds of lost sight before the enemy gives up the chase. */
  memorySeconds: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  faction: 'scavengers' | 'order' | 'weaved' | 'wardens';
  health: number;
  /** Metres per second. */
  moveSpeed: number;
  /** Multiplier applied to move speed while chasing. */
  chaseSpeedFactor: number;
  radius: number;
  /** Natural armour class of the archetype, 0 = unarmoured. */
  armorClass: number;
  perception: PerceptionDef;
  /** Weapon this archetype fires. */
  weaponId: string;
  /** Accuracy 0..1. Scales the enemy's inherited weapon spread (1 = as accurate as the player). */
  accuracy: number;
  /** Seconds between burst attacks. */
  attackCooldownSeconds: number;
  /** Rounds fired per burst. */
  burstCount: number;
  /** Preferred engagement distance in metres. */
  preferredRange: number;
  /** Health fraction below which the enemy flees. 0 = never flees. */
  fleeHealthFraction: number;
  /** Loot table rolled on death. */
  lootTableId: string;
  /** Experience awarded to the player. */
  xp: number;
  visual: string;
}

export interface LootEntry {
  itemId: string;
  /** Relative weight within the table. */
  weight: number;
  minQuantity: number;
  maxQuantity: number;
}

export interface LootTableDef {
  id: string;
  /** How many independent rolls this table performs. */
  rolls: { min: number; max: number };
  /** Chance per roll that it yields nothing at all. Keeps containers tense. */
  emptyChance: number;
  entries: readonly LootEntry[];
}

export type ContainerKind = 'crate' | 'locker' | 'medcase' | 'echo_cache';

export interface ContainerDef {
  id: string;
  kind: ContainerKind;
  name: string;
  lootTableId: string;
  /** Seconds the player must hold the search to open it. */
  searchSeconds: number;
  visual: string;
}

export interface BiomeDef {
  id: string;
  name: string;
  /** Ambient light tint as 0xRRGGBB, used by the lighting pass. */
  ambientColor: number;
  /** 0 = pitch black, 1 = fully lit. Drives the darkness overlay. */
  ambientIntensity: number;
  /** Fraction of interior cells that become walls. Higher = more maze-like. */
  wallDensity: number;
  /** Containers per 100 square metres. */
  containerDensity: number;
  /** Enemies per 100 square metres. */
  enemyDensity: number;
  /** Weighted enemy archetypes that can spawn here. */
  enemyWeights: ReadonlyArray<{ enemyId: string; weight: number }>;
  /** Weighted container types found here. */
  containerWeights: ReadonlyArray<{ containerId: string; weight: number }>;
  /** Chance per fragment that an anomaly forms. */
  anomalyChance: number;
  tiles: { floor: string; wall: string };
}

export interface BaseModuleLevel {
  level: number;
  costCredits: number;
  /** Human-readable summary of what this level unlocks. */
  unlocks: string;
  /** Extra stash capacity in kilograms, if applicable. */
  stashCapacityKg?: number;
}

export interface BaseModuleDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  levels: readonly BaseModuleLevel[];
}

export interface RecipeDef {
  id: string;
  name: string;
  /** Base module required, and at which level. */
  requires: { moduleId: string; level: number };
  inputs: ReadonlyArray<{ itemId: string; quantity: number }>;
  output: { itemId: string; quantity: number };
  craftSeconds: number;
}
