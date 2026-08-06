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
  | 'backpack';

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
  /** For armor: damage reduction 0..1 and the durability pool. */
  armor?: { reduction: number; durability: number };
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
  ammoItemId: string;
  /** Metres. Enemies within this radius hear the shot. */
  noiseRadius: number;
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
  /** Damage reduction 0..1 from natural armor. */
  armorReduction: number;
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
