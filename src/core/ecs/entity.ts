/**
 * Entity identity and allocation.
 *
 * Entities are plain numbers. IDs are recycled through a freelist, and a
 * generation counter packed into the high bits makes stale references
 * detectable: a component store lookup with an outdated ID simply misses
 * rather than silently hitting a recycled entity.
 *
 * Layout: [ generation: 12 bits | index: 20 bits ]  -> ~1M live entities.
 */

export type EntityId = number & { readonly __brand: 'EntityId' };

const INDEX_BITS = 20;
const INDEX_MASK = (1 << INDEX_BITS) - 1;
const GENERATION_MASK = 0xfff;

export const NULL_ENTITY = 0 as EntityId;

export function entityIndex(id: EntityId): number {
  return id & INDEX_MASK;
}

export function entityGeneration(id: EntityId): number {
  return (id >>> INDEX_BITS) & GENERATION_MASK;
}

function makeId(index: number, generation: number): EntityId {
  return (((generation & GENERATION_MASK) << INDEX_BITS) | (index & INDEX_MASK)) as EntityId;
}

export class EntityAllocator {
  /** generations[i] is the current generation of index i. */
  private readonly generations: number[] = [0];
  private readonly freeIndices: number[] = [];
  private aliveCount = 0;

  get count(): number {
    return this.aliveCount;
  }

  create(): EntityId {
    this.aliveCount++;

    const recycled = this.freeIndices.pop();
    if (recycled !== undefined) {
      return makeId(recycled, this.generations[recycled] as number);
    }

    const index = this.generations.length;
    this.generations.push(1);
    return makeId(index, 1);
  }

  isAlive(id: EntityId): boolean {
    const index = entityIndex(id);
    const generation = this.generations[index];
    return generation !== undefined && generation === entityGeneration(id) && generation > 0;
  }

  /** Destroy an entity. Returns false when the ID was already stale. */
  destroy(id: EntityId): boolean {
    if (!this.isAlive(id)) return false;

    const index = entityIndex(id);
    // Bump the generation so every existing reference to this ID goes stale.
    // Wrap back to 1 (never 0 - that marks "never allocated").
    const next = ((this.generations[index] as number) + 1) & GENERATION_MASK;
    this.generations[index] = next === 0 ? 1 : next;
    this.freeIndices.push(index);
    this.aliveCount--;
    return true;
  }

  reset(): void {
    this.generations.length = 1;
    this.freeIndices.length = 0;
    this.aliveCount = 0;
  }
}
