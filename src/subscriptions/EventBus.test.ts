import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from './EventBus.js';
import { SubscriptionEventType } from './types.js';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('delivers events to typed listeners', () => {
    const listener = vi.fn();
    bus.on(SubscriptionEventType.WEBSOCKET_CONNECTED, listener);

    bus.emit(SubscriptionEventType.WEBSOCKET_CONNECTED, 1, { url: 'wss://test' });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SubscriptionEventType.WEBSOCKET_CONNECTED,
        chainId: 1,
        data: { url: 'wss://test' },
      }),
    );
  });

  it('does not deliver events to listeners for different types', () => {
    const listener = vi.fn();
    bus.on(SubscriptionEventType.WEBSOCKET_CONNECTED, listener);

    bus.emit(SubscriptionEventType.WEBSOCKET_DISCONNECTED, 1, {});

    expect(listener).not.toHaveBeenCalled();
  });

  it('onAll receives all events', () => {
    const listener = vi.fn();
    bus.onAll(listener);

    bus.emit(SubscriptionEventType.WEBSOCKET_CONNECTED, 1, {});
    bus.emit(SubscriptionEventType.LIVE_BLOCK_RECEIVED, 137, {});

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe function removes listener', () => {
    const listener = vi.fn();
    const off = bus.on(SubscriptionEventType.LIVE_BALANCE_UPDATED, listener);

    bus.emit(SubscriptionEventType.LIVE_BALANCE_UPDATED, 1, {});
    expect(listener).toHaveBeenCalledOnce();

    off();
    bus.emit(SubscriptionEventType.LIVE_BALANCE_UPDATED, 1, {});
    expect(listener).toHaveBeenCalledOnce(); // Still 1
  });

  it('onAll unsubscribe works', () => {
    const listener = vi.fn();
    const off = bus.onAll(listener);

    bus.emit(SubscriptionEventType.WEBSOCKET_CONNECTED, 1, {});
    off();
    bus.emit(SubscriptionEventType.WEBSOCKET_CONNECTED, 1, {});

    expect(listener).toHaveBeenCalledOnce();
  });

  it('swallows listener errors without breaking other listeners', () => {
    const errorListener = vi.fn(() => { throw new Error('boom'); });
    const goodListener = vi.fn();

    bus.on(SubscriptionEventType.LIVE_BLOCK_RECEIVED, errorListener);
    bus.on(SubscriptionEventType.LIVE_BLOCK_RECEIVED, goodListener);

    bus.emit(SubscriptionEventType.LIVE_BLOCK_RECEIVED, 1, {});

    expect(errorListener).toHaveBeenCalledOnce();
    expect(goodListener).toHaveBeenCalledOnce();
  });

  it('removeAllListeners clears everything', () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    bus.on(SubscriptionEventType.WEBSOCKET_CONNECTED, l1);
    bus.onAll(l2);

    bus.removeAllListeners();

    bus.emit(SubscriptionEventType.WEBSOCKET_CONNECTED, 1, {});
    expect(l1).not.toHaveBeenCalled();
    expect(l2).not.toHaveBeenCalled();
  });

  it('includes timestamp in emitted events', () => {
    const listener = vi.fn();
    bus.on(SubscriptionEventType.LIVE_TRANSFER_DETECTED, listener);

    bus.emit(SubscriptionEventType.LIVE_TRANSFER_DETECTED, 42161, { token: 'USDC' });

    const event = listener.mock.calls[0][0];
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.chainId).toBe(42161);
  });
});
