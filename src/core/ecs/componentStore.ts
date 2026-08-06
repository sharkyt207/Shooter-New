/**
 * Typed component storage.
 *
 * A Map keyed by EntityId. With our entity budget (<= 300, see architecture
 * doc) this is more than fast enough, and it buys two things that matter more
 * than raw speed: trivial serialisation and completely predictable iteration
 * order (Map preserves insertion order), which our determinism contract needs.
 */

import type { EntityId } from './entity';

export class ComponentStore<T> {
  private readonly data = new Map<EntityId, T>();

  constructor(public readonly name: string) {}

  get size(): number {
    return this.data.size;
  }

  set(entity: EntityId, component: T): T {
    this.data.set(entity, component);
    return component;
  }

  get(entity: EntityId): T | undefined {
    return this.data.get(entity);
  }

  /**
   * Get a component that the caller knows must exist.
   * Throws instead of returning undefined, so a logic error surfaces at the
   * source rather than as a mysterious NaN three systems later.
   */
  require(entity: EntityId): T {
    const value = this.data.get(entity);
    if (value === undefined) {
      throw new Error(`ComponentStore("${this.name}"): entity ${entity} has no component`);
    }
    return value;
  }

  has(entity: EntityId): boolean {
    return this.data.has(entity);
  }

  remove(entity: EntityId): boolean {
    return this.data.delete(entity);
  }

  clear(): void {
    this.data.clear();
  }

  /** Iterate entity/component pairs in stable insertion order. */
  entries(): IterableIterator<[EntityId, T]> {
    return this.data.entries();
  }

  keys(): IterableIterator<EntityId> {
    return this.data.keys();
  }

  values(): IterableIterator<T> {
    return this.data.values();
  }

  /**
   * Snapshot of the current keys.
   *
   * Use this whenever the loop body may add or remove entities - iterating a
   * live Map while mutating it is the classic source of subtle simulation bugs.
   */
  keyArray(out: EntityId[] = []): EntityId[] {
    out.length = 0;
    for (const key of this.data.keys()) out.push(key);
    return out;
  }

  forEach(callback: (component: T, entity: EntityId) => void): void {
    for (const [entity, component] of this.data) callback(component, entity);
  }

  toJSON(): Array<[EntityId, T]> {
    return [...this.data.entries()];
  }

  loadJSON(entries: Array<[EntityId, T]>): void {
    this.data.clear();
    for (const [entity, component] of entries) this.data.set(entity, component);
  }
}
