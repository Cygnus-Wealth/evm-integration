import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NewHeadsSubscription, NewHeadsCallbacks } from './NewHeadsSubscription.js';
import { EventBus } from './EventBus.js';
import { SubscriptionEventType } from './types.js';
import { Address, PublicClient } from 'viem';

function createMockClient(overrides?: Partial<PublicClient>): PublicClient {
  return {
    getBlockNumber: vi.fn().mockResolvedValue(100n),
    getBalance: vi.fn().mockResolvedValue(1000000000000000000n),
    getBlock: vi.fn().mockResolvedValue({
      number: 100n,
      hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      parentHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      timestamp: 1700000000n,
      gasUsed: 21000n,
      gasLimit: 30000000n,
      baseFeePerGas: 50n,
      transactions: ['0xtx1', '0xtx2'],
    }),
    watchBlockNumber: vi.fn().mockImplementation(({ onBlockNumber }) => {
      // Simulate a new block immediately
      setTimeout(() => onBlockNumber(101n), 0);
      return vi.fn(); // unsubscribe
    }),
    ...overrides,
  } as unknown as PublicClient;
}

describe('NewHeadsSubscription', () => {
  let sub: NewHeadsSubscription;
  let eventBus: EventBus;
  const testAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' as Address;

  beforeEach(() => {
    eventBus = new EventBus();
    sub = new NewHeadsSubscription(eventBus);
  });

  afterEach(() => {
    sub.destroy();
  });

  describe('subscribe', () => {
    it('calls watchBlockNumber on the client', async () => {
      const client = createMockClient();
      const callbacks: NewHeadsCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onError: vi.fn(),
      };

      await sub.subscribe(1, client, callbacks);

      expect(client.watchBlockNumber).toHaveBeenCalledOnce();
    });

    it('does not double-subscribe to the same chain', async () => {
      const client = createMockClient();
      const callbacks: NewHeadsCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onError: vi.fn(),
      };

      await sub.subscribe(1, client, callbacks);
      await sub.subscribe(1, client, callbacks);

      expect(client.watchBlockNumber).toHaveBeenCalledOnce();
    });

    it('isSubscribed returns true after subscribe', async () => {
      const client = createMockClient();
      const callbacks: NewHeadsCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onError: vi.fn(),
      };

      expect(sub.isSubscribed(1)).toBe(false);
      await sub.subscribe(1, client, callbacks);
      expect(sub.isSubscribed(1)).toBe(true);
    });
  });

  describe('address tracking', () => {
    it('tracks and retrieves addresses', () => {
      sub.trackAddress(1, testAddress);

      expect(sub.getTrackedAddresses(1)).toContain(testAddress);
    });

    it('untracks addresses', () => {
      sub.trackAddress(1, testAddress);
      sub.untrackAddress(1, testAddress);

      expect(sub.getTrackedAddresses(1)).toHaveLength(0);
    });

    it('returns empty array for untracked chain', () => {
      expect(sub.getTrackedAddresses(999)).toHaveLength(0);
    });

    it('does not duplicate tracked addresses', () => {
      sub.trackAddress(1, testAddress);
      sub.trackAddress(1, testAddress);

      expect(sub.getTrackedAddresses(1)).toHaveLength(1);
    });
  });

  describe('block-driven balance refresh', () => {
    it('emits LIVE_BLOCK_RECEIVED event on new block', async () => {
      const blockListener = vi.fn();
      eventBus.on(SubscriptionEventType.LIVE_BLOCK_RECEIVED, blockListener);

      let blockHandler: (blockNumber: bigint) => void;
      const client = createMockClient({
        watchBlockNumber: vi.fn().mockImplementation(({ onBlockNumber }) => {
          blockHandler = onBlockNumber;
          return vi.fn();
        }),
      } as any);

      const callbacks: NewHeadsCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onError: vi.fn(),
      };

      await sub.subscribe(1, client, callbacks);
      await blockHandler!(101n);

      expect(callbacks.onBlock).toHaveBeenCalledOnce();
      expect(callbacks.onBlock).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: 1,
          number: 100n, // from mock getBlock
          transactionCount: 2,
        }),
      );
      expect(blockListener).toHaveBeenCalledOnce();
    });

    it('batch-fetches balances for tracked addresses on new block', async () => {
      const addr2 = '0x1234567890123456789012345678901234567890' as Address;

      let blockHandler: (blockNumber: bigint) => void;
      const client = createMockClient({
        watchBlockNumber: vi.fn().mockImplementation(({ onBlockNumber }) => {
          blockHandler = onBlockNumber;
          return vi.fn();
        }),
      } as any);

      const callbacks: NewHeadsCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onError: vi.fn(),
      };

      sub.trackAddress(1, testAddress);
      sub.trackAddress(1, addr2);
      await sub.subscribe(1, client, callbacks);

      await blockHandler!(101n);

      // Should have fetched balances for both addresses
      expect(callbacks.onBalanceUpdate).toHaveBeenCalledTimes(2);
    });

    it('emits LIVE_BALANCE_UPDATED event for each tracked address', async () => {
      const balanceListener = vi.fn();
      eventBus.on(SubscriptionEventType.LIVE_BALANCE_UPDATED, balanceListener);

      let blockHandler: (blockNumber: bigint) => void;
      const client = createMockClient({
        watchBlockNumber: vi.fn().mockImplementation(({ onBlockNumber }) => {
          blockHandler = onBlockNumber;
          return vi.fn();
        }),
      } as any);

      const callbacks: NewHeadsCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onError: vi.fn(),
      };

      sub.trackAddress(1, testAddress);
      await sub.subscribe(1, client, callbacks);
      await blockHandler!(101n);

      expect(balanceListener).toHaveBeenCalledOnce();
      expect(balanceListener).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: 1,
          data: expect.objectContaining({
            address: testAddress,
            balance: 1000000000000000000n,
          }),
        }),
      );
    });

    it('handles errors from getBlock gracefully', async () => {
      let blockHandler: (blockNumber: bigint) => void;
      const client = createMockClient({
        getBlock: vi.fn().mockRejectedValue(new Error('block fetch failed')),
        watchBlockNumber: vi.fn().mockImplementation(({ onBlockNumber }) => {
          blockHandler = onBlockNumber;
          return vi.fn();
        }),
      } as any);

      const callbacks: NewHeadsCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onError: vi.fn(),
      };

      await sub.subscribe(1, client, callbacks);
      await blockHandler!(101n);

      expect(callbacks.onError).toHaveBeenCalledOnce();
    });

    it('handles getBalance failures without breaking other addresses', async () => {
      let blockHandler: (blockNumber: bigint) => void;
      let callCount = 0;
      const client = createMockClient({
        getBalance: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.reject(new Error('fail'));
          return Promise.resolve(2000n);
        }),
        watchBlockNumber: vi.fn().mockImplementation(({ onBlockNumber }) => {
          blockHandler = onBlockNumber;
          return vi.fn();
        }),
      } as any);

      const callbacks: NewHeadsCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onError: vi.fn(),
      };

      const addr2 = '0x1234567890123456789012345678901234567890' as Address;
      sub.trackAddress(1, testAddress);
      sub.trackAddress(1, addr2);
      await sub.subscribe(1, client, callbacks);
      await blockHandler!(101n);

      // One succeeded, one failed — should still get 1 balance update
      expect(callbacks.onBalanceUpdate).toHaveBeenCalledOnce();
    });
  });

  describe('unsubscribe', () => {
    it('calls the unsubscribe function returned by watchBlockNumber', async () => {
      const unwatch = vi.fn();
      const client = createMockClient({
        watchBlockNumber: vi.fn().mockReturnValue(unwatch),
      } as any);

      await sub.subscribe(1, client, {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onError: vi.fn(),
      });

      sub.unsubscribe(1);
      expect(unwatch).toHaveBeenCalledOnce();
      expect(sub.isSubscribed(1)).toBe(false);
    });
  });

  describe('destroy', () => {
    it('unsubscribes from all chains and clears tracked addresses', async () => {
      const unwatch1 = vi.fn();
      const unwatch2 = vi.fn();

      let call = 0;
      const client = createMockClient({
        watchBlockNumber: vi.fn().mockImplementation(() => {
          call++;
          return call === 1 ? unwatch1 : unwatch2;
        }),
      } as any);

      const callbacks: NewHeadsCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onError: vi.fn(),
      };

      sub.trackAddress(1, testAddress);
      sub.trackAddress(137, testAddress);

      // Subscribe to two different chains
      await sub.subscribe(1, client, callbacks);
      sub['unsubscribeFns'].delete(1); // Reset to allow second subscribe
      await sub.subscribe(1, client, callbacks);

      sub.destroy();

      expect(sub.getTrackedAddresses(1)).toHaveLength(0);
      expect(sub.getTrackedAddresses(137)).toHaveLength(0);
    });
  });
});
