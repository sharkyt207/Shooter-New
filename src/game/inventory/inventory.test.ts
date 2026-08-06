import { describe, expect, it } from 'vitest';
import { getItem } from '@/content/items';
import {
  addItem,
  compact,
  countItem,
  createInventory,
  fittableQuantity,
  loadFraction,
  removeItem,
  sortInventory,
  totalValue,
  totalWeight,
  transferAll,
  transferItem,
} from './inventory';

const BANDAGE = 'itm_bandage';
const AMMO = 'itm_ammo_9mm';
const PLATE = 'itm_armor_plate';

describe('inventory weight budget', () => {
  it('adds items and tracks weight', () => {
    const inv = createInventory(10);
    expect(addItem(inv, BANDAGE, 3)).toBe(3);
    expect(countItem(inv, BANDAGE)).toBe(3);
    expect(totalWeight(inv)).toBeCloseTo(getItem(BANDAGE).weight * 3, 6);
  });

  it('adds only what fits and reports the partial amount', () => {
    // The plate weighs 8.4 kg, so exactly one fits into a 10 kg container.
    const inv = createInventory(10);
    expect(addItem(inv, PLATE, 3)).toBe(1);
    expect(countItem(inv, PLATE)).toBe(1);
  });

  it('refuses to exceed capacity', () => {
    const inv = createInventory(1);
    addItem(inv, AMMO, 10000);
    expect(totalWeight(inv)).toBeLessThanOrEqual(1.0000001);
  });

  it('computes how much would still fit', () => {
    const inv = createInventory(1);
    const perUnit = getItem(AMMO).weight;
    expect(fittableQuantity(inv, AMMO, 10000)).toBe(Math.floor(1 / perUnit));
  });

  it('reports load fraction including overload', () => {
    const inv = createInventory(2);
    addItem(inv, BANDAGE, 5); // 1.0 kg
    expect(loadFraction(inv)).toBeCloseTo(0.5, 5);
  });
});

describe('stacking', () => {
  it('respects stack size limits', () => {
    const inv = createInventory(1000);
    const stackSize = getItem(BANDAGE).stackSize;
    addItem(inv, BANDAGE, stackSize + 2);

    expect(countItem(inv, BANDAGE)).toBe(stackSize + 2);
    expect(inv.slots.length).toBe(2);
    expect(inv.slots[0]?.quantity).toBe(stackSize);
    expect(inv.slots[1]?.quantity).toBe(2);
  });

  it('tops up existing stacks before opening new ones', () => {
    const inv = createInventory(1000);
    addItem(inv, BANDAGE, 2);
    addItem(inv, BANDAGE, 2);
    expect(inv.slots.length).toBe(1);
    expect(inv.slots[0]?.quantity).toBe(4);
  });

  it('merges partial stacks when compacting', () => {
    const inv = createInventory(1000);
    inv.slots.push({ itemId: BANDAGE, quantity: 1 });
    inv.slots.push({ itemId: BANDAGE, quantity: 1 });
    inv.slots.push({ itemId: BANDAGE, quantity: 0 });
    compact(inv);
    expect(inv.slots.length).toBe(1);
    expect(inv.slots[0]?.quantity).toBe(2);
  });
});

describe('removing and transferring', () => {
  it('removes across multiple stacks', () => {
    const inv = createInventory(1000);
    addItem(inv, BANDAGE, 10);
    expect(removeItem(inv, BANDAGE, 7)).toBe(7);
    expect(countItem(inv, BANDAGE)).toBe(3);
  });

  it('never removes more than is present', () => {
    const inv = createInventory(1000);
    addItem(inv, BANDAGE, 2);
    expect(removeItem(inv, BANDAGE, 5)).toBe(2);
    expect(countItem(inv, BANDAGE)).toBe(0);
  });

  it('transfers between inventories', () => {
    const from = createInventory(100);
    const to = createInventory(100);
    addItem(from, BANDAGE, 4);

    expect(transferItem(from, to, BANDAGE, 3)).toBe(3);
    expect(countItem(from, BANDAGE)).toBe(1);
    expect(countItem(to, BANDAGE)).toBe(3);
  });

  it('reports leftovers when the target runs out of space', () => {
    const from = createInventory(100);
    const to = createInventory(1); // fits 5 bandages at 0.2 kg each
    addItem(from, BANDAGE, 8);

    const leftovers = transferAll(from, to);
    expect(countItem(to, BANDAGE)).toBe(5);
    expect(leftovers).toEqual([{ itemId: BANDAGE, quantity: 3 }]);
    expect(countItem(from, BANDAGE)).toBe(3);
  });
});

describe('sorting and valuation', () => {
  it('sorts by total value descending', () => {
    const inv = createInventory(1000);
    addItem(inv, AMMO, 10);
    addItem(inv, PLATE, 1);
    sortInventory(inv, 'value');
    expect(inv.slots[0]?.itemId).toBe(PLATE);
  });

  it('sums trader value', () => {
    const inv = createInventory(1000);
    addItem(inv, BANDAGE, 2);
    expect(totalValue(inv)).toBe(getItem(BANDAGE).value * 2);
  });

  it('ignores unknown item ids instead of throwing', () => {
    const inv = createInventory(100);
    expect(addItem(inv, 'itm_does_not_exist', 5)).toBe(0);
    expect(totalWeight(inv)).toBe(0);
  });
});
