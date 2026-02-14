import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnhancedWebSocketProvider, ConnectionState } from './EnhancedWebSocketProvider';
import { createPublicClient, webSocket, http } from 'viem';
import { mainnet } from 'viem/chains';

// Mock viem
vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(),
    webSocket: vi.fn(),
    http: vi.fn(),
    fallback: vi.fn((transports) => transports[0]),
  };
});

describe('EnhancedWebSocketProvider', () => {
  let provider: EnhancedWebSocketProvider;
  let mockClient: any;

  beforeEach(() => {
    provider = new EnhancedWebSocketProvider({
      preferWebSocket: true,
      connectionTimeout: 1000,
      pollInterval: 5000,
    });

    mockClient = {
      getBlockNumber: vi.fn().mockResolvedValue(BigInt(1000)),
      getBalance: vi.fn().mockResolvedValue(BigInt('1000000000000000000')),
      watchBlockNumber: vi.fn(),
      watchPendingTransactions: vi.fn(),
      getTransaction: vi.fn(),
      getBlock: vi.fn(),
    };

    vi.mocked(createPublicClient).mockReturnValue(mockClient);
  });

  afterEach(async () => {
    await provider.cleanup();
    vi.resetAllMocks();
  });

  describe('WebSocket-first connection', () => {
    it('should try WebSocket connection first when preferWebSocket is true', async () => {
      const wsTransport = vi.fn();
      vi.mocked(webSocket).mockReturnValue(wsTransport);

      const client = await provider.connect(1);

      expect(webSocket).toHaveBeenCalled();
      expect(createPublicClient).toHaveBeenCalledWith({
        chain: mainnet,
        transport: wsTransport,
      });
      expect(provider.getConnectionState(1)).toBe(ConnectionState.CONNECTED_WS);
    });

    it('should fall back to HTTP when WebSocket connection fails', async () => {
      // Mock WebSocket failure for all WS URLs (mainnet has 2 wsUrls)
      mockClient.getBlockNumber
        .mockRejectedValueOnce(new Error('WebSocket connection failed'))
        .mockRejectedValueOnce(new Error('WebSocket connection failed'));

      const httpTransport = vi.fn();
      vi.mocked(http).mockReturnValue(httpTransport);

      const client = await provider.connect(1);

      expect(webSocket).toHaveBeenCalled();
      expect(http).toHaveBeenCalled();
      expect(provider.getConnectionState(1)).toBe(ConnectionState.CONNECTED_HTTP);
    });

    it('should try multiple WebSocket URLs before falling back', async () => {
      // Mainnet has 2 wsUrls — fail all of them to verify both are tried
      mockClient.getBlockNumber
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockRejectedValueOnce(new Error('Connection failed'));

      const client = await provider.connect(1);

      // Should try both WebSocket URLs before falling back to HTTP
      expect(webSocket).toHaveBeenCalledTimes(2);
    });
  });

  describe('Balance subscription', () => {
    it('should use WebSocket subscription when connected via WebSocket', async () => {
      const mockUnsubscribe = vi.fn();
      mockClient.watchBlockNumber.mockResolvedValue(mockUnsubscribe);

      await provider.connect(1);
      const callback = vi.fn();
      
      const unsubscribe = await provider.subscribeToBalance(
        '0x1234567890123456789012345678901234567890',
        1,
        callback
      );

      expect(mockClient.watchBlockNumber).toHaveBeenCalled();
      expect(mockClient.getBalance).not.toHaveBeenCalled(); // Not called immediately

      // Simulate block update
      const onBlockNumber = mockClient.watchBlockNumber.mock.calls[0][0].onBlockNumber;
      await onBlockNumber();

      expect(mockClient.getBalance).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(BigInt('1000000000000000000'));
    });

    it('should use polling when connected via HTTP', async () => {
      // Force HTTP connection (reject both WS URLs for mainnet)
      mockClient.getBlockNumber
        .mockRejectedValueOnce(new Error('WebSocket failed'))
        .mockRejectedValueOnce(new Error('WebSocket failed'));

      await provider.connect(1);
      expect(provider.getConnectionState(1)).toBe(ConnectionState.CONNECTED_HTTP);

      const callback = vi.fn();
      const unsubscribe = await provider.subscribeToBalance(
        '0x1234567890123456789012345678901234567890',
        1,
        callback,
        { pollInterval: 100 } // Fast polling for test
      );

      // Should call getBalance immediately
      expect(mockClient.getBalance).toHaveBeenCalled();
      
      // Wait for polling interval
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should have called getBalance multiple times
      expect(mockClient.getBalance).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledTimes(2);

      unsubscribe();
    });

    it('should fall back to polling if WebSocket subscription fails', async () => {
      mockClient.watchBlockNumber.mockRejectedValue(new Error('Subscription failed'));

      await provider.connect(1);
      const callback = vi.fn();

      const unsubscribe = await provider.subscribeToBalance(
        '0x1234567890123456789012345678901234567890',
        1,
        callback,
        { pollInterval: 100 }
      );

      // Should fall back to polling
      expect(mockClient.getBalance).toHaveBeenCalled();
      
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(callback).toHaveBeenCalled();

      unsubscribe();
    });
  });

  describe('Transaction monitoring', () => {
    const mockTx = {
      hash: '0xabc123',
      from: '0x1234567890123456789012345678901234567890',
      to: '0x0987654321098765432109876543210987654321',
      value: BigInt('500000000000000000'),
    };

    it('should use WebSocket for transaction monitoring when available', async () => {
      const mockUnsubscribe = vi.fn();
      mockClient.watchPendingTransactions.mockResolvedValue(mockUnsubscribe);
      mockClient.getTransaction.mockResolvedValue(mockTx);

      await provider.connect(1);
      const callback = vi.fn();

      const unsubscribe = await provider.subscribeToTransactions(
        '0x1234567890123456789012345678901234567890',
        1,
        callback
      );

      expect(mockClient.watchPendingTransactions).toHaveBeenCalled();

      // Simulate pending transaction
      const onTransactions = mockClient.watchPendingTransactions.mock.calls[0][0].onTransactions;
      await onTransactions(['0xabc123']);

      expect(mockClient.getTransaction).toHaveBeenCalledWith({ hash: '0xabc123' });
      expect(callback).toHaveBeenCalledWith(mockTx);
    });

    it('should poll blocks for transactions when using HTTP', async () => {
      // Force HTTP connection (reject both WS URLs for mainnet)
      mockClient.getBlockNumber
        .mockRejectedValueOnce(new Error('WebSocket failed'))
        .mockRejectedValueOnce(new Error('WebSocket failed'));

      await provider.connect(1);

      // First poll sets lastBlockNumber=1000, second poll finds new block 1001
      mockClient.getBlockNumber
        .mockResolvedValueOnce(BigInt(1000))
        .mockResolvedValue(BigInt(1001));
      mockClient.getBlock.mockResolvedValue({
        transactions: [mockTx],
      });

      const callback = vi.fn();
      const unsubscribe = await provider.subscribeToTransactions(
        '0x1234567890123456789012345678901234567890',
        1,
        callback,
        { pollInterval: 100 }
      );

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(mockClient.getBlock).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(mockTx);

      unsubscribe();
    });
  });

  describe('Connection state management', () => {
    it('should track connection state correctly', async () => {
      expect(provider.getConnectionState(1)).toBe(ConnectionState.DISCONNECTED);

      const connectPromise = provider.connect(1);
      expect(provider.getConnectionState(1)).toBe(ConnectionState.CONNECTING);

      await connectPromise;
      expect(provider.getConnectionState(1)).toBe(ConnectionState.CONNECTED_WS);

      provider.disconnect(1);
      expect(provider.getConnectionState(1)).toBe(ConnectionState.DISCONNECTED);
    });

    it('should report WebSocket connection status', async () => {
      await provider.connect(1);
      expect(provider.isWebSocketConnected(1)).toBe(true);

      // Force HTTP connection (reject both WS URLs for mainnet)
      provider.disconnect(1);
      mockClient.getBlockNumber
        .mockRejectedValueOnce(new Error('WebSocket failed'))
        .mockRejectedValueOnce(new Error('WebSocket failed'));
      await provider.connect(1);

      expect(provider.isWebSocketConnected(1)).toBe(false);
    });

    it('should handle connection errors', async () => {
      mockClient.getBlockNumber.mockRejectedValue(new Error('Connection failed'));
      vi.mocked(http).mockImplementation(() => {
        throw new Error('HTTP also failed');
      });

      await expect(provider.connect(1)).rejects.toThrow();
      expect(provider.getConnectionState(1)).toBe(ConnectionState.ERROR);
    });
  });

  describe('Cleanup', () => {
    it('should clean up all subscriptions on cleanup', async () => {
      await provider.connect(1);
      await provider.connect(137);

      const unsubscribe1 = await provider.subscribeToBalance(
        '0x1234567890123456789012345678901234567890',
        1,
        vi.fn()
      );

      const unsubscribe2 = await provider.subscribeToTransactions(
        '0x1234567890123456789012345678901234567890',
        137,
        vi.fn()
      );

      expect(provider.getConnectedChains()).toHaveLength(2);

      await provider.cleanup();

      expect(provider.getConnectedChains()).toHaveLength(0);
      expect(provider.getConnectionState(1)).toBe(ConnectionState.DISCONNECTED);
      expect(provider.getConnectionState(137)).toBe(ConnectionState.DISCONNECTED);
    });

    it('should clean up polling intervals', async () => {
      // Force HTTP connection (reject both WS URLs for mainnet)
      mockClient.getBlockNumber
        .mockRejectedValueOnce(new Error('WebSocket failed'))
        .mockRejectedValueOnce(new Error('WebSocket failed'));

      await provider.connect(1);
      
      const callback = vi.fn();
      const unsubscribe = await provider.subscribeToBalance(
        '0x1234567890123456789012345678901234567890',
        1,
        callback,
        { pollInterval: 100 }
      );

      await new Promise(resolve => setTimeout(resolve, 150));
      const callCount = callback.mock.calls.length;

      unsubscribe();

      // Wait another interval to ensure polling stopped
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(callback).toHaveBeenCalledTimes(callCount);
    });
  });
});