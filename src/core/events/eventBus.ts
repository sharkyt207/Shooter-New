/**
 * Typed, synchronous event bus.
 *
 * This is the one-way channel from the simulation to the presentation layers
 * (ADR-002). The simulation emits facts - "damage was dealt", "an item was
 * picked up" - and never knows who listens. Sound and VFX live entirely in
 * `render`/`ui`, which keeps `game/**` free of presentation concerns.
 *
 * Synchronous by design: an event fired during a tick is handled within that
 * tick, so ordering stays deterministic.
 */

export type EventMap = Record<string, unknown>;
export type Handler<T> = (payload: T) => void;

interface Subscription<T> {
  handler: Handler<T>;
  once: boolean;
}

export class EventBus<TEvents extends EventMap> {
  private readonly handlers = new Map<keyof TEvents, Subscription<never>[]>();
  /** Guards against mutating a listener list while it is being iterated. */
  private dispatchDepth = 0;
  private pendingRemovals: Array<{ type: keyof TEvents; handler: Handler<never> }> = [];

  on<K extends keyof TEvents>(type: K, handler: Handler<TEvents[K]>): () => void {
    this.addSubscription(type, handler, false);
    return () => this.off(type, handler);
  }

  once<K extends keyof TEvents>(type: K, handler: Handler<TEvents[K]>): () => void {
    this.addSubscription(type, handler, true);
    return () => this.off(type, handler);
  }

  off<K extends keyof TEvents>(type: K, handler: Handler<TEvents[K]>): void {
    if (this.dispatchDepth > 0) {
      this.pendingRemovals.push({ type, handler: handler as Handler<never> });
      return;
    }
    this.removeNow(type, handler as Handler<never>);
  }

  emit<K extends keyof TEvents>(type: K, payload: TEvents[K]): void {
    const list = this.handlers.get(type);
    if (!list || list.length === 0) return;

    this.dispatchDepth++;
    try {
      // Iterate a snapshot: handlers may subscribe or unsubscribe while running.
      for (const sub of list.slice()) {
        (sub.handler as Handler<TEvents[K]>)(payload);
        if (sub.once) this.off(type, sub.handler as Handler<TEvents[K]>);
      }
    } finally {
      this.dispatchDepth--;
      if (this.dispatchDepth === 0 && this.pendingRemovals.length > 0) {
        for (const { type: t, handler: h } of this.pendingRemovals) this.removeNow(t, h);
        this.pendingRemovals.length = 0;
      }
    }
  }

  listenerCount<K extends keyof TEvents>(type: K): number {
    return this.handlers.get(type)?.length ?? 0;
  }

  /** Drop every listener. Called when a raid ends so nothing leaks into the next one. */
  clear(): void {
    this.handlers.clear();
    this.pendingRemovals.length = 0;
  }

  private addSubscription<K extends keyof TEvents>(
    type: K,
    handler: Handler<TEvents[K]>,
    once: boolean,
  ): void {
    let list = this.handlers.get(type);
    if (!list) {
      list = [];
      this.handlers.set(type, list);
    }
    list.push({ handler: handler as Handler<never>, once });
  }

  private removeNow(type: keyof TEvents, handler: Handler<never>): void {
    const list = this.handlers.get(type);
    if (!list) return;
    const index = list.findIndex((sub) => sub.handler === handler);
    if (index >= 0) list.splice(index, 1);
    if (list.length === 0) this.handlers.delete(type);
  }
}
