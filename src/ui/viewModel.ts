/**
 * Simulation state -> flat UI snapshot.
 *
 * The UI never walks the ECS. It reads this object, which means a change to
 * component layout cannot break a screen, and the HUD can diff cheaply against
 * the previous frame instead of rebuilding DOM.
 */

import { RAID } from '@/content/balance';
import { findItem } from '@/content/items';
import { findWeapon } from '@/content/weapons';
import type { ExtractionPhase } from '@/game/components';
import { countItem, totalValue, totalWeight } from '@/game/inventory/inventory';
import type { InventorySlot, InventoryState } from '@/game/inventory/inventory';
import type { RaidSimulation } from '@/game/simulation/raidSimulation';

export interface HudZone {
  zoneId: string;
  name: string;
  x: number;
  y: number;
  phase: ExtractionPhase;
  /** Seconds until this zone opens or closes, whichever comes next. */
  secondsToChange: number;
}

export interface HudItem {
  itemId: string;
  name: string;
  quantity: number;
  weight: number;
  value: number;
  rarity: string;
  category: string;
}

export interface HudViewModel {
  alive: boolean;
  tick: number;

  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;

  weight: number;
  capacity: number;
  carriedValue: number;

  weaponName: string;
  magazine: number;
  magazineSize: number;
  reserveAmmo: number;
  reloading: boolean;
  reloadProgress: number;

  remainingSeconds: number;

  interactionLabel: string | null;
  interactionProgress: number;

  extractionActive: boolean;
  extractionProgress: number;
  extractionZoneName: string | null;

  usingItemLabel: string | null;
  usingItemProgress: number;

  /** Weapon is jammed and cannot fire until cleared. */
  jammed: boolean;
  /** 0..1 weapon condition, so the HUD can warn before it starts jamming. */
  weaponCondition: number;
  /** Name of the chambered round, for the ammo readout. */
  ammoName: string | null;

  playerX: number;
  playerY: number;
  playerRotation: number;

  zones: HudZone[];
  inventory: HudItem[];
  /** Consumables, surfaced as quick-use buttons in the HUD. */
  consumables: HudItem[];
  /** Throwables, surfaced as their own HUD buttons. */
  throwables: HudItem[];
}

const EMPTY: HudViewModel = {
  alive: false,
  tick: 0,
  health: 0,
  maxHealth: 100,
  stamina: 0,
  maxStamina: 100,
  weight: 0,
  capacity: 0,
  carriedValue: 0,
  weaponName: '-',
  magazine: 0,
  magazineSize: 0,
  reserveAmmo: 0,
  reloading: false,
  reloadProgress: 0,
  remainingSeconds: 0,
  interactionLabel: null,
  interactionProgress: 0,
  extractionActive: false,
  extractionProgress: 0,
  extractionZoneName: null,
  usingItemLabel: null,
  usingItemProgress: 0,
  jammed: false,
  weaponCondition: 1,
  ammoName: null,
  playerX: 0,
  playerY: 0,
  playerRotation: 0,
  zones: [],
  inventory: [],
  consumables: [],
  throwables: [],
};

