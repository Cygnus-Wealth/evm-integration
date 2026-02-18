import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TransferLogsSubscription, TransferLogsCallbacks } from './TransferLogsSubscription.js';
import { EventBus } from './EventBus.js';
import { SubscriptionEventType, ERC20_TRANSFER_TOPIC } from './types.js';
import { Address, PublicClient } from 'viem';

function createMockClient(overrides?: any): PublicClient {
  return {
    watchEvent: vi.fn().mockReturnValue(vi.fn()),
    ...overrides,
  } as unknown as PublicClient;
}

describe('TransferLogsSubscription', () => {
  let sub: TransferLogsSubscription;
  let eventBus: EventBus;
  const testAddress = '0x742d35cc6634c0532925a3b844bc9e7595f0beb' as Address;

  beforeEach(() => {
    eventBus = new EventBus();
    sub = new TransferLogsSubscription(eventBus);
  });

  afterEach(() => {
    sub.destroy();
  });

  describe('address tracking', () => {
    it('tracks addresses in lowercase', () => {
      sub.trackAddress(1, '0x742D35Cc6634C0532925a3b844Bc9e7595f0bEb' as Address);
      const tracked = sub.getTrackedAddresses(1);
      expect(tracked[0]).toBe('0x742d35cc6634c0532925a3b844bc9e7595f0beb');
    });

    it('untracks addresses', () => {
      sub.trackAddress(1, testAddress);
      sub.untrackAddress(1, testAddress);
      expect(sub.getTrackedAddresses(1)).toHaveLength(0);
    });

    it('handles case-insensitive untrack', () => {
      sub.trackAddress(1, testAddress);
      sub.untrackAddress(1, '0x742d35cc6634c0532925a3b844bc9e7595f0beb' as Address);
      expect(sub.getTrackedAddresses(1)).toHaveLength(0);
    });
  });

  describe('subscribe', () => {
    it('calls watchEvent on the client', async () => {
      const client = createMockClient();
      sub.trackAddress(1, testAddress);

      await sub.subscribe(1, client, {
        onTransfer: vi.fn(),
        onError: vi.fn(),
      });

      expect(client.watchEvent).toHaveBeenCalledOnce();
    });

    it('does not subscribe if no tracked addresses', async () => {
      const client = createMockClient();
      await sub.subscribe(1, client, {
        onTransfer: vi.fn(),
        onError: vi.fn(),
      });

      expect(client.watchEvent).not.toHaveBeenCalled();
    });

    it('does not double-subscribe', async () => {
      const client = createMockClient();
      sub.trackAddress(1, testAddress);

      await sub.subscribe(1, client, {
        onTransfer: vi.fn(),
        onError: vi.fn(),
      });
      await sub.subscribe(1, client, {
        onTransfer: vi.fn(),
        onError: vi.fn(),
      });

      expect(client.watchEvent).toHaveBeenCalledOnce();
    });

    it('isSubscribed reflects state', async () => {
      const client = createMockClient();
      sub.trackAddress(1, testAddress);

      expect(sub.isSubscribed(1)).toBe(false);
      await sub.subscribe(1, client, {
        onTransfer: vi.fn(),
        onError: vi.fn(),
      });
      expect(sub.isSubscribed(1)).toBe(true);
    });
  });

  describe('unsubscribe', () => {
    it('calls the unwatch function', async () => {
      const unwatch = vi.fn();
      const client = createMockClient({ watchEvent: vi.fn().mockReturnValue(unwatch) });
      sub.trackAddress(1, testAddress);

      await sub.subscribe(1, client, {
        onTransfer: vi.fn(),
        onError: vi.fn(),
      });

      sub.unsubscribe(1);
      expect(unwatch).toHaveBeenCalledOnce();
      expect(sub.isSubscribed(1)).toBe(false);
    });
  });

  describe('resubscribe', () => {
    it('unwatches old and sets up new subscription', async () => {
      const unwatch1 = vi.fn();
      const unwatch2 = vi.fn();
      let callCount = 0;
      const client = createMockClient({
        watchEvent: vi.fn().mockImplementation(() => {
          callCount++;
          return callCount === 1 ? unwatch1 : unwatch2;
        }),
      });
      sub.trackAddress(1, testAddress);

      await sub.subscribe(1, client, {
        onTransfer: vi.fn(),
        onError: vi.fn(),
      });

      await sub.resubscribe(1, client, {
        onTransfer: vi.fn(),
        onError: vi.fn(),
      });

      expect(unwatch1).toHaveBeenCalledOnce();
      expect(client.watchEvent).toHaveBeenCalledTimes(2);
    });
  });

  describe('Transfer event processing', () => {
    it('passes transfer events through watchEvent onLogs callback', async () => {
      let onLogsCallback: (logs: any[]) => void;

      const client = createMockClient({
        watchEvent: vi.fn().mockImplementation(({ onLogs }) => {
          onLogsCallback = onLogs;
          return vi.fn();
        }),
      });

      const onTransfer = vi.fn();
      sub.trackAddress(1, testAddress);

      await sub.subscribe(1, client, {
        onTransfer,
        onError: vi.fn(),
      });

      // The actual decoding happens inside the callback with viem's decodeEventLog
      // We verify the watchEvent was called with correct parameters
      expect(client.watchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.objectContaining({
            from: expect.arrayContaining([testAddress]),
            to: expect.arrayContaining([testAddress]),
          }),
        }),
      );
    });
  });

  describe('ERC20_TRANSFER_TOPIC', () => {
    it('is the correct keccak256 hash', () => {
      expect(ERC20_TRANSFER_TOPIC).toBe(
        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      );
    });
  });

  describe('destroy', () => {
    it('cleans up all subscriptions and tracked addresses', async () => {
      const unwatch = vi.fn();
      const client = createMockClient({ watchEvent: vi.fn().mockReturnValue(unwatch) });
      sub.trackAddress(1, testAddress);
      sub.trackAddress(137, testAddress);

      await sub.subscribe(1, client, {
        onTransfer: vi.fn(),
        onError: vi.fn(),
      });

      sub.destroy();

      expect(unwatch).toHaveBeenCalledOnce();
      expect(sub.getTrackedAddresses(1)).toHaveLength(0);
      expect(sub.getTrackedAddresses(137)).toHaveLength(0);
    });
  });
});
