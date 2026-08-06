/**
 * Generic ECS world (ADR-003).
 *
 * `core` knows nothing about the game, so this class is deliberately empty of
 * gameplay: it owns entity lifetime and a registry of component stores. The
 * simulation subclasses it in `game/` and declares the actual components.
 *
 * Deferred destruction: `destroyEntity` only marks. Actual removal happens in
 * `flushDestroyed()`, called at a defined point in the tick. That way a system
 * can never trip over an entity that vanished mid-iteration.
 */

import { ComponentStore } from './componentStore';
import { EntityAllocator, type EntityId } from './entity';

export class World {
  private readonly allocator = new EntityAllocator();
  private readonly stores = new Map<string, ComponentStore<unknown>>();
  private readonly pendingDestroy = new Set<EntityId>();

  get entityCount(): number {
    return this.allocator.count;
  }

  /**
   * Register a component store. Called once per component type at construction.
   * Returns the store so subclasses can expose it as a readonly field.
   */
  protected registerStore<T>(name: string): ComponentStore<T> {
    if (this.stores.has(name)) {
      throw new Error(`World: component store "${name}" is already registered`);
    }
    const store = new ComponentStore<T>(name);
    this.stores.set(name, store as ComponentStore<unknown>);
    return store;
  }

  createEntity(): EntityId {
    return this.allocator.create();
  }

  isAlive(entity: EntityId): boolean {
    return this.allocator.isAlive(entity) && !this.pendingDestroy.has(entity);
  }

  /** Mark for destruction. Removal happens in `flushDestroyed()`. */
  destroyEntity(entity: EntityId): void {
    if (this.allocator.isAlive(entity)) this.pendingDestroy.add(entity);
  }

  isPendingDestroy(entity: EntityId): boolean {
    return this.pendingDestroy.has(entity);
  }

  /**
   * Remove every entity marked this tick, along with all of its components.
   * Returns the number of entities actually removed.
   */
  flushDestroyed(): number {
    if (this.pendingDestroy.size === 0) return 0;

    let removed = 0;
    for (const entity of this.pendingDestroy) {
      for (const store of this.stores.values()) store.remove(entity);
      if (this.allocator.destroy(entity)) removed++;
    }
    this.pendingDestroy.clear();
    return removed;
  }

  /** Wipe the world. Used between raids so nothing carries over. */
  reset(): void {
    for (const store of this.stores.values()) store.clear();
    this.pendingDestroy.clear();
    this.allocator.reset();
  }

  /** Diagnostics for the debug overlay. */
  stats(): { entities: number; components: Record<string, number> } {
    const components: Record<string, number> = {};
    for (const [name, store] of this.stores) components[name] = store.size;
    return { entities: this.allocator.count, components };
  }
}
