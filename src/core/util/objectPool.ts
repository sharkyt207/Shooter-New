/**
 * Generic object pool.
 *
 * Projectiles and particles are created and destroyed constantly. Allocating
 * them per shot would hand the GC a steady stream of garbage, and a GC pause on
 * a phone is a dropped frame the player feels. Pools keep the hot path
 * allocation-free (see the performance budget in docs/01-ARCHITECTURE.md).
 */

export class ObjectPool<T> {
  private readonly available: T[] = [];
  private createdCount = 0;

  constructor(
    private readonly factory: () => T,
    private readonly reset: (item: T) => void,
    initialSize = 0,
    private readonly maxRetained = 1024,
  ) {
    for (let i = 0; i < initialSize; i++) {
      this.available.push(factory());
      this.createdCount++;
    }
  }

  /** Objects handed out and not yet returned. */
  get inUse(): number {
    return this.createdCount - this.available.length;
  }

  get pooled(): number {
    return this.available.length;
  }

  acquire(): T {
    const item = this.available.pop();
    if (item !== undefined) return item;
    this.createdCount++;
    return this.factory();
  }

  release(item: T): void {
    this.reset(item);
    // Beyond the retention cap, let the object go rather than grow forever
    // after a one-off spike.
    if (this.available.length < this.maxRetained) this.available.push(item);
    else this.createdCount--;
  }

  clear(): void {
    this.available.length = 0;
    this.createdCount = 0;
  }
}
