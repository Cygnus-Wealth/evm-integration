/**
 * Enterprise-Aligned E2E Tests
 *
 * Validates critical user paths per ARCHITECTURE.md E2E specification:
 * - Complete balance fetch flow (cache miss → RPC → transform → return)
 * - Multi-chain portfolio loading
 * - Portfolio tracking lifecycle
 * - Circuit breaker recovery flow
 * - Data-models compliance (@cygnus-wealth/data-models)
 *
 * @module e2e/enterprise-alignment.e2e.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Address } from 'viem';
import { Balance, Transaction, AssetType, Chain, TransactionType } from '@cygnus-wealth/data-models';
import { BalanceService } from '../services/BalanceService';
import { TransactionService } from '../services/TransactionService';
import { TrackingService } from '../services/TrackingService';
import { CircuitBreaker } from '../resilience/CircuitBreaker';
import { ConnectionError } from '../utils/errors';
import { CacheManager } from '../performance/CacheManager';
import { IChainAdapter, ChainInfo } from '../types/IChainAdapter';
import { mapEvmBalanceToBalance, mapTokenToAsset, mapEvmTransaction } from '../utils/mappers';

// --- Data-models compliant mock factories ---

function createCompliantBalance(overrides?: Partial<Balance>): Balance {
  return {
    assetId: 'ethereum-native',
    asset: {
      id: 'ethereum-native',
      symbol: 'ETH',
      name: 'ETH',
      type: AssetType.CRYPTOCURRENCY,
      decimals: 18,
      chain: Chain.ETHEREUM,
    },
    amount: '1000000000000000000',
    value: {
      amount: 1.0,
      currency: 'USD',
      timestamp: new Date(),
    },
    ...overrides,
  };
}

function createCompliantTransaction(overrides?: Partial<Transaction>): Transaction {
  return {
    id: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    accountId: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
    type: TransactionType.TRANSFER_OUT,
    status: 'COMPLETED',
    hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    chain: Chain.ETHEREUM,
    from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
    to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEc0',
    timestamp: new Date(),
    blockNumber: 12345678,
    assetsOut: [{
      asset: {
        id: 'ethereum-native',
        symbol: 'ETH',
        name: 'Ethereum',
        type: AssetType.CRYPTOCURRENCY,
        decimals: 18,
        chain: Chain.ETHEREUM,
      },
      amount: '1000000000000000000',
    }],
    ...overrides,
  };
}

function createCompliantAdapter(chainId: number, chain: Chain, symbol: string): IChainAdapter {
  const assetId = `${chain.toLowerCase()}-native`;
  const defaultBalance = createCompliantBalance({
    assetId,
    asset: {
      id: assetId,
      symbol,
      name: symbol,
      type: AssetType.CRYPTOCURRENCY,
      decimals: 18,
      chain,
    },
  });

  return {
    getBalance: vi.fn().mockResolvedValue(defaultBalance),
    getTokenBalances: vi.fn().mockResolvedValue([]),
    getTransactions: vi.fn().mockResolvedValue([]),
    subscribeToBalance: vi.fn().mockResolvedValue(() => {}),
    subscribeToTransactions: vi.fn().mockResolvedValue(() => {}),
    getChainInfo: vi.fn().mockReturnValue({
      id: chainId,
      name: symbol === 'ETH' ? 'Ethereum Mainnet' : `${symbol} Network`,
      symbol,
      decimals: 18,
      explorer: 'https://etherscan.io',
    } as ChainInfo),
    isHealthy: vi.fn().mockResolvedValue(true),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  } as unknown as IChainAdapter;
}

const TEST_ADDRESS = '0x1234567890123456789012345678901234567890' as Address;

// --- E2E Tests ---

describe('E2E: Enterprise Strategy Alignment', () => {

  describe('Data-Models Compliance', () => {
    it('should produce Balance objects conforming to @cygnus-wealth/data-models', () => {
      // Verify the mapper produces correct data-models Balance shape
      const balanceData = {
        value: 2500000000000000000n,
        formatted: '2.5',
        symbol: 'ETH',
        decimals: 18,
      };

      const balance = mapEvmBalanceToBalance(
        balanceData,
        TEST_ADDRESS,
        1
      );

      // Required fields per data-models Balance interface
      expect(balance).toHaveProperty('assetId');
      expect(balance).toHaveProperty('asset');
      expect(balance).toHaveProperty('amount');

      // assetId format
      expect(typeof balance.assetId).toBe('string');
      expect(balance.assetId.length).toBeGreaterThan(0);

      // Asset structure
      expect(balance.asset).toHaveProperty('id');
      expect(balance.asset).toHaveProperty('symbol');
      expect(balance.asset).toHaveProperty('name');
      expect(balance.asset).toHaveProperty('type');
      expect(balance.asset.type).toBe(AssetType.CRYPTOCURRENCY);
      expect(balance.asset.chain).toBe(Chain.ETHEREUM);
      expect(balance.asset.symbol).toBe('ETH');
      expect(balance.asset.decimals).toBe(18);

      // Amount as string (preserves precision)
      expect(typeof balance.amount).toBe('string');
      expect(balance.amount).toBe('2.5');

      // Value is Price-compatible
      if (balance.value) {
        expect(balance.value).toHaveProperty('currency');
        expect(balance.value).toHaveProperty('timestamp');
        expect(balance.value.timestamp).toBeInstanceOf(Date);
      }
    });

    it('should produce Asset objects with correct chain mapping', () => {
      const chainMappings: Array<[number, Chain, string]> = [
        [1, Chain.ETHEREUM, 'ETH'],
        [137, Chain.POLYGON, 'MATIC'],
        [42161, Chain.ARBITRUM, 'ETH'],
        [10, Chain.OPTIMISM, 'ETH'],
        [56, Chain.BSC, 'BNB'],
      ];

      for (const [chainId, expectedChain, symbol] of chainMappings) {
        const asset = mapTokenToAsset(
          '0x0000000000000000000000000000000000000000' as Address,
          symbol,
          `${symbol} Token`,
          18,
          chainId
        );

        expect(asset.chain).toBe(expectedChain);
        expect(asset.type).toBe(AssetType.CRYPTOCURRENCY);
        expect(asset.symbol).toBe(symbol);
        expect(typeof asset.id).toBe('string');
        expect(asset.id.length).toBeGreaterThan(0);
      }
    });

    it('should produce Transaction objects conforming to @cygnus-wealth/data-models', () => {
      const txData = {
        hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        from: TEST_ADDRESS,
        to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address,
        value: 1000000000000000000n,
        blockNumber: 18500000n,
        timestamp: 1700000000n,
        gasUsed: 21000n,
        gasPrice: 50000000000n,
        status: 'success' as const,
      };

      const tx = mapEvmTransaction(txData, 1, 'account-1');

      // Required fields per data-models Transaction interface
      expect(tx).toHaveProperty('id');
      expect(tx).toHaveProperty('accountId');
      expect(tx).toHaveProperty('type');
      expect(tx).toHaveProperty('status');
      expect(tx).toHaveProperty('timestamp');

      expect(typeof tx.id).toBe('string');
      expect(tx.accountId).toBe('account-1');
      expect(Object.values(TransactionType)).toContain(tx.type);
      expect(['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED']).toContain(tx.status);
      expect(tx.timestamp).toBeInstanceOf(Date);
      expect(tx.chain).toBe(Chain.ETHEREUM);
      expect(tx.hash).toBe(txData.hash);
      expect(tx.from).toBe(TEST_ADDRESS);
      expect(tx.to).toBe(txData.to);

      // Asset flows for value transfer
      expect(tx.assetsOut).toBeDefined();
      expect(tx.assetsOut!.length).toBeGreaterThan(0);
      expect(tx.assetsOut![0].asset.type).toBe(AssetType.CRYPTOCURRENCY);
      expect(typeof tx.assetsOut![0].amount).toBe('string');

      // Fees
      expect(tx.fees).toBeDefined();
      expect(tx.fees!.length).toBeGreaterThan(0);
      expect(typeof tx.fees![0].amount).toBe('string');
    });
  });

  describe('Complete Balance Fetch Flow', () => {
    it('should complete cache miss → fetch → cache → cache hit cycle', async () => {
      const balance = createCompliantBalance();
      const adapter = createCompliantAdapter(1, Chain.ETHEREUM, 'ETH');
      (adapter.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue(balance);

      const adapters = new Map<number, IChainAdapter>([[1, adapter]]);
      const service = new BalanceService(adapters, {
        enableCache: true,
        cacheTTL: 60,
        enableCircuitBreaker: false,
        enableRetry: false,
      });

      // 1. Cache miss - fetches from adapter
      const result1 = await service.getBalance(TEST_ADDRESS, 1);
      expect(result1).toEqual(balance);
      expect(adapter.getBalance).toHaveBeenCalledTimes(1);

      const stats1 = service.getStats();
      expect(stats1.cacheMisses).toBe(1);
      expect(stats1.cacheHits).toBe(0);

      // 2. Cache hit - returns from cache, no adapter call
      const result2 = await service.getBalance(TEST_ADDRESS, 1);
      expect(result2).toEqual(balance);
      expect(adapter.getBalance).toHaveBeenCalledTimes(1); // Still 1

      const stats2 = service.getStats();
      expect(stats2.cacheMisses).toBe(1);
      expect(stats2.cacheHits).toBe(1);

      // 3. Force fresh - bypasses cache
      const freshBalance = createCompliantBalance({
        amount: '2000000000000000000',
        value: { amount: 2.0, currency: 'USD', timestamp: new Date() },
      });
      (adapter.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue(freshBalance);

      const result3 = await service.getBalance(TEST_ADDRESS, 1, { forceFresh: true });
      expect(result3).toEqual(freshBalance);
      expect(adapter.getBalance).toHaveBeenCalledTimes(2);

      // 4. Verify return is data-models compliant
      expect(result3).toHaveProperty('assetId');
      expect(result3).toHaveProperty('asset');
      expect(result3).toHaveProperty('amount');
      expect(result3.asset.type).toBe(AssetType.CRYPTOCURRENCY);

      await service.destroy();
    });

    it('should coalesce concurrent identical requests into single fetch', async () => {
      const balance = createCompliantBalance();
      const adapter = createCompliantAdapter(1, Chain.ETHEREUM, 'ETH');
      (adapter.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue(balance);

      const adapters = new Map<number, IChainAdapter>([[1, adapter]]);
      const service = new BalanceService(adapters, { enableCache: false });

      // Launch 10 concurrent requests for same address
      const promises = Array(10).fill(null).map(() =>
        service.getBalance(TEST_ADDRESS, 1)
      );

      const results = await Promise.all(promises);

      // Only 1 actual adapter call (coalesced)
      expect(adapter.getBalance).toHaveBeenCalledTimes(1);

      // All return same result
      for (const result of results) {
        expect(result).toEqual(balance);
      }

      await service.destroy();
    });
  });

  describe('Multi-Chain Portfolio Loading', () => {
    it('should load balances across multiple chains with data-models types', async () => {
      const ethBalance = createCompliantBalance({
        assetId: 'ethereum-native',
        asset: {
          id: 'ethereum-native',
          symbol: 'ETH',
          name: 'ETH',
          type: AssetType.CRYPTOCURRENCY,
          decimals: 18,
          chain: Chain.ETHEREUM,
        },
        amount: '2000000000000000000',
      });

      const maticBalance = createCompliantBalance({
        assetId: 'polygon-native',
        asset: {
          id: 'polygon-native',
          symbol: 'MATIC',
          name: 'MATIC',
          type: AssetType.CRYPTOCURRENCY,
          decimals: 18,
          chain: Chain.POLYGON,
        },
        amount: '5000000000000000000',
      });

      const arbBalance = createCompliantBalance({
        assetId: 'arbitrum-native',
        asset: {
          id: 'arbitrum-native',
          symbol: 'ETH',
          name: 'ETH',
          type: AssetType.CRYPTOCURRENCY,
          decimals: 18,
          chain: Chain.ARBITRUM,
        },
        amount: '500000000000000000',
      });

      const ethAdapter = createCompliantAdapter(1, Chain.ETHEREUM, 'ETH');
      (ethAdapter.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue(ethBalance);

      const polyAdapter = createCompliantAdapter(137, Chain.POLYGON, 'MATIC');
      (polyAdapter.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue(maticBalance);

      const arbAdapter = createCompliantAdapter(42161, Chain.ARBITRUM, 'ETH');
      (arbAdapter.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue(arbBalance);

      const adapters = new Map<number, IChainAdapter>([
        [1, ethAdapter],
        [137, polyAdapter],
        [42161, arbAdapter],
      ]);

      const service = new BalanceService(adapters, { enableCache: true });

      const portfolio = await service.getMultiChainBalance(
        TEST_ADDRESS,
        [1, 137, 42161]
      );

      // All chains loaded successfully
      expect(portfolio.balances.size).toBe(3);
      expect(portfolio.errors.size).toBe(0);

      // Verify each chain's balance is data-models compliant
      const ethResult = portfolio.balances.get(1)!;
      expect(ethResult.asset.chain).toBe(Chain.ETHEREUM);
      expect(ethResult.assetId).toBe('ethereum-native');

      const polyResult = portfolio.balances.get(137)!;
      expect(polyResult.asset.chain).toBe(Chain.POLYGON);
      expect(polyResult.assetId).toBe('polygon-native');

      const arbResult = portfolio.balances.get(42161)!;
      expect(arbResult.asset.chain).toBe(Chain.ARBITRUM);
      expect(arbResult.assetId).toBe('arbitrum-native');

      await service.destroy();
    });

    it('should handle partial chain failures gracefully', async () => {
      const ethBalance = createCompliantBalance();
      const ethAdapter = createCompliantAdapter(1, Chain.ETHEREUM, 'ETH');
      (ethAdapter.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue(ethBalance);

      const failAdapter = createCompliantAdapter(137, Chain.POLYGON, 'MATIC');
      (failAdapter.getBalance as ReturnType<typeof vi.fn>).mockRejectedValue(
        ConnectionError.timeout('https://polygon-rpc.com', 5000)
      );

      const adapters = new Map<number, IChainAdapter>([
        [1, ethAdapter],
        [137, failAdapter],
      ]);

      const service = new BalanceService(adapters, {
        enableCircuitBreaker: false,
        enableRetry: false,
      });

      const portfolio = await service.getMultiChainBalance(
        TEST_ADDRESS,
        [1, 137]
      );

      // Ethereum succeeded, Polygon failed
      expect(portfolio.balances.size).toBe(1);
      expect(portfolio.balances.has(1)).toBe(true);
      expect(portfolio.errors.size).toBe(1);
      expect(portfolio.errors.has(137)).toBe(true);

      // The successful balance is still data-models compliant
      const ethResult = portfolio.balances.get(1)!;
      expect(ethResult).toHaveProperty('assetId');
      expect(ethResult).toHaveProperty('asset');
      expect(ethResult).toHaveProperty('amount');

      await service.destroy();
    });
  });

  describe('Portfolio Tracking Lifecycle', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should track address, detect balance changes, and stop cleanly', async () => {
      const initialBalance = createCompliantBalance({ amount: '1000000000000000000' });
      const updatedBalance = createCompliantBalance({ amount: '2000000000000000000' });

      const adapter = createCompliantAdapter(1, Chain.ETHEREUM, 'ETH');
      (adapter.getBalance as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(initialBalance)
        .mockResolvedValue(updatedBalance);
      (adapter.getTransactions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const adapters = new Map<number, IChainAdapter>([[1, adapter]]);
      const balanceService = new BalanceService(adapters, {
        enableCache: false,
        enableCircuitBreaker: false,
      });
      const transactionService = new TransactionService(adapters);

      const balanceChanges: Array<{ oldAmount: string; newAmount: string }> = [];
      const errors: Error[] = [];

      const trackingService = new TrackingService(
        balanceService,
        transactionService,
        {
          onBalanceChange: (event) => {
            balanceChanges.push({
              oldAmount: event.oldBalance.amount,
              newAmount: event.newBalance.amount,
            });
          },
          onError: (error) => {
            errors.push(error);
          },
        }
      );

      // Start tracking
      trackingService.startTracking({
        address: TEST_ADDRESS,
        chainIds: [1],
        pollingInterval: 5000,
        trackBalances: true,
        trackTransactions: false,
      });

      expect(trackingService.isTracking(TEST_ADDRESS)).toBe(true);
      expect(trackingService.isTracking(TEST_ADDRESS, 1)).toBe(true);

      // Wait for initial poll
      await vi.advanceTimersByTimeAsync(100);

      // Trigger second poll (should detect balance change)
      await vi.advanceTimersByTimeAsync(5000);

      expect(balanceChanges.length).toBe(1);
      expect(balanceChanges[0].oldAmount).toBe('1000000000000000000');
      expect(balanceChanges[0].newAmount).toBe('2000000000000000000');

      // Check stats
      const stats = trackingService.getStats();
      expect(stats.totalAddresses).toBe(1);
      expect(stats.activeTracking).toBe(1);
      expect(stats.totalErrors).toBe(0);

      // Stop tracking
      trackingService.stopTracking(TEST_ADDRESS);
      expect(trackingService.isTracking(TEST_ADDRESS)).toBe(false);

      // Cleanup
      trackingService.destroy();
      await balanceService.destroy();
      await transactionService.destroy();
    });

    it('should track multiple addresses across chains', async () => {
      const ethBalance = createCompliantBalance({
        assetId: 'ethereum-native',
        asset: {
          id: 'ethereum-native', symbol: 'ETH', name: 'ETH',
          type: AssetType.CRYPTOCURRENCY, decimals: 18, chain: Chain.ETHEREUM,
        },
        amount: '1000000000000000000',
      });
      const polyBalance = createCompliantBalance({
        assetId: 'polygon-native',
        asset: {
          id: 'polygon-native', symbol: 'MATIC', name: 'MATIC',
          type: AssetType.CRYPTOCURRENCY, decimals: 18, chain: Chain.POLYGON,
        },
        amount: '5000000000000000000',
      });

      const ethAdapter = createCompliantAdapter(1, Chain.ETHEREUM, 'ETH');
      (ethAdapter.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue(ethBalance);
      (ethAdapter.getTransactions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const polyAdapter = createCompliantAdapter(137, Chain.POLYGON, 'MATIC');
      (polyAdapter.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue(polyBalance);
      (polyAdapter.getTransactions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const adapters = new Map<number, IChainAdapter>([
        [1, ethAdapter],
        [137, polyAdapter],
      ]);

      const balanceService = new BalanceService(adapters, {
        enableCache: false,
        enableCircuitBreaker: false,
      });
      const transactionService = new TransactionService(adapters);

      const trackingService = new TrackingService(
        balanceService,
        transactionService,
        {}
      );

      const addr1 = TEST_ADDRESS;
      const addr2 = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address;

      // Track addr1 on Ethereum, addr2 on both chains
      trackingService.startTracking({
        address: addr1,
        chainIds: [1],
        pollingInterval: 10000,
        trackTransactions: false,
      });

      trackingService.startTracking({
        address: addr2,
        chainIds: [1, 137],
        pollingInterval: 10000,
        trackTransactions: false,
      });

      expect(trackingService.getTrackedAddresses()).toHaveLength(2);

      const stats = trackingService.getStats();
      expect(stats.totalAddresses).toBe(2);
      // addr1 tracks 1 chain, addr2 tracks 2 chains = 3 total
      expect(stats.activeTracking).toBe(3);

      // Stop all
      trackingService.stopAll();
      expect(trackingService.getStats().activeTracking).toBe(0);

      trackingService.destroy();
      await balanceService.destroy();
      await transactionService.destroy();
    });

    it('should handle tracking errors without crashing', async () => {
      // Use real timers - TrackingService fires pollUpdates as fire-and-forget
      vi.useRealTimers();

      const mockBalanceService = {
        getBalance: vi.fn().mockRejectedValue(
          ConnectionError.timeout('https://eth-rpc.com', 5000)
        ),
        destroy: vi.fn(),
      } as unknown as BalanceService;

      const mockTransactionService = {
        getTransactions: vi.fn().mockResolvedValue({
          items: [],
          page: 1,
          pageSize: 10,
          total: 0,
          totalPages: 0,
          hasMore: false,
        }),
        destroy: vi.fn(),
      } as unknown as TransactionService;

      const errors: Array<{ error: Error; address: Address; chainId: number }> = [];

      const trackingService = new TrackingService(
        mockBalanceService,
        mockTransactionService,
        {
          onError: (error, address, chainId) => {
            errors.push({ error, address, chainId });
          },
        }
      );

      trackingService.startTracking({
        address: TEST_ADDRESS,
        chainIds: [1],
        pollingInterval: 50,
        trackBalances: true,
        trackTransactions: false,
      });

      // Wait for the fire-and-forget poll to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Error should be tracked
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].address).toBe(TEST_ADDRESS);
      expect(errors[0].chainId).toBe(1);

      // Service should still be tracking (resilient)
      expect(trackingService.isTracking(TEST_ADDRESS)).toBe(true);

      const stats = trackingService.getStats();
      expect(stats.totalErrors).toBeGreaterThan(0);

      trackingService.destroy();

      // Restore fake timers for other tests
      vi.useFakeTimers();
    });
  });

  describe('Circuit Breaker Recovery Flow', () => {
    it('should follow open → half-open → closed recovery cycle', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        timeout: 100,
        volumeThreshold: 3,
        successThreshold: 1,
        name: 'e2e-recovery-test',
      });

      // Phase 1: CLOSED - normal operation
      expect(breaker.getState()).toBe('CLOSED');

      // Phase 2: Trigger failures to open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw ConnectionError.timeout('https://rpc.example.com', 5000);
          });
        } catch (e) {}
      }

      // Circuit should be OPEN
      expect(breaker.getState()).toBe('OPEN');

      // Phase 3: Requests should be rejected immediately
      await expect(
        breaker.execute(async () => 'should not run')
      ).rejects.toThrow('is open');

      // Phase 4: Wait for timeout then execute() triggers HALF_OPEN transition
      // The CircuitBreaker only transitions to HALF_OPEN inside execute()
      await new Promise(resolve => setTimeout(resolve, 150));

      // Phase 5: Successful request transitions through HALF_OPEN → CLOSED
      const result = await breaker.execute(async () => 'recovered');
      expect(result).toBe('recovered');
      expect(breaker.getState()).toBe('CLOSED');

      // Phase 6: Verify stats track the recovery
      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(0); // Reset after closing
      expect(stats.successCount).toBeGreaterThan(0);

      breaker.reset();
    });

    it('should integrate circuit breaker with BalanceService for chain-level isolation', async () => {
      vi.useRealTimers();

      const ethAdapter = createCompliantAdapter(1, Chain.ETHEREUM, 'ETH');
      (ethAdapter.getBalance as ReturnType<typeof vi.fn>).mockRejectedValue(
        ConnectionError.timeout('https://eth-rpc.com', 5000)
      );

      const polyBalance = createCompliantBalance({
        assetId: 'polygon-native',
        asset: {
          id: 'polygon-native', symbol: 'MATIC', name: 'MATIC',
          type: AssetType.CRYPTOCURRENCY, decimals: 18, chain: Chain.POLYGON,
        },
      });
      const polyAdapter = createCompliantAdapter(137, Chain.POLYGON, 'MATIC');
      (polyAdapter.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue(polyBalance);

      const adapters = new Map<number, IChainAdapter>([
        [1, ethAdapter],
        [137, polyAdapter],
      ]);

      const service = new BalanceService(adapters, {
        enableCircuitBreaker: true,
        enableRetry: false,
        enableCache: false,
        failureThreshold: 2,
      });

      // Trigger enough failures on Ethereum to open its circuit breaker
      // CircuitBreaker has volumeThreshold (default 10) - need enough requests
      for (let i = 1; i <= 10; i++) {
        try {
          const addr = `0x${i.toString(16).padStart(40, '0')}` as Address;
          await service.getBalance(addr, 1);
        } catch (e) {}
      }

      // Ethereum circuit should be open
      await expect(
        service.getBalance(TEST_ADDRESS, 1)
      ).rejects.toThrow('is open');

      // Polygon should still work (chain-level isolation)
      const polyResult = await service.getBalance(TEST_ADDRESS, 137);
      expect(polyResult.asset.chain).toBe(Chain.POLYGON);
      expect(polyResult.assetId).toBe('polygon-native');

      await service.destroy();
    });
  });

  describe('Cache Environment Isolation', () => {
    it('should isolate cache entries by environment prefix', async () => {
      const testnetCache = new CacheManager<Balance>({}, 'testnet');
      const productionCache = new CacheManager<Balance>({}, 'production');

      const testnetBalance = createCompliantBalance({ amount: '100' });
      const productionBalance = createCompliantBalance({ amount: '999' });

      await testnetCache.set('balance:1:0xabc', testnetBalance);
      await productionCache.set('balance:1:0xabc', productionBalance);

      const testnetResult = await testnetCache.get('balance:1:0xabc');
      const productionResult = await productionCache.get('balance:1:0xabc');

      expect(testnetResult!.amount).toBe('100');
      expect(productionResult!.amount).toBe('999');

      // Verify prefix isolation
      expect(testnetCache.getKeyPrefix()).toBe('testnet:');
      expect(productionCache.getKeyPrefix()).toBe('production:');

      testnetCache.destroy();
      productionCache.destroy();
    });
  });

  describe('Service Stack Integration', () => {
    it('should flow data through full stack: adapter → service → cache → result', async () => {
      const balance = createCompliantBalance({
        assetId: 'ethereum-native',
        amount: '3500000000000000000',
        value: { amount: 3.5, currency: 'USD', timestamp: new Date() },
      });

      const adapter = createCompliantAdapter(1, Chain.ETHEREUM, 'ETH');
      (adapter.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue(balance);

      const adapters = new Map<number, IChainAdapter>([[1, adapter]]);
      const service = new BalanceService(adapters, {
        enableCache: true,
        enableCircuitBreaker: true,
        enableRetry: true,
        cacheTTL: 60,
      });

      // Step 1: Fetch (exercises full stack: cache check → adapter → cache store)
      const result = await service.getBalance(TEST_ADDRESS, 1);

      // Step 2: Verify data-models compliance of output
      expect(result.assetId).toBe('ethereum-native');
      expect(result.asset.type).toBe(AssetType.CRYPTOCURRENCY);
      expect(result.amount).toBe('3500000000000000000');
      expect(typeof result.amount).toBe('string'); // Precision preservation

      // Step 3: Verify cache populated
      const cached = await service.getBalance(TEST_ADDRESS, 1);
      expect(adapter.getBalance).toHaveBeenCalledTimes(1);
      expect(cached).toEqual(result);

      // Step 4: Verify stats
      const stats = service.getStats();
      expect(stats.totalRequests).toBe(2);
      expect(stats.cacheMisses).toBe(1);
      expect(stats.cacheHits).toBe(1);
      expect(stats.failedRequests).toBe(0);

      // Step 5: Circuit breaker should be in good state
      const cbStats = service.getCircuitBreakerStats(1);
      expect(cbStats).toBeDefined();

      await service.destroy();
    });
  });
});
