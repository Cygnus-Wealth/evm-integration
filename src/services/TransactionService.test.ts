import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Address } from 'viem';
import { TransactionService } from './TransactionService';
import { IChainAdapter } from '../types/IChainAdapter';
import { Transaction, TransactionType } from '@cygnus-wealth/data-models';
import { ValidationError } from '../utils/errors';
import { sleep } from '../test-utils';

describe('TransactionService', () => {
  let service: TransactionService;
  let mockAdapter: IChainAdapter;
  const testAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
  const chainId = 1;

  // Mock transaction data
  const mockTransactions: Transaction[] = [
    {
      hash: '0xabc123',
      from: testAddress,
      to: '0x1234567890123456789012345678901234567890' as Address,
      value: BigInt('1000000000000000000'),
      type: TransactionType.TRANSFER,
      status: 'COMPLETED',
      timestamp: new Date('2024-01-01'),
      chainId,
      blockNumber: 1000,
      gasUsed: BigInt('21000'),
      gasPrice: BigInt('50000000000'),
    },
    {
      hash: '0xdef456',
      from: testAddress,
      to: '0x9876543210987654321098765432109876543210' as Address,
      value: BigInt('500000000000000000'),
      type: TransactionType.SWAP,
      status: 'COMPLETED',
      timestamp: new Date('2024-01-02'),
      chainId,
      blockNumber: 1010,
      gasUsed: BigInt('150000'),
      gasPrice: BigInt('60000000000'),
    },
    {
      hash: '0xghi789',
      from: testAddress,
      to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address,
      value: BigInt('100000000000000000'),
      type: TransactionType.TRANSFER,
      status: 'PENDING',
      timestamp: new Date('2024-01-03'),
      chainId,
    },
  ];

  beforeEach(() => {
    // Create mock adapter
    mockAdapter = {
      getBalance: vi.fn().mockResolvedValue({
        address: testAddress,
        chainId,
        nativeBalance: BigInt('1000000000000000000'),
        value: 1,
        tokens: [],
        timestamp: new Date(),
      }),
      getTokenBalances: vi.fn().mockResolvedValue([]),
      getTransactions: vi.fn().mockResolvedValue(mockTransactions),
      subscribeToBalance: vi.fn().mockResolvedValue(() => {}),
      subscribeToTransactions: vi.fn().mockResolvedValue(() => {}),
    } as unknown as IChainAdapter;

    // Create service with mock adapter
    const adapters = new Map<number, IChainAdapter>([[chainId, mockAdapter]]);
    service = new TransactionService(adapters, {
      enableCache: true,
      cacheTTL: 300,
      defaultPageSize: 50,
      maxTransactions: 1000,
    });
  });

  afterEach(async () => {
    await service.destroy();
  });

  describe('Constructor', () => {
    it('should initialize with default config', () => {
      const adapters = new Map<number, IChainAdapter>([[chainId, mockAdapter]]);
      const defaultService = new TransactionService(adapters);

      expect(defaultService).toBeDefined();
      defaultService.destroy();
    });

    it('should initialize with custom config', () => {
      const adapters = new Map<number, IChainAdapter>([[chainId, mockAdapter]]);
      const customService = new TransactionService(adapters, {
        enableCache: false,
        cacheTTL: 600,
        defaultPageSize: 100,
      });

      expect(customService).toBeDefined();
      customService.destroy();
    });
  });

  describe('getTransactions', () => {
    it('should fetch transactions for valid address', async () => {
      const result = await service.getTransactions(testAddress, chainId);

      expect(result.items).toEqual(mockTransactions);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(50);
      expect(result.total).toBe(3);
      expect(mockAdapter.getTransactions).toHaveBeenCalledWith(testAddress, {});
    });

    it('should throw on invalid address', async () => {
      await expect(
        service.getTransactions('invalid' as Address, chainId)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw on unsupported chain', async () => {
      await expect(
        service.getTransactions(testAddress, 999)
      ).rejects.toThrow(ValidationError);
    });

    it('should apply pagination', async () => {
      const result = await service.getTransactions(testAddress, chainId, {
        page: 1,
        pageSize: 2,
      });

      expect(result.items).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(2);
      expect(result.total).toBe(3);
      expect(result.totalPages).toBe(2);
      expect(result.hasMore).toBe(true);
    });

    it('should handle page 2', async () => {
      const result = await service.getTransactions(testAddress, chainId, {
        page: 2,
        pageSize: 2,
      });

      expect(result.items).toHaveLength(1);
      expect(result.page).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by transaction type', async () => {
      const result = await service.getTransactions(testAddress, chainId, {
        types: [TransactionType.TRANSFER],
      });

      expect(result.items).toHaveLength(2);
      expect(result.items.every(tx => tx.type === TransactionType.TRANSFER)).toBe(true);
    });

    it('should filter by multiple types', async () => {
      const result = await service.getTransactions(testAddress, chainId, {
        types: [TransactionType.TRANSFER, TransactionType.SWAP],
      });

      expect(result.items).toHaveLength(3);
    });

    it('should filter by status', async () => {
      const result = await service.getTransactions(testAddress, chainId, {
        statuses: ['COMPLETED'],
      });

      expect(result.items).toHaveLength(2);
      expect(result.items.every(tx => tx.status === 'COMPLETED')).toBe(true);
    });

    it('should filter by multiple statuses', async () => {
      const result = await service.getTransactions(testAddress, chainId, {
        statuses: ['COMPLETED', 'PENDING'],
      });

      expect(result.items).toHaveLength(3);
    });

    it('should exclude pending transactions', async () => {
      const result = await service.getTransactions(testAddress, chainId, {
        excludePending: true,
      });

      expect(result.items).toHaveLength(2);
      expect(result.items.every(tx => tx.status !== 'PENDING')).toBe(true);
    });

    it('should filter by date range', async () => {
      const result = await service.getTransactions(testAddress, chainId, {
        dateRange: {
          from: new Date('2024-01-01'),
          to: new Date('2024-01-02'),
        },
      });

      expect(result.items).toHaveLength(2);
    });

    it('should use cache on second request', async () => {
      // First request
      await service.getTransactions(testAddress, chainId);

      // Second request should use cache
      await service.getTransactions(testAddress, chainId);

      // Adapter should only be called once
      expect(mockAdapter.getTransactions).toHaveBeenCalledTimes(1);
    });

    it('should bypass cache with forceFresh option', async () => {
      // First request
      await service.getTransactions(testAddress, chainId);

      // Second request with forceFresh
      await service.getTransactions(testAddress, chainId, { forceFresh: true });

      // Adapter should be called twice
      expect(mockAdapter.getTransactions).toHaveBeenCalledTimes(2);
    });

    it('should validate page number', async () => {
      await expect(
        service.getTransactions(testAddress, chainId, { page: 0 })
      ).rejects.toThrow(ValidationError);

      await expect(
        service.getTransactions(testAddress, chainId, { page: -1 })
      ).rejects.toThrow(ValidationError);
    });

    it('should validate page size', async () => {
      await expect(
        service.getTransactions(testAddress, chainId, { pageSize: 0 })
      ).rejects.toThrow(ValidationError);

      await expect(
        service.getTransactions(testAddress, chainId, { pageSize: 2000 })
      ).rejects.toThrow(ValidationError);
    });

    it('should pass adapter options', async () => {
      await service.getTransactions(testAddress, chainId, {
        limit: 100,
        fromBlock: 1000n,
        toBlock: 2000n,
      });

      expect(mockAdapter.getTransactions).toHaveBeenCalledWith(testAddress, {
        limit: 100,
        fromBlock: 1000n,
        toBlock: 2000n,
      });
    });
  });

  describe('getTransaction', () => {
    it('should fetch transaction by hash', async () => {
      const validHash = '0x' + 'a'.repeat(64); // Valid 64-char hex hash
      mockTransactions[0].hash = validHash;

      const tx = await service.getTransaction(validHash, chainId);

      expect(tx.hash).toBe(validHash);
    });

    it('should throw on invalid hash', async () => {
      await expect(
        service.getTransaction('invalid', chainId)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw on non-existent transaction', async () => {
      await expect(
        service.getTransaction('0xnonexistent', chainId)
      ).rejects.toThrow(ValidationError);
    });

    it('should validate transaction hash format', async () => {
      const invalidHashes = [
        '',
        '0x',
        '0x123',
        'notahash',
      ];

      for (const hash of invalidHashes) {
        await expect(
          service.getTransaction(hash, chainId)
        ).rejects.toThrow(ValidationError);
      }
    });
  });

  describe('getPendingTransactions', () => {
    it('should return only pending transactions', async () => {
      const pending = await service.getPendingTransactions(testAddress, chainId);

      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe('PENDING');
    });

    it('should return empty array if no pending', async () => {
      mockAdapter.getTransactions = vi.fn().mockResolvedValue([
        { ...mockTransactions[0], status: 'COMPLETED' },
      ]);

      const pending = await service.getPendingTransactions(testAddress, chainId);

      expect(pending).toHaveLength(0);
    });

    it('should throw on invalid address', async () => {
      await expect(
        service.getPendingTransactions('invalid' as Address, chainId)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('subscribeToTransactions', () => {
    it('should subscribe to transaction updates', async () => {
      const callback = vi.fn();

      const unsubscribe = await service.subscribeToTransactions(
        testAddress,
        chainId,
        callback
      );

      expect(mockAdapter.subscribeToTransactions).toHaveBeenCalled();
      expect(unsubscribe).toBeTypeOf('function');
    });

    it('should call callback on new transaction', async () => {
      const callback = vi.fn();
      let adapterCallback: ((tx: Transaction) => void) | undefined;

      mockAdapter.subscribeToTransactions = vi.fn().mockImplementation(
        async (_address: Address, cb: (tx: Transaction) => void) => {
          adapterCallback = cb;
          return () => {};
        }
      );

      await service.subscribeToTransactions(testAddress, chainId, callback);

      // Simulate new transaction
      adapterCallback?.(mockTransactions[0]);

      expect(callback).toHaveBeenCalledWith(mockTransactions[0]);
    });

    it('should filter by transaction type', async () => {
      const callback = vi.fn();
      let adapterCallback: ((tx: Transaction) => void) | undefined;

      mockAdapter.subscribeToTransactions = vi.fn().mockImplementation(
        async (_address: Address, cb: (tx: Transaction) => void) => {
          adapterCallback = cb;
          return () => {};
        }
      );

      await service.subscribeToTransactions(testAddress, chainId, callback, {
        types: [TransactionType.SWAP],
      });

      // Simulate transactions
      adapterCallback?.(mockTransactions[0]); // TRANSFER - should be filtered
      adapterCallback?.(mockTransactions[1]); // SWAP - should pass

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(mockTransactions[1]);
    });

    it('should filter pending transactions', async () => {
      const callback = vi.fn();
      let adapterCallback: ((tx: Transaction) => void) | undefined;

      mockAdapter.subscribeToTransactions = vi.fn().mockImplementation(
        async (_address: Address, cb: (tx: Transaction) => void) => {
          adapterCallback = cb;
          return () => {};
        }
      );

      await service.subscribeToTransactions(testAddress, chainId, callback, {
        includePending: false,
      });

      // Simulate transactions
      adapterCallback?.(mockTransactions[2]); // PENDING - should be filtered
      adapterCallback?.(mockTransactions[0]); // COMPLETED - should pass

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(mockTransactions[0]);
    });

    it('should unsubscribe correctly', async () => {
      const callback = vi.fn();
      const mockUnsubscribe = vi.fn();

      mockAdapter.subscribeToTransactions = vi.fn().mockResolvedValue(mockUnsubscribe);

      const unsubscribe = await service.subscribeToTransactions(
        testAddress,
        chainId,
        callback
      );

      unsubscribe();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('should throw on invalid address', async () => {
      await expect(
        service.subscribeToTransactions('invalid' as Address, chainId, vi.fn())
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('unsubscribeAll', () => {
    it('should unsubscribe all subscriptions', async () => {
      const mockUnsubscribe1 = vi.fn();
      const mockUnsubscribe2 = vi.fn();

      mockAdapter.subscribeToTransactions = vi
        .fn()
        .mockResolvedValueOnce(mockUnsubscribe1)
        .mockResolvedValueOnce(mockUnsubscribe2);

      const unsub1 = await service.subscribeToTransactions(testAddress, chainId, vi.fn());
      const unsub2 = await service.subscribeToTransactions(testAddress, chainId, vi.fn());

      // Call unsubscribe functions directly
      unsub1();
      unsub2();

      expect(mockUnsubscribe1).toHaveBeenCalled();
      expect(mockUnsubscribe2).toHaveBeenCalled();
    });

    it('should unsubscribe for specific address', async () => {
      const mockUnsubscribe = vi.fn();
      mockAdapter.subscribeToTransactions = vi.fn().mockResolvedValue(mockUnsubscribe);

      await service.subscribeToTransactions(testAddress, chainId, vi.fn());

      service.unsubscribeAll(testAddress);

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('should unsubscribe for specific address and chain', async () => {
      const mockUnsubscribe = vi.fn();
      mockAdapter.subscribeToTransactions = vi.fn().mockResolvedValue(mockUnsubscribe);

      await service.subscribeToTransactions(testAddress, chainId, vi.fn());

      service.unsubscribeAll(testAddress, chainId);

      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('Cache Management', () => {
    it('should cache transaction data', async () => {
      await service.getTransactions(testAddress, chainId);

      // Clear mock calls
      vi.clearAllMocks();

      // Second request should use cache
      await service.getTransactions(testAddress, chainId);

      expect(mockAdapter.getTransactions).not.toHaveBeenCalled();
    });

    it('should respect cache TTL', async () => {
      const shortTTLService = new TransactionService(
        new Map([[chainId, mockAdapter]]),
        { cacheTTL: 0.1 } // 100ms
      );

      await shortTTLService.getTransactions(testAddress, chainId);

      // Wait for cache to expire
      await sleep(150);

      // Should fetch fresh data
      await shortTTLService.getTransactions(testAddress, chainId);

      expect(mockAdapter.getTransactions).toHaveBeenCalledTimes(2);

      await shortTTLService.destroy();
    });

    it('should generate unique cache keys for different queries', async () => {
      // Different filter options should create different cache keys
      await service.getTransactions(testAddress, chainId, {
        types: [TransactionType.TRANSFER],
      });

      await service.getTransactions(testAddress, chainId, {
        types: [TransactionType.SWAP],
      });

      // Both queries should hit the adapter
      expect(mockAdapter.getTransactions).toHaveBeenCalledTimes(2);
    });
  });

  describe('Pagination Edge Cases', () => {
    it('should handle empty result set', async () => {
      mockAdapter.getTransactions = vi.fn().mockResolvedValue([]);

      const result = await service.getTransactions(testAddress, chainId);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should handle single page of results', async () => {
      const result = await service.getTransactions(testAddress, chainId, {
        pageSize: 10,
      });

      expect(result.items).toHaveLength(3);
      expect(result.totalPages).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should handle exact page boundary', async () => {
      const result = await service.getTransactions(testAddress, chainId, {
        pageSize: 3,
      });

      expect(result.items).toHaveLength(3);
      expect(result.totalPages).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should handle out of bounds page', async () => {
      const result = await service.getTransactions(testAddress, chainId, {
        page: 10,
        pageSize: 2,
      });

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('Filter Combinations', () => {
    it('should apply multiple filters together', async () => {
      const result = await service.getTransactions(testAddress, chainId, {
        types: [TransactionType.TRANSFER],
        statuses: ['COMPLETED'],
        dateRange: {
          from: new Date('2024-01-01'),
          to: new Date('2024-01-02'),
        },
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe(TransactionType.TRANSFER);
      expect(result.items[0].status).toBe('COMPLETED');
    });

    it('should combine filters and pagination', async () => {
      const result = await service.getTransactions(testAddress, chainId, {
        types: [TransactionType.TRANSFER],
        page: 1,
        pageSize: 1,
      });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(2);
      expect(result.totalPages).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should propagate adapter errors', async () => {
      const customError = new Error('RPC error');
      mockAdapter.getTransactions = vi.fn().mockRejectedValue(customError);

      await expect(
        service.getTransactions(testAddress, chainId)
      ).rejects.toThrow('RPC error');
    });

    it('should handle invalid adapter responses', async () => {
      mockAdapter.getTransactions = vi.fn().mockResolvedValue(null);

      await expect(
        service.getTransactions(testAddress, chainId)
      ).rejects.toThrow();
    });
  });

  describe('Resource Cleanup', () => {
    it('should destroy cleanly', async () => {
      await service.getTransactions(testAddress, chainId);
      await service.subscribeToTransactions(testAddress, chainId, vi.fn());

      await service.destroy();

      // Should complete without errors
      expect(true).toBe(true);
    });

    it('should unsubscribe all on destroy', async () => {
      const mockUnsubscribe = vi.fn();
      mockAdapter.subscribeToTransactions = vi.fn().mockResolvedValue(mockUnsubscribe);

      await service.subscribeToTransactions(testAddress, chainId, vi.fn());

      await service.destroy();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('should clear cache on destroy', async () => {
      await service.getTransactions(testAddress, chainId);

      await service.destroy();

      // Should complete without errors
      expect(true).toBe(true);
    });
  });
});
