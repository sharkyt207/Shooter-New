import { describe, expect, it } from 'vitest';
import { ComponentStore } from './componentStore';
import { EntityAllocator, entityGeneration, entityIndex } from './entity';
import { World } from './world';

interface Position {
  x: number;
  y: number;
}

class TestWorld extends World {
  readonly positions = this.registerStore<Position>('position');
  readonly labels = this.registerStore<string>('label');
}

describe('EntityAllocator', () => {
  it('creates unique live entities', () => {
    const allocator = new EntityAllocator();
    const a = allocator.create();
    const b = allocator.create();
    expect(a).not.toBe(b);
    expect(allocator.isAlive(a)).toBe(true);
    expect(allocator.count).toBe(2);
  });

  it('invalidates stale ids after recycling an index', () => {
    const allocator = new EntityAllocator();
    const first = allocator.create();
    allocator.destroy(first);
    const second = allocator.create();

    // The index is reused, but the generation differs - so the old handle is
    // detectably stale instead of silently pointing at a new entity.
    expect(entityIndex(second)).toBe(entityIndex(first));
    expect(entityGeneration(second)).not.toBe(entityGeneration(first));
    expect(allocator.isAlive(first)).toBe(false);
    expect(allocator.isAlive(second)).toBe(true);
  });

  it('ignores a double destroy', () => {
    const allocator = new EntityAllocator();
    const entity = allocator.create();
    expect(allocator.destroy(entity)).toBe(true);
    expect(allocator.destroy(entity)).toBe(false);
    expect(allocator.count).toBe(0);
  });
});

describe('ComponentStore', () => {
  it('stores, reads and removes', () => {
    const store = new ComponentStore<Position>('position');
    const entity = 1 as never;
    store.set(entity, { x: 1, y: 2 });
    expect(store.get(entity)).toEqual({ x: 1, y: 2 });
    expect(store.has(entity)).toBe(true);
    expect(store.remove(entity)).toBe(true);
    expect(store.get(entity)).toBeUndefined();
  });

  it('throws a useful error when a required component is missing', () => {
    const store = new ComponentStore<Position>('position');
    expect(() => store.require(42 as never)).toThrow(/position/);
  });

  it('snapshots keys so callers can mutate while iterating', () => {
    const store = new ComponentStore<string>('label');
    store.set(1 as never, 'a');
    store.set(2 as never, 'b');

    const keys = store.keyArray();
    for (const key of keys) store.remove(key);
    expect(store.size).toBe(0);
  });
});

describe('World', () => {
  it('defers destruction until the flush point', () => {
    const world = new TestWorld();
    const entity = world.createEntity();
    world.positions.set(entity, { x: 0, y: 0 });

    world.destroyEntity(entity);
    // Still addressable this tick - systems mid-iteration must not trip over it.
    expect(world.positions.has(entity)).toBe(true);
    expect(world.isAlive(entity)).toBe(false);

    expect(world.flushDestroyed()).toBe(1);
    expect(world.positions.has(entity)).toBe(false);
  });

  it('removes every component of a destroyed entity', () => {
    const world = new TestWorld();
    const entity = world.createEntity();
    world.positions.set(entity, { x: 3, y: 4 });
    world.labels.set(entity, 'target');

    world.destroyEntity(entity);
    world.flushDestroyed();

    expect(world.positions.has(entity)).toBe(false);
    expect(world.labels.has(entity)).toBe(false);
    expect(world.entityCount).toBe(0);
  });

  it('rejects duplicate store registration', () => {
    class Broken extends World {
      constructor() {
        super();
        this.registerStore('dup');
        this.registerStore('dup');
      }
    }
    expect(() => new Broken()).toThrow(/already registered/);
  });

  it('reports component statistics', () => {
    const world = new TestWorld();
    const entity = world.createEntity();
    world.positions.set(entity, { x: 0, y: 0 });
    const stats = world.stats();
    expect(stats.entities).toBe(1);
    expect(stats.components['position']).toBe(1);
    expect(stats.components['label']).toBe(0);
  });
});
