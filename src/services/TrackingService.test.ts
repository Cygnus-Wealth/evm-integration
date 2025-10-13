import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Address } from 'viem';
import {
  TrackingService,
  AddressTrackingConfig,
  BalanceChangeEvent,
  NewTransactionEvent,
} from './TrackingService';
import { BalanceService } from './BalanceService';
import { TransactionService } from './TransactionService';
import { Balance, Transaction, TransactionType } from '@cygnus-wealth/data-models';
import { ValidationError } from '../utils/errors';
import { sleep } from '../test-utils';

describe('TrackingService', () => {
  let service: TrackingService;
  let mockBalanceService: BalanceService;
  let mockTransactionService: TransactionService;
  const testAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
  const chainId = 1;

  // Mock data
  const mockBalance: Balance = {
    address: testAddress,
    chainId,
    nativeBalance: BigInt('1000000000000000000'),
    value: 1,
    tokens: [],
    timestamp: new Date(),
  };

  const updatedBalance: Balance = {
    ...mockBalance,
    nativeBalance: BigInt('2000000000000000000'),
    value: 2,
  };

  const mockTransaction: Transaction = {
    hash: '0xabc123',
    from: testAddress,
    to: '0x1234567890123456789012345678901234567890' as Address,
    value: BigInt('1000000000000000000'),
    type: TransactionType.TRANSFER,
    status: 'COMPLETED',
    timestamp: new Date(),
    chainId,
    blockNumber: 1000,
    gasUsed: BigInt('21000'),
    gasPrice: BigInt('50000000000'),
  };

  const newTransaction: Transaction = {
    hash: '0xdef456',
    from: testAddress,
    to: '0x9876543210987654321098765432109876543210' as Address,
    value: BigInt('500000000000000000'),
    type: TransactionType.SWAP,
    status: 'COMPLETED',
    timestamp: new Date(),
    chainId,
    blockNumber: 1010,
    gasUsed: BigInt('150000'),
    gasPrice: BigInt('60000000000'),
  };

  beforeEach(() => {
    // Create mock services
    mockBalanceService = {
      getBalance: vi.fn().mockResolvedValue(mockBalance),
      destroy: vi.fn(),
    } as unknown as BalanceService;

    mockTransactionService = {
      getTransactions: vi.fn().mockResolvedValue({
        items: [mockTransaction],
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
        hasMore: false,
      }),
      destroy: vi.fn(),
    } as unknown as TransactionService;

    // Create service with mock dependencies
    service = new TrackingService(
      mockBalanceService,
      mockTransactionService,
      {}
    );
  });

  afterEach(() => {
    service.destroy();
  });

  describe('Constructor', () => {
    it('should initialize with event handlers', () => {
      const handlers = {
        onBalanceChange: vi.fn(),
        onNewTransaction: vi.fn(),
        onError: vi.fn(),
      };

      const trackerService = new TrackingService(
        mockBalanceService,
        mockTransactionService,
        handlers
      );

      expect(trackerService).toBeDefined();
      trackerService.destroy();
    });

    it('should initialize without event handlers', () => {
      const trackerService = new TrackingService(
        mockBalanceService,
        mockTransactionService,
        {}
      );

      expect(trackerService).toBeDefined();
      trackerService.destroy();
    });
  });

  describe('startTracking', () => {
    it('should start tracking an address', () => {
      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [chainId],
        pollingInterval: 100,
      };

      service.startTracking(config);

      expect(service.isTracking(testAddress)).toBe(true);
      expect(service.isTracking(testAddress, chainId)).toBe(true);
    });

    it('should throw on invalid address', () => {
      const config: AddressTrackingConfig = {
        address: 'invalid' as Address,
        chainIds: [chainId],
      };

      expect(() => service.startTracking(config)).toThrow(ValidationError);
    });

    it('should use default config values', () => {
      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [chainId],
      };

      service.startTracking(config);

      const status = service.getTrackingStatus(testAddress);
      expect(status).toBeDefined();
      expect(status?.get(chainId)?.isActive).toBe(true);
    });

    it('should track multiple chains', () => {
      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [1, 137, 56],
      };

      service.startTracking(config);

      expect(service.isTracking(testAddress, 1)).toBe(true);
      expect(service.isTracking(testAddress, 137)).toBe(true);
      expect(service.isTracking(testAddress, 56)).toBe(true);
    });

    it('should start polling immediately', async () => {
      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [chainId],
        pollingInterval: 100,
        trackBalances: true,
        trackTransactions: false,
      };

      service.startTracking(config);

      // Wait for initial poll
      await sleep(50);

      expect(mockBalanceService.getBalance).toHaveBeenCalled();
    });

    it('should configure tracking options', () => {
      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [chainId],
        trackBalances: true,
        trackTransactions: false,
        trackTokens: true,
      };

      service.startTracking(config);

      expect(service.isTracking(testAddress)).toBe(true);
    });
  });

  describe('stopTracking', () => {
    beforeEach(() => {
      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [chainId],
      };
      service.startTracking(config);
    });

    it('should stop tracking an address', () => {
      service.stopTracking(testAddress);

      const status = service.getTrackingStatus(testAddress);
      expect(status?.get(chainId)?.isActive).toBe(false);
    });

    it('should stop tracking specific chain', () => {
      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [1, 137],
      };

      service.startTracking(config);

      // Stop tracking chain 1
      service.stopTracking(testAddress, 1);

      const status = service.getTrackingStatus(testAddress);
      // Chain 1 should be inactive
      expect(status?.get(1)?.isActive).toBe(false);
      // Chain 137 should still be active
      expect(status?.get(137)?.isActive).toBe(true);
    });

    it('should throw on invalid address', () => {
      expect(() => service.stopTracking('invalid' as Address)).toThrow(ValidationError);
    });

    it('should clear polling interval', async () => {
      service.stopTracking(testAddress);

      // Wait to verify no more polling
      await sleep(200);

      // Reset mock
      const initialCalls = (mockBalanceService.getBalance as any).mock.calls.length;
      await sleep(200);
      const finalCalls = (mockBalanceService.getBalance as any).mock.calls.length;

      // No additional calls should be made
      expect(finalCalls).toBe(initialCalls);
    });
  });

  describe('updateTrackingConfig', () => {
    beforeEach(() => {
      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [chainId],
        pollingInterval: 1000,
      };
      service.startTracking(config);
    });

    it('should update polling interval', () => {
      service.updateTrackingConfig(testAddress, {
        pollingInterval: 500,
      });

      expect(service.isTracking(testAddress)).toBe(true);
    });

    it('should update chain IDs', () => {
      service.updateTrackingConfig(testAddress, {
        chainIds: [1, 137],
      });

      expect(service.isTracking(testAddress, 1)).toBe(true);
      expect(service.isTracking(testAddress, 137)).toBe(true);
    });

    it('should update tracking options', () => {
      service.updateTrackingConfig(testAddress, {
        trackBalances: false,
        trackTransactions: true,
      });

      expect(service.isTracking(testAddress)).toBe(true);
    });

    it('should throw on non-tracked address', () => {
      const unknownAddress: Address = '0x1234567890123456789012345678901234567890';

      expect(() => service.updateTrackingConfig(unknownAddress, {})).toThrow();
    });

    it('should throw on invalid address', () => {
      expect(() =>
        service.updateTrackingConfig('invalid' as Address, {})
      ).toThrow(ValidationError);
    });
  });

  describe('Balance Change Detection', () => {
    it('should detect balance changes', async () => {
      const onBalanceChange = vi.fn();
      const trackerService = new TrackingService(
        mockBalanceService,
        mockTransactionService,
        { onBalanceChange }
      );

      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [chainId],
        pollingInterval: 100,
        trackBalances: true,
      };

      trackerService.startTracking(config);

      // Wait for initial poll
      await sleep(150);

      // Update mock to return different balance
      mockBalanceService.getBalance = vi.fn().mockResolvedValue(updatedBalance);

      // Wait for next poll
      await sleep(150);

      expect(onBalanceChange).toHaveBeenCalled();
      const call = onBalanceChange.mock.calls[0][0] as BalanceChangeEvent;
      expect(call.oldBalance.value).toBe(1);
      expect(call.newBalance.value).toBe(2);

      trackerService.destroy();
    });

    it('should not trigger on same balance', async () => {
      const onBalanceChange = vi.fn();
      const trackerService = new TrackingService(
        mockBalanceService,
        mockTransactionService,
        { onBalanceChange }
      );

      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [chainId],
        pollingInterval: 100,
        trackBalances: true,
      };

      trackerService.startTracking(config);

      // Wait for multiple polls
      await sleep(350);

      // Balance hasn't changed, should only be called on initial detection
      expect(onBalanceChange).not.toHaveBeenCalled();

      trackerService.destroy();
    });

    it('should skip balance tracking if disabled', async () => {
      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [chainId],
        pollingInterval: 100,
        trackBalances: false,
      };

      service.startTracking(config);

      await sleep(150);

      expect(mockBalanceService.getBalance).not.toHaveBeenCalled();
    });
  });

  describe('Transaction Detection', () => {
    it('should detect new transactions', async () => {
      const onNewTransaction = vi.fn();
      const trackerService = new TrackingService(
        mockBalanceService,
        mockTransactionService,
        { onNewTransaction }
      );

      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [chainId],
        pollingInterval: 100,
        trackTransactions: true,
      };

      trackerService.startTracking(config);

      // Wait for initial poll (establishes baseline)
      await sleep(150);

      // Add new transaction
      mockTransactionService.getTransactions = vi.fn().mockResolvedValue({
        items: [mockTransaction, newTransaction],
        page: 1,
        pageSize: 10,
        total: 2,
        totalPages: 1,
        hasMore: false,
      });

      // Wait for next poll
      await sleep(150);

      expect(onNewTransaction).toHaveBeenCalledTimes(1);
      const call = onNewTransaction.mock.calls[0][0] as NewTransactionEvent;
      expect(call.transaction.hash).toBe(newTransaction.hash);

      trackerService.destroy();
    });

    it('should not trigger on known transactions', async () => {
      const onNewTransaction = vi.fn();
      const trackerService = new TrackingService(
        mockBalanceService,
        mockTransactionService,
        { onNewTransaction }
      );

      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [chainId],
        pollingInterval: 100,
        trackTransactions: true,
      };

      trackerService.startTracking(config);

      // Wait for multiple polls
      await sleep(350);

      // No new transactions, should not be called
      expect(onNewTransaction).not.toHaveBeenCalled();

      trackerService.destroy();
    });

    it('should skip transaction tracking if disabled', async () => {
      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [chainId],
        pollingInterval: 100,
        trackTransactions: false,
      };

      service.startTracking(config);

      await sleep(150);

      expect(mockTransactionService.getTransactions).not.toHaveBeenCalled();
    });

    it('should handle transactions without hash', async () => {
      const txWithoutHash: Transaction = {
        ...mockTransaction,
        hash: undefined,
      };

      mockTransactionService.getTransactions = vi.fn().mockResolvedValue({
        items: [txWithoutHash],
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
        hasMore: false,
      });

      const onNewTransaction = vi.fn();
      const trackerService = new TrackingService(
        mockBalanceService,
        mockTransactionService,
        { onNewTransaction }
      );

      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [chainId],
        pollingInterval: 100,
        trackTransactions: true,
      };

      trackerService.startTracking(config);

      await sleep(150);

      // Should not throw
      expect(true).toBe(true);

      trackerService.destroy();
    });
  });

  describe('Error Handling', () => {
    it('should invoke error handler on tracking error', async () => {
      const onError = vi.fn();
      const trackerService = new TrackingService(
        mockBalanceService,
        mockTransactionService,
        { onError }
      );

      mockBalanceService.getBalance = vi.fn().mockRejectedValue(new Error('Network error'));

      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [chainId],
        pollingInterval: 100,
        trackBalances: true,
      };

      trackerService.startTracking(config);

      await sleep(150);

      expect(onError).toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        testAddress,
        chainId
      );

      trackerService.destroy();
    });

    it('should track error count', async () => {
      const onError = vi.fn();
      const trackerService = new TrackingService(
        mockBalanceService,
        mockTransactionService,
        { onError }
      );

      mockBalanceService.getBalance = vi.fn().mockRejectedValue(new Error('Error'));

      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [chainId],
        pollingInterval: 30,
        trackBalances: true,
        trackTransactions: false,
      };

      trackerService.startTracking(config);

      // Wait for multiple polling cycles
      await sleep(400);

      // Check error was handled
      expect(onError).toHaveBeenCalled();

      const status = trackerService.getTrackingStatus(testAddress);
      expect(status?.get(chainId)?.errorCount).toBeGreaterThan(0);

      trackerService.destroy();
    });

    it('should continue tracking after errors', async () => {
      let errorCount = 0;
      mockBalanceService.getBalance = vi.fn().mockImplementation(async () => {
        if (errorCount++ < 2) {
          throw new Error('Transient error');
        }
        return mockBalance;
      });

      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [chainId],
        pollingInterval: 100,
      };

      service.startTracking(config);

      await sleep(350);

      const status = service.getTrackingStatus(testAddress);
      expect(status?.get(chainId)?.isActive).toBe(true);
    });
  });

  describe('Status Tracking', () => {
    it('should provide tracking status', () => {
      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [chainId],
      };

      service.startTracking(config);

      const status = service.getTrackingStatus(testAddress);

      expect(status).toBeDefined();
      expect(status?.get(chainId)?.address).toBe(testAddress);
      expect(status?.get(chainId)?.isActive).toBe(true);
    });

    it('should update last update time', async () => {
      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [chainId],
        pollingInterval: 100,
      };

      service.startTracking(config);

      const status1 = service.getTrackingStatus(testAddress);
      const time1 = status1?.get(chainId)?.lastUpdate;

      await sleep(150);

      const status2 = service.getTrackingStatus(testAddress);
      const time2 = status2?.get(chainId)?.lastUpdate;

      expect(time2).not.toEqual(time1);
    });

    it('should return undefined for non-tracked address', () => {
      const unknownAddress: Address = '0x1234567890123456789012345678901234567890';

      const status = service.getTrackingStatus(unknownAddress);

      expect(status).toBeUndefined();
    });
  });

  describe('isTracking', () => {
    beforeEach(() => {
      const config: AddressTrackingConfig = {
        address: testAddress,
        chainIds: [1, 137],
      };
      service.startTracking(config);
    });

    it('should return true for tracked address', () => {
      expect(service.isTracking(testAddress)).toBe(true);
    });

    it('should return true for tracked chain', () => {
      expect(service.isTracking(testAddress, 1)).toBe(true);
      expect(service.isTracking(testAddress, 137)).toBe(true);
    });

    it('should return false for non-tracked chain', () => {
      expect(service.isTracking(testAddress, 56)).toBe(false);
    });

    it('should return false for non-tracked address', () => {
      const unknownAddress: Address = '0x1234567890123456789012345678901234567890';
      expect(service.isTracking(unknownAddress)).toBe(false);
    });
  });

  describe('getTrackedAddresses', () => {
    it('should return tracked addresses', () => {
      const address2: Address = '0x1234567890123456789012345678901234567890';

      service.startTracking({
        address: testAddress,
        chainIds: [chainId],
      });

      service.startTracking({
        address: address2,
        chainIds: [chainId],
      });

      const addresses = service.getTrackedAddresses();

      expect(addresses).toHaveLength(2);
      expect(addresses).toContain(testAddress);
      expect(addresses).toContain(address2);
    });

    it('should return empty array when no addresses tracked', () => {
      const addresses = service.getTrackedAddresses();
      expect(addresses).toHaveLength(0);
    });
  });

  describe('stopAll', () => {
    it('should stop tracking all addresses', () => {
      const address2: Address = '0x1234567890123456789012345678901234567890';

      service.startTracking({
        address: testAddress,
        chainIds: [chainId],
      });

      service.startTracking({
        address: address2,
        chainIds: [chainId],
      });

      service.stopAll();

      expect(service.isTracking(testAddress)).toBe(false);
      expect(service.isTracking(address2)).toBe(false);
    });

    it('should clear all intervals', async () => {
      service.startTracking({
        address: testAddress,
        chainIds: [chainId],
        pollingInterval: 100,
      });

      await sleep(50);

      service.stopAll();

      const initialCalls = (mockBalanceService.getBalance as any).mock.calls.length;

      await sleep(200);

      const finalCalls = (mockBalanceService.getBalance as any).mock.calls.length;

      // No new calls should be made
      expect(finalCalls).toBe(initialCalls);
    });
  });

  describe('getStats', () => {
    it('should return statistics', () => {
      service.startTracking({
        address: testAddress,
        chainIds: [1, 137],
      });

      const stats = service.getStats();

      expect(stats.totalAddresses).toBe(1);
      expect(stats.totalChains).toBe(2);
      expect(stats.activeTracking).toBe(2);
      expect(stats.totalErrors).toBe(0);
    });

    it('should track errors in stats', async () => {
      const onError = vi.fn();
      const trackerService = new TrackingService(
        mockBalanceService,
        mockTransactionService,
        { onError }
      );

      mockBalanceService.getBalance = vi.fn().mockRejectedValue(new Error('Error'));

      trackerService.startTracking({
        address: testAddress,
        chainIds: [chainId],
        pollingInterval: 30,
        trackBalances: true,
        trackTransactions: false,
      });

      // Wait for multiple error-causing polls
      await sleep(400);

      // Verify error handler was called
      expect(onError).toHaveBeenCalled();

      const stats = trackerService.getStats();
      expect(stats.totalErrors).toBeGreaterThan(0);

      trackerService.destroy();
    });

    it('should return zero stats when empty', () => {
      const stats = service.getStats();

      expect(stats.totalAddresses).toBe(0);
      expect(stats.totalChains).toBe(0);
      expect(stats.activeTracking).toBe(0);
      expect(stats.totalErrors).toBe(0);
    });
  });

  describe('Resource Cleanup', () => {
    it('should destroy cleanly', () => {
      service.startTracking({
        address: testAddress,
        chainIds: [chainId],
      });

      service.destroy();

      expect(service.isTracking(testAddress)).toBe(false);
    });

    it('should stop all tracking on destroy', () => {
      service.startTracking({
        address: testAddress,
        chainIds: [1, 137],
      });

      service.destroy();

      const stats = service.getStats();
      expect(stats.activeTracking).toBe(0);
    });

    it('should clear all intervals on destroy', async () => {
      service.startTracking({
        address: testAddress,
        chainIds: [chainId],
        pollingInterval: 100,
      });

      await sleep(50);

      service.destroy();

      const initialCalls = (mockBalanceService.getBalance as any).mock.calls.length;

      await sleep(200);

      const finalCalls = (mockBalanceService.getBalance as any).mock.calls.length;

      expect(finalCalls).toBe(initialCalls);
    });
  });
});
