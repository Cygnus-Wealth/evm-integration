import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PollManager, PollCallbacks } from './PollManager.js';
import { EventBus } from './EventBus.js';
import { WebSocketConnectionManager } from './WebSocketConnectionManager.js';
import { SubscriptionEventType } from './types.js';
import { Address, PublicClient } from 'viem';

// Mock viem
vi.mock('viem', () => ({
  createPublicClient: vi.fn(),
  webSocket: vi.fn(),
  http: vi.fn(),
  fallback: vi.fn(),
  parseAbiItem: vi.fn().mockReturnValue({
    type: 'event',
    name: 'Transfer',
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'value', type: 'uint256' },
    ],
  }),
  decodeEventLog: vi.fn().mockReturnValue({
    args: {
      from: '0x742d35cc6634c0532925a3b844bc9e7595f0beb',
      to: '0x1234567890123456789012345678901234567890',
      value: 1000000n,
    },
  }),
}));

function createMockClient(overrides?: any): PublicClient {
  return {
    getBlockNumber: vi.fn().mockResolvedValue(100n),
    getBalance: vi.fn().mockResolvedValue(1000000000000000000n),
    getBlock: vi.fn().mockResolvedValue({
      number: 100n,
      hash: '0xabc',
      parentHash: '0xdef',
      timestamp: 1700000000n,
      gasUsed: 21000n,
      gasLimit: 30000000n,
      baseFeePerGas: 50n,
      transactions: [],
    }),
    getLogs: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as PublicClient;
}

describe('PollManager', () => {
  let pollManager: PollManager;
  let eventBus: EventBus;
  let connManager: WebSocketConnectionManager;
  const testAddress = '0x742d35cc6634c0532925a3b844bc9e7595f0beb' as Address;

  beforeEach(() => {
    vi.useFakeTimers();
    eventBus = new EventBus();
    connManager = new WebSocketConnectionManager(eventBus);
    pollManager = new PollManager(eventBus, connManager, {
      defaultPollIntervalMs: 5000,
      wsRecoveryIntervalMs: 10000,
    });
  });

  afterEach(() => {
    pollManager.destroy();
    connManager.destroy();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('startPolling', () => {
    it('starts polling for a chain', () => {
      const client = createMockClient();
      const callbacks: PollCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onTransfer: vi.fn(),
        onError: vi.fn(),
        onWsRecovered: vi.fn(),
      };

      pollManager.startPolling(1, client, [testAddress], callbacks);

      expect(pollManager.isPolling(1)).toBe(true);
    });

    it('does not double-poll', () => {
      const client = createMockClient();
      const callbacks: PollCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onTransfer: vi.fn(),
        onError: vi.fn(),
        onWsRecovered: vi.fn(),
      };

      pollManager.startPolling(1, client, [testAddress], callbacks);
      pollManager.startPolling(1, client, [testAddress], callbacks);

      expect(pollManager.isPolling(1)).toBe(true);
    });

    it('performs immediate first poll', async () => {
      const client = createMockClient();
      const callbacks: PollCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onTransfer: vi.fn(),
        onError: vi.fn(),
        onWsRecovered: vi.fn(),
      };

      pollManager.startPolling(1, client, [testAddress], callbacks);

      // Let the immediate poll resolve
      await vi.advanceTimersByTimeAsync(0);

      // First poll sets lastBlockNumber; balance fetch happens
      expect(client.getBlockNumber).toHaveBeenCalled();
      expect(client.getBalance).toHaveBeenCalled();
    });
  });

  describe('polling cycle', () => {
    it('fetches new blocks and balances on each poll interval', async () => {
      let blockNum = 100n;
      const client = createMockClient({
        getBlockNumber: vi.fn().mockImplementation(() => Promise.resolve(blockNum)),
        getBlock: vi.fn().mockResolvedValue({
          number: 101n,
          hash: '0xnew',
          parentHash: '0xold',
          timestamp: 1700000001n,
          gasUsed: 42000n,
          gasLimit: 30000000n,
          baseFeePerGas: 55n,
          transactions: ['0xtx1'],
        }),
      });

      const callbacks: PollCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onTransfer: vi.fn(),
        onError: vi.fn(),
        onWsRecovered: vi.fn(),
      };

      pollManager.startPolling(1, client, [testAddress], callbacks);

      // First poll: initializes lastBlockNumber
      await vi.advanceTimersByTimeAsync(0);

      // Simulate new block
      blockNum = 101n;

      // Second poll: detects new block
      await vi.advanceTimersByTimeAsync(5000);

      expect(callbacks.onBlock).toHaveBeenCalled();
      expect(callbacks.onBalanceUpdate).toHaveBeenCalled();
    });

    it('emits LIVE_BALANCE_UPDATED events via EventBus', async () => {
      const balanceListener = vi.fn();
      eventBus.on(SubscriptionEventType.LIVE_BALANCE_UPDATED, balanceListener);

      const client = createMockClient();
      const callbacks: PollCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onTransfer: vi.fn(),
        onError: vi.fn(),
        onWsRecovered: vi.fn(),
      };

      pollManager.startPolling(1, client, [testAddress], callbacks);
      await vi.advanceTimersByTimeAsync(0);

      expect(balanceListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SubscriptionEventType.LIVE_BALANCE_UPDATED,
          chainId: 1,
        }),
      );
    });

    it('handles errors gracefully', async () => {
      const client = createMockClient({
        getBlockNumber: vi.fn().mockRejectedValue(new Error('network error')),
      });

      const callbacks: PollCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onTransfer: vi.fn(),
        onError: vi.fn(),
        onWsRecovered: vi.fn(),
      };

      pollManager.startPolling(1, client, [testAddress], callbacks);
      await vi.advanceTimersByTimeAsync(0);

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'network error' }),
      );
    });

    it('does not process when block has not advanced', async () => {
      const client = createMockClient({
        getBlockNumber: vi.fn().mockResolvedValue(100n),
      });

      const callbacks: PollCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onTransfer: vi.fn(),
        onError: vi.fn(),
        onWsRecovered: vi.fn(),
      };

      pollManager.startPolling(1, client, [testAddress], callbacks);

      // First poll
      await vi.advanceTimersByTimeAsync(0);
      // Reset mock counts
      callbacks.onBlock.mockClear?.();
      (client.getBlock as ReturnType<typeof vi.fn>).mockClear?.();

      // Second poll — same block number
      await vi.advanceTimersByTimeAsync(5000);

      expect(callbacks.onBlock).not.toHaveBeenCalled();
    });
  });

  describe('address management', () => {
    it('adds tracked addresses to active poll', () => {
      const client = createMockClient();
      const callbacks: PollCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onTransfer: vi.fn(),
        onError: vi.fn(),
        onWsRecovered: vi.fn(),
      };

      pollManager.startPolling(1, client, [testAddress], callbacks);
      const newAddr = '0x1234567890123456789012345678901234567890' as Address;
      pollManager.addTrackedAddress(1, newAddr);

      // No error means success
      expect(pollManager.isPolling(1)).toBe(true);
    });

    it('removes tracked addresses from active poll', () => {
      const client = createMockClient();
      const callbacks: PollCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onTransfer: vi.fn(),
        onError: vi.fn(),
        onWsRecovered: vi.fn(),
      };

      pollManager.startPolling(1, client, [testAddress], callbacks);
      pollManager.removeTrackedAddress(1, testAddress);

      expect(pollManager.isPolling(1)).toBe(true);
    });
  });

  describe('stopPolling', () => {
    it('stops polling for a chain', () => {
      const client = createMockClient();
      const callbacks: PollCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onTransfer: vi.fn(),
        onError: vi.fn(),
        onWsRecovered: vi.fn(),
      };

      pollManager.startPolling(1, client, [testAddress], callbacks);
      pollManager.stopPolling(1);

      expect(pollManager.isPolling(1)).toBe(false);
    });

    it('is safe to call for non-polling chain', () => {
      pollManager.stopPolling(999);
      expect(pollManager.isPolling(999)).toBe(false);
    });
  });

  describe('WS recovery', () => {
    it('attempts WS recovery at configured interval', async () => {
      const client = createMockClient();
      const callbacks: PollCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onTransfer: vi.fn(),
        onError: vi.fn(),
        onWsRecovered: vi.fn(),
      };

      // The connectionManager.connect will be called during recovery
      vi.spyOn(connManager, 'connect').mockRejectedValue(new Error('still down'));

      pollManager.startPolling(1, client, [testAddress], callbacks);

      // Advance past recovery interval
      await vi.advanceTimersByTimeAsync(10000);

      expect(connManager.connect).toHaveBeenCalledWith(1);
    });
  });

  describe('destroy', () => {
    it('clears all polls', () => {
      const client = createMockClient();
      const callbacks: PollCallbacks = {
        onBlock: vi.fn(),
        onBalanceUpdate: vi.fn(),
        onTransfer: vi.fn(),
        onError: vi.fn(),
        onWsRecovered: vi.fn(),
      };

      pollManager.startPolling(1, client, [testAddress], callbacks);
      pollManager.startPolling(137, client, [testAddress], callbacks);

      pollManager.destroy();

      expect(pollManager.isPolling(1)).toBe(false);
      expect(pollManager.isPolling(137)).toBe(false);
    });
  });
});
