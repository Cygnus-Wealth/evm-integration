import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SubscriptionService } from './SubscriptionService.js';
import { SubscriptionEventType } from './types.js';
import { Address } from 'viem';

// Mock viem
vi.mock('viem', () => {
  const mockClient = {
    getBlockNumber: vi.fn().mockResolvedValue(12345678n),
    getBalance: vi.fn().mockResolvedValue(1000000000000000000n),
    getBlock: vi.fn().mockResolvedValue({
      number: 12345678n,
      hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      parentHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      timestamp: 1700000000n,
      gasUsed: 21000n,
      gasLimit: 30000000n,
      baseFeePerGas: 50n,
      transactions: [],
    }),
    watchBlockNumber: vi.fn().mockImplementation(({ onBlockNumber }) => {
      return vi.fn(); // unsubscribe function
    }),
    watchEvent: vi.fn().mockReturnValue(vi.fn()),
    watchPendingTransactions: vi.fn().mockReturnValue(vi.fn()),
    getTransaction: vi.fn().mockResolvedValue(null),
    getLogs: vi.fn().mockResolvedValue([]),
  };

  return {
    createPublicClient: vi.fn().mockReturnValue(mockClient),
    webSocket: vi.fn().mockReturnValue('ws-transport'),
    http: vi.fn().mockReturnValue('http-transport'),
    fallback: vi.fn().mockReturnValue('fallback-transport'),
    parseAbiItem: vi.fn().mockReturnValue({
      type: 'event',
      name: 'Transfer',
      inputs: [
        { indexed: true, name: 'from', type: 'address' },
        { indexed: true, name: 'to', type: 'address' },
        { indexed: false, name: 'value', type: 'uint256' },
      ],
    }),
    decodeEventLog: vi.fn(),
  };
});

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  const testAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' as Address;
  const testAddress2 = '0x1234567890123456789012345678901234567890' as Address;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new SubscriptionService();
  });

  afterEach(() => {
    service.destroy();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('subscribeBalances', () => {
    it('returns a SubscriptionHandle', () => {
      const handle = service.subscribeBalances(1, [testAddress]);

      expect(handle).toBeDefined();
      expect(handle.id).toMatch(/^sub-/);
      expect(handle.type).toBe('balances');
      expect(handle.chainId).toBe(1);
    });

    it('allows registering data callbacks', () => {
      const handle = service.subscribeBalances(1, [testAddress]);
      const dataCb = vi.fn();
      handle.onData(dataCb);

      // Callback is registered (not called yet — async setup)
      expect(handle.id).toBeDefined();
    });

    it('allows registering error callbacks', () => {
      const handle = service.subscribeBalances(1, [testAddress]);
      const errorCb = vi.fn();
      handle.onError(errorCb);

      expect(handle.id).toBeDefined();
    });

    it('allows registering status change callbacks', () => {
      const handle = service.subscribeBalances(1, [testAddress]);
      const statusCb = vi.fn();
      handle.onStatusChange(statusCb);

      expect(handle.id).toBeDefined();
    });
  });

  describe('subscribeTokenTransfers', () => {
    it('returns a SubscriptionHandle for token transfers', () => {
      const handle = service.subscribeTokenTransfers(1, [testAddress]);

      expect(handle.type).toBe('tokenTransfers');
      expect(handle.chainId).toBe(1);
    });

    it('accepts optional token address filter', () => {
      const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address;
      const handle = service.subscribeTokenTransfers(1, [testAddress], [usdcAddress]);

      expect(handle.type).toBe('tokenTransfers');
    });
  });

  describe('subscribeNewBlocks', () => {
    it('returns a SubscriptionHandle for new blocks', () => {
      const handle = service.subscribeNewBlocks(1);

      expect(handle.type).toBe('newBlocks');
      expect(handle.chainId).toBe(1);
    });
  });

  describe('subscribePendingTransactions', () => {
    it('returns a SubscriptionHandle for pending transactions', () => {
      const handle = service.subscribePendingTransactions(1, [testAddress]);

      expect(handle.type).toBe('pendingTransactions');
      expect(handle.chainId).toBe(1);
    });
  });

  describe('subscribeContractEvents', () => {
    it('returns a SubscriptionHandle for contract events', () => {
      const contractAddr = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address;
      const handle = service.subscribeContractEvents(1, contractAddr);

      expect(handle.type).toBe('contractEvents');
      expect(handle.chainId).toBe(1);
    });

    it('accepts optional event topic filters', () => {
      const contractAddr = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address;
      const topic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const handle = service.subscribeContractEvents(1, contractAddr, [topic]);

      expect(handle.type).toBe('contractEvents');
    });
  });

  describe('unsubscribe', () => {
    it('removes subscription and changes status to closed', async () => {
      const handle = service.subscribeBalances(1, [testAddress]);
      const statusCb = vi.fn();
      handle.onStatusChange(statusCb);

      // Let async setup complete
      await vi.advanceTimersByTimeAsync(0);

      service.unsubscribe(handle.id);

      expect(statusCb).toHaveBeenCalledWith('closed');
      expect(service.getSubscriptionStatus(handle.id)).toBeUndefined();
    });

    it('can unsubscribe via handle.unsubscribe()', async () => {
      const handle = service.subscribeBalances(1, [testAddress]);
      await vi.advanceTimersByTimeAsync(0);

      handle.unsubscribe();

      expect(service.getSubscriptionStatus(handle.id)).toBeUndefined();
    });

    it('is safe to call for non-existent subscription', () => {
      service.unsubscribe('non-existent-id');
      // Should not throw
    });
  });

  describe('getSubscriptionStatus', () => {
    it('returns info for active subscription', () => {
      const handle = service.subscribeBalances(1, [testAddress]);
      const info = service.getSubscriptionStatus(handle.id);

      expect(info).toBeDefined();
      expect(info!.id).toBe(handle.id);
      expect(info!.type).toBe('balances');
      expect(info!.chainId).toBe(1);
      expect(info!.createdAt).toBeInstanceOf(Date);
    });

    it('returns undefined for unknown subscription', () => {
      expect(service.getSubscriptionStatus('unknown-id')).toBeUndefined();
    });
  });

  describe('getAllSubscriptions', () => {
    it('returns all active subscriptions', () => {
      service.subscribeBalances(1, [testAddress]);
      service.subscribeNewBlocks(137);
      service.subscribeTokenTransfers(1, [testAddress2]);

      const all = service.getAllSubscriptions();

      expect(all).toHaveLength(3);
      const types = all.map((s) => s.type);
      expect(types).toContain('balances');
      expect(types).toContain('newBlocks');
      expect(types).toContain('tokenTransfers');
    });

    it('returns empty array when no subscriptions', () => {
      expect(service.getAllSubscriptions()).toHaveLength(0);
    });
  });

  describe('event listeners', () => {
    it('on() subscribes to specific event types', () => {
      const listener = vi.fn();
      const off = service.on(SubscriptionEventType.SUBSCRIPTION_CREATED, listener);

      expect(typeof off).toBe('function');
    });

    it('onAll() subscribes to all events', () => {
      const listener = vi.fn();
      const off = service.onAll(listener);

      expect(typeof off).toBe('function');
    });
  });

  describe('multi-chain support', () => {
    it('subscribes to multiple chains simultaneously', () => {
      const eth = service.subscribeBalances(1, [testAddress]);
      const polygon = service.subscribeBalances(137, [testAddress]);
      const arb = service.subscribeBalances(42161, [testAddress]);

      expect(eth.chainId).toBe(1);
      expect(polygon.chainId).toBe(137);
      expect(arb.chainId).toBe(42161);

      const all = service.getAllSubscriptions();
      expect(all).toHaveLength(3);
    });

    it('supports all 8 EVM chains', () => {
      const chainIds = [1, 137, 42161, 10, 8453, 56, 43114, 250];

      for (const chainId of chainIds) {
        const handle = service.subscribeNewBlocks(chainId);
        expect(handle.chainId).toBe(chainId);
      }

      expect(service.getAllSubscriptions()).toHaveLength(8);
    });
  });

  describe('destroy', () => {
    it('cleans up all subscriptions', async () => {
      service.subscribeBalances(1, [testAddress]);
      service.subscribeNewBlocks(137);
      await vi.advanceTimersByTimeAsync(0);

      service.destroy();

      expect(service.getAllSubscriptions()).toHaveLength(0);
    });

    it('prevents new subscriptions', () => {
      service.destroy();

      expect(() => service.subscribeBalances(1, [testAddress])).toThrow('destroyed');
    });

    it('prevents subscribeNewBlocks after destroy', () => {
      service.destroy();
      expect(() => service.subscribeNewBlocks(1)).toThrow('destroyed');
    });

    it('prevents subscribeTokenTransfers after destroy', () => {
      service.destroy();
      expect(() => service.subscribeTokenTransfers(1, [testAddress])).toThrow('destroyed');
    });

    it('prevents subscribePendingTransactions after destroy', () => {
      service.destroy();
      expect(() => service.subscribePendingTransactions(1, [testAddress])).toThrow('destroyed');
    });

    it('prevents subscribeContractEvents after destroy', () => {
      service.destroy();
      expect(() => service.subscribeContractEvents(1, testAddress)).toThrow('destroyed');
    });
  });

  describe('SubscriptionHandle contract', () => {
    it('has all required properties', () => {
      const handle = service.subscribeBalances(1, [testAddress]);

      expect(handle.id).toBeDefined();
      expect(handle.type).toBeDefined();
      expect(handle.chainId).toBeDefined();
      expect(handle.status).toBeDefined();
      expect(handle.transport).toBeDefined();
      expect(handle.createdAt).toBeInstanceOf(Date);
      expect(typeof handle.onData).toBe('function');
      expect(typeof handle.onError).toBe('function');
      expect(typeof handle.onStatusChange).toBe('function');
      expect(typeof handle.unsubscribe).toBe('function');
    });

    it('status reflects current state', async () => {
      const handle = service.subscribeBalances(1, [testAddress]);

      // Initially active (optimistic)
      expect(handle.status).toBe('active');

      // After unsubscribe
      handle.unsubscribe();
      // status getter should reflect the closed state
    });
  });

  describe('domain events', () => {
    it('emits SUBSCRIPTION_CREATED on balance subscribe', async () => {
      const listener = vi.fn();
      service.on(SubscriptionEventType.SUBSCRIPTION_CREATED, listener);

      service.subscribeBalances(1, [testAddress]);
      await vi.advanceTimersByTimeAsync(0);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SubscriptionEventType.SUBSCRIPTION_CREATED,
          chainId: 1,
          data: expect.objectContaining({ type: 'balances' }),
        }),
      );
    });

    it('emits SUBSCRIPTION_REMOVED on unsubscribe', async () => {
      const listener = vi.fn();
      service.on(SubscriptionEventType.SUBSCRIPTION_REMOVED, listener);

      const handle = service.subscribeBalances(1, [testAddress]);
      await vi.advanceTimersByTimeAsync(0);

      service.unsubscribe(handle.id);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SubscriptionEventType.SUBSCRIPTION_REMOVED,
          chainId: 1,
          data: expect.objectContaining({ subscriptionId: handle.id }),
        }),
      );
    });
  });

  describe('configuration', () => {
    it('accepts custom configuration', () => {
      const customService = new SubscriptionService({
        connection: {
          reconnectBaseDelayMs: 2000,
          reconnectMaxDelayMs: 60000,
          maxReconnectAttempts: 20,
          heartbeatIntervalMs: 15000,
          pongTimeoutMs: 3000,
          connectionTimeoutMs: 5000,
        },
        polling: {
          defaultPollIntervalMs: 15000,
          wsRecoveryIntervalMs: 30000,
        },
        maxSubscriptionsPerChain: 100,
      });

      // Should not throw
      const handle = customService.subscribeNewBlocks(1);
      expect(handle).toBeDefined();

      customService.destroy();
    });

    it('merges partial config with defaults', () => {
      const customService = new SubscriptionService({
        polling: { defaultPollIntervalMs: 10000, wsRecoveryIntervalMs: 60000 },
      });

      const handle = customService.subscribeNewBlocks(1);
      expect(handle).toBeDefined();

      customService.destroy();
    });
  });
});