export function buildHudViewModel(sim: RaidSimulation): HudViewModel {
  const player = sim.world.playerEntity;
  if (player === null) return { ...EMPTY, remainingSeconds: sim.remainingSeconds };

  const health = sim.world.healths.get(player);
  const stamina = sim.world.staminas.get(player);
  const carrier = sim.world.carriers.get(player);
  const weaponState = sim.world.weapons.get(player);
  const transform = sim.world.transforms.get(player);
  const usingItem = sim.world.usingItems.get(player);

  const weaponDef = weaponState ? findWeapon(weaponState.weaponId) : undefined;
  const inventory = carrier?.inventory;

  const zones: HudZone[] = [];
  for (const [entity, zone] of sim.world.extractionZones.entries()) {
    const zoneTransform = sim.world.transforms.get(entity);
    if (!zoneTransform) continue;

    const targetTick = zone.phase === 'locked' ? zone.opensAtTick : zone.closesAtTick;
    zones.push({
      zoneId: zone.zoneId,
      name: zone.name,
      x: zoneTransform.x,
      y: zoneTransform.y,
      phase: zone.phase,
      secondsToChange: Math.max(0, (targetTick - sim.tick) / 60),
    });
  }

  const holding = [...sim.world.extractionZones.values()].find((zone) => zone.holdProgress > 0);
  const interaction = sim.interactionTarget;

  return {
    alive: (health?.current ?? 0) > 0,
    tick: sim.tick,

    health: health?.current ?? 0,
    maxHealth: health?.max ?? 100,
    stamina: stamina?.current ?? 0,
    maxStamina: stamina?.max ?? 100,

    weight: inventory ? totalWeight(inventory) : 0,
    capacity: inventory?.capacityKg ?? 0,
    carriedValue: inventory ? totalValue(inventory) : 0,

    weaponName: weaponDef?.name ?? 'Unbewaffnet',
    magazine: weaponState?.magazine ?? 0,
    magazineSize: weaponDef?.magazineSize ?? 0,
    reserveAmmo: reserveAmmoFor(inventory, weaponState?.loadedAmmoItemId ?? weaponDef?.defaultAmmoItemId ?? null),
    reloading: (weaponState?.reloadRemaining ?? 0) > 0,
    reloadProgress:
      weaponState && weaponDef && weaponState.reloadRemaining > 0
        ? 1 - weaponState.reloadRemaining / weaponDef.reloadSeconds
        : 0,

    remainingSeconds: sim.remainingSeconds,

    interactionLabel: interaction?.label ?? null,
    interactionProgress: interaction?.progress ?? 0,

    extractionActive: holding !== undefined,
    extractionProgress: holding ? holding.holdProgress / RAID.extractionHoldSeconds : 0,
    extractionZoneName: holding?.name ?? null,

    usingItemLabel: usingItem ? (findItem(usingItem.itemId)?.name ?? null) : null,
    usingItemProgress: usingItem ? 1 - usingItem.remaining / usingItem.total : 0,

    jammed: (weaponState?.jamRemaining ?? 0) > 0,
    weaponCondition:
      weaponState && weaponState.durabilityMax > 0
        ? weaponState.durability / weaponState.durabilityMax
        : 1,
    ammoName: weaponState?.loadedAmmoItemId
      ? (findItem(weaponState.loadedAmmoItemId)?.name ?? null)
      : null,

    playerX: transform?.x ?? 0,
    playerY: transform?.y ?? 0,
    playerRotation: transform?.rotation ?? 0,

    zones,
    inventory: inventory ? toHudItems(inventory.slots) : [],
    consumables: inventory
      ? toHudItems(inventory.slots).filter((item) => item.category === 'medical')
      : [],
    throwables: inventory
      ? mergeHudItems(toHudItems(inventory.slots).filter((item) => item.category === 'throwable'))
      : [],
  };
}

/**
 * Rounds of the chambered type still in reserve.
 * Shows what can actually be loaded next, not every round of that calibre -
 * a magazine of armour-piercing cannot be topped up with buckshot.
 */
function reserveAmmoFor(inventory: InventoryState | undefined, ammoItemId: string | null): number {
  if (!inventory || !ammoItemId) return 0;
  return countItem(inventory, ammoItemId);
}

export function toHudItems(slots: readonly InventorySlot[]): HudItem[] {
  const items: HudItem[] = [];
  for (const slot of slots) {
    const def = findItem(slot.itemId);
    if (!def) continue;
    items.push({
      itemId: slot.itemId,
      name: def.name,
      quantity: slot.quantity,
      weight: def.weight * slot.quantity,
      value: def.value * slot.quantity,
      rarity: def.rarity,
      category: def.category,
    });
  }
  return items;
}

/** Merge duplicate stacks for display, keeping the catalogue order stable. */
export function mergeHudItems(items: readonly HudItem[]): HudItem[] {
  const byId = new Map<string, HudItem>();
  for (const item of items) {
    const existing = byId.get(item.itemId);
    if (existing) {
      existing.quantity += item.quantity;
      existing.weight += item.weight;
      existing.value += item.value;
    } else {
      byId.set(item.itemId, { ...item });
    }
  }
  return [...byId.values()];
}
