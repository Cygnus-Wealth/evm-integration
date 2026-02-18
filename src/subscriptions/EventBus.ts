/**
 * EventBus for subscription domain events
 *
 * Transport-agnostic event emitter. Both WebSocket and polling paths
 * emit the same events through this bus so consumers are decoupled
 * from the underlying transport.
 *
 * @module subscriptions/EventBus
 */

import {
  SubscriptionEvent,
  SubscriptionEventType,
  EventListener,
} from './types.js';

export class EventBus {
  private listeners = new Map<SubscriptionEventType, Set<EventListener>>();
  private allListeners = new Set<EventListener>();

  on(type: SubscriptionEventType, listener: EventListener): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  onAll(listener: EventListener): () => void {
    this.allListeners.add(listener);
    return () => this.allListeners.delete(listener);
  }

  emit<T>(type: SubscriptionEventType, chainId: number, data: T): void {
    const event: SubscriptionEvent<T> = {
      type,
      chainId,
      timestamp: new Date(),
      data,
    };

    const listeners = this.listeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event as SubscriptionEvent);
        } catch {
          // Swallow listener errors to avoid breaking event propagation
        }
      }
    }

    for (const listener of this.allListeners) {
      try {
        listener(event as SubscriptionEvent);
      } catch {
        // Swallow listener errors
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
    this.allListeners.clear();
  }
}
