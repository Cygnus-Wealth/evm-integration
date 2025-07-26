import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketProvider } from './WebSocketProvider';
import { createPublicClient, webSocket } from 'viem';

vi.mock('viem', () => ({
  createPublicClient: vi.fn(),
  webSocket: vi.fn(),
  mainnet: { id: 1, name: 'Ethereum' },
  polygon: { id: 137, name: 'Polygon' },
  arbitrum: { id: 42161, name: 'Arbitrum' },
  optimism: { id: 10, name: 'Optimism' },
}));

describe('WebSocketProvider', () => {
  let provider: WebSocketProvider;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      watchBlockNumber: vi.fn(),
      watchPendingTransactions: vi.fn(),
      getBalance: vi.fn(),
      getTransaction: vi.fn(),
    };

    (createPublicClient as any).mockReturnValue(mockClient);
    (webSocket as any).mockReturnValue('mock-transport');

    provider = new WebSocketProvider();
  });

  afterEach(() => {
    vi.clearAllMocks();
    provider.cleanup();
  });

  describe('constructor', () => {
    it('should create provider with default options', () => {
      expect(provider).toBeInstanceOf(WebSocketProvider);
    });

    it('should create provider with custom options', () => {
      const customProvider = new WebSocketProvider({
        autoReconnect: false,
        reconnectInterval: 10000,
        maxReconnectAttempts: 10,
      });
      expect(customProvider).toBeInstanceOf(WebSocketProvider);
    });
  });

  describe('connect', () => {
    it('should connect to mainnet successfully', async () => {
      const client = await provider.connect(1);

      expect(createPublicClient).toHaveBeenCalledWith({
        chain: expect.objectContaining({ id: 1 }),
        transport: 'mock-transport',
      });
      expect(client).toBe(mockClient);
      expect(provider.isConnected(1)).toBe(true);
    });

    it('should connect to polygon successfully', async () => {
      await provider.connect(137);

      expect(createPublicClient).toHaveBeenCalledWith({
        chain: expect.objectContaining({ id: 137 }),
        transport: 'mock-transport',
      });
    });

    it('should return existing client if already connected', async () => {
      await provider.connect(1);
      const client2 = await provider.connect(1);

      expect(createPublicClient).toHaveBeenCalledTimes(1);
      expect(client2).toBe(mockClient);
    });

    it('should throw error for unsupported chain', async () => {
      await expect(provider.connect(999)).rejects.toThrow('Unsupported chain ID: 999');
    });
  });

  describe('disconnect', () => {
    it('should disconnect from chain', async () => {
      await provider.connect(1);
      expect(provider.isConnected(1)).toBe(true);

      provider.disconnect(1);
      expect(provider.isConnected(1)).toBe(false);
    });

    it('should handle disconnect from non-connected chain', () => {
      expect(() => provider.disconnect(1)).not.toThrow();
    });
  });

  describe('subscribeToBalance', () => {
    const mockAddress = '0x1234567890123456789012345678901234567890' as any;

    beforeEach(() => {
      mockClient.watchBlockNumber.mockImplementation(({ onBlockNumber }: any) => {
        onBlockNumber();
        return vi.fn();
      });
      mockClient.getBalance.mockResolvedValue(BigInt('1000000000000000000'));
    });

    it('should subscribe to balance updates', async () => {
      const callback = vi.fn();
      const unsubscribe = await provider.subscribeToBalance(mockAddress, 1, callback);

      expect(mockClient.watchBlockNumber).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(BigInt('1000000000000000000'));
      expect(typeof unsubscribe).toBe('function');
    });

    it('should handle balance fetch errors', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockClient.getBalance.mockRejectedValue(new Error('Network error'));

      const callback = vi.fn();
      await provider.subscribeToBalance(mockAddress, 1, callback);

      expect(consoleError).toHaveBeenCalledWith('Error fetching balance:', expect.any(Error));
      expect(callback).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('subscribeToTransactions', () => {
    const mockAddress = '0x1234567890123456789012345678901234567890' as any;
    const mockTxHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as any;

    beforeEach(() => {
      mockClient.watchPendingTransactions.mockImplementation(({ onTransactions }: any) => {
        onTransactions([mockTxHash]);
        return vi.fn();
      });
      mockClient.getTransaction.mockResolvedValue({
        hash: mockTxHash,
        from: mockAddress,
        to: '0x9876543210987654321098765432109876543210',
        value: BigInt('500000000000000000'),
      });
    });

    it('should subscribe to transaction updates', async () => {
      const callback = vi.fn();
      const unsubscribe = await provider.subscribeToTransactions(mockAddress, 1, callback);

      expect(mockClient.watchPendingTransactions).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        hash: mockTxHash,
        from: mockAddress,
      }));
      expect(typeof unsubscribe).toBe('function');
    });

    it('should filter transactions not involving the address', async () => {
      mockClient.getTransaction.mockResolvedValue({
        hash: mockTxHash,
        from: '0x9999999999999999999999999999999999999999',
        to: '0x8888888888888888888888888888888888888888',
        value: BigInt('500000000000000000'),
      });

      const callback = vi.fn();
      await provider.subscribeToTransactions(mockAddress, 1, callback);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle transaction fetch errors', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockClient.getTransaction.mockRejectedValue(new Error('Network error'));

      const callback = vi.fn();
      await provider.subscribeToTransactions(mockAddress, 1, callback);

      expect(consoleError).toHaveBeenCalledWith('Error fetching transaction:', expect.any(Error));
      expect(callback).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('getConnectedChains', () => {
    it('should return empty array when no connections', () => {
      expect(provider.getConnectedChains()).toEqual([]);
    });

    it('should return connected chain IDs', async () => {
      await provider.connect(1);
      await provider.connect(137);

      const connectedChains = provider.getConnectedChains();
      expect(connectedChains).toContain(1);
      expect(connectedChains).toContain(137);
      expect(connectedChains).toHaveLength(2);
    });
  });

  describe('isConnected', () => {
    it('should return false for unconnected chain', () => {
      expect(provider.isConnected(1)).toBe(false);
    });

    it('should return true for connected chain', async () => {
      await provider.connect(1);
      expect(provider.isConnected(1)).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should cleanup all connections', async () => {
      await provider.connect(1);
      await provider.connect(137);
      
      expect(provider.getConnectedChains()).toHaveLength(2);

      await provider.cleanup();

      expect(provider.getConnectedChains()).toHaveLength(0);
    });
  });
});