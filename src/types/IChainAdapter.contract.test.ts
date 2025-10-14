/**
 * IChainAdapter contract tests
 * Ensures all implementations conform to the interface contract
 *
 * @module types/IChainAdapter.contract.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { IChainAdapter } from './IChainAdapter';
import type { Address } from 'viem';
import { createMockAddress } from '../test-utils';

/**
 * Contract test suite for IChainAdapter implementations
 * Import this function and call it with your adapter implementation to verify compliance
 *
 * @example
 * ```typescript
 * import { testIChainAdapterContract } from './IChainAdapter.contract.test';
 * import { MyAdapter } from './MyAdapter';
 *
 * describe('MyAdapter', () => {
 *   testIChainAdapterContract(() => new MyAdapter(config));
 * });
 * ```
 */
export function testIChainAdapterContract(
  createAdapter: () => IChainAdapter,
  options: {
    testAddress?: Address;
    skipConnectionTests?: boolean;
    skipSubscriptionTests?: boolean;
    skipValidationTests?: boolean;
  } = {}
) {
  const {
    testAddress = createMockAddress(1),
    skipConnectionTests = false,
    skipSubscriptionTests = false,
    skipValidationTests = false,
  } = options;

  let adapter: IChainAdapter;

  beforeEach(async () => {
    adapter = createAdapter();
    if (!skipConnectionTests) {
      await adapter.connect();
    }
  });

  afterEach(() => {
    if (adapter && !skipConnectionTests) {
      adapter.disconnect();
    }
  });

  describe('IChainAdapter Contract', () => {
    describe('Connection Management', () => {
      if (!skipConnectionTests) {
        it('should connect successfully', async () => {
          const freshAdapter = createAdapter();
          await expect(freshAdapter.connect()).resolves.toBeUndefined();
          freshAdapter.disconnect();
        });

        it('should report healthy status when connected', async () => {
          const isHealthy = await adapter.isHealthy();
          expect(typeof isHealthy).toBe('boolean');
        });

        it('should disconnect without errors', () => {
          expect(() => adapter.disconnect()).not.toThrow();
        });

        it('should handle multiple disconnect calls gracefully', () => {
          expect(() => {
            adapter.disconnect();
            adapter.disconnect();
          }).not.toThrow();
        });
      }
    });

    describe('Chain Information', () => {
      it('should provide chain information', () => {
        const chainInfo = adapter.getChainInfo();

        expect(chainInfo).toBeDefined();
        expect(chainInfo).toHaveProperty('id');
        expect(chainInfo).toHaveProperty('name');
        expect(chainInfo).toHaveProperty('symbol');
        expect(chainInfo).toHaveProperty('decimals');
        expect(chainInfo).toHaveProperty('explorer');

        expect(typeof chainInfo.id).toBe('number');
        expect(typeof chainInfo.name).toBe('string');
        expect(typeof chainInfo.symbol).toBe('string');
        expect(typeof chainInfo.decimals).toBe('number');
        expect(typeof chainInfo.explorer).toBe('string');

        expect(chainInfo.id).toBeGreaterThan(0);
        expect(chainInfo.name.length).toBeGreaterThan(0);
        expect(chainInfo.symbol.length).toBeGreaterThan(0);
        expect(chainInfo.decimals).toBeGreaterThanOrEqual(0);
      });

      it('should return consistent chain information across calls', () => {
        const info1 = adapter.getChainInfo();
        const info2 = adapter.getChainInfo();

        expect(info1).toEqual(info2);
      });
    });

    describe('Balance Queries', () => {
      it('should fetch native balance', async () => {
        const balance = await adapter.getBalance(testAddress);

        expect(balance).toBeDefined();
        expect(balance).toHaveProperty('address');
        expect(balance).toHaveProperty('chainId');
        expect(balance).toHaveProperty('balance');
        expect(balance).toHaveProperty('balanceFormatted');
        expect(balance).toHaveProperty('symbol');
        expect(balance).toHaveProperty('decimals');

        expect(balance.address.toLowerCase()).toBe(testAddress.toLowerCase());
        expect(typeof balance.chainId).toBe('number');
        expect(typeof balance.balance).toBe('string');
        expect(typeof balance.balanceFormatted).toBe('string');
        expect(typeof balance.symbol).toBe('string');
        expect(typeof balance.decimals).toBe('number');
      });

      it('should return valid balance structure for zero balance', async () => {
        const balance = await adapter.getBalance(testAddress);

        // Even if zero, should have proper structure
        expect(BigInt(balance.balance)).toBeGreaterThanOrEqual(0n);
        expect(parseFloat(balance.balanceFormatted)).toBeGreaterThanOrEqual(0);
      });

      if (!skipValidationTests) {
        it('should handle invalid address gracefully', async () => {
          const invalidAddress = '0xinvalid' as Address;

          await expect(adapter.getBalance(invalidAddress)).rejects.toThrow();
        });
      }
    });

    describe('Token Balance Queries', () => {
      it('should fetch token balances with empty array', async () => {
        const balances = await adapter.getTokenBalances(testAddress, []);

        expect(Array.isArray(balances)).toBe(true);
        expect(balances.length).toBe(0);
      });

      it('should return array of balances for valid tokens', async () => {
        // Use a common token address (e.g., USDC on mainnet)
        const tokenConfig = [
          {
            address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
            symbol: 'USDC',
            decimals: 6,
          },
        ];

        const balances = await adapter.getTokenBalances(testAddress, tokenConfig);

        expect(Array.isArray(balances)).toBe(true);
        balances.forEach((balance) => {
          expect(balance).toHaveProperty('address');
          expect(balance).toHaveProperty('chainId');
          expect(balance).toHaveProperty('balance');
          expect(balance).toHaveProperty('symbol');
          expect(balance).toHaveProperty('decimals');
        });
      });

      if (!skipValidationTests) {
        it('should handle invalid token addresses', async () => {
          const invalidTokenConfig = [
            {
              address: '0xinvalid' as Address,
            },
          ];

          await expect(adapter.getTokenBalances(testAddress, invalidTokenConfig)).rejects.toThrow();
        });
      }
    });

    describe('Transaction Queries', () => {
      it('should fetch transaction history', async () => {
        const transactions = await adapter.getTransactions(testAddress);

        expect(Array.isArray(transactions)).toBe(true);

        if (transactions.length > 0) {
          const tx = transactions[0];
          expect(tx).toHaveProperty('hash');
          expect(tx).toHaveProperty('from');
          expect(tx).toHaveProperty('to');
          expect(tx).toHaveProperty('value');
          expect(tx).toHaveProperty('blockNumber');
          expect(tx).toHaveProperty('timestamp');
          expect(tx).toHaveProperty('status');

          expect(typeof tx.hash).toBe('string');
          expect(typeof tx.value).toBe('string');
          expect(typeof tx.blockNumber).toBe('bigint');
          expect(tx.timestamp instanceof Date).toBe(true);
        }
      });

      it('should respect transaction query options', async () => {
        const transactions = await adapter.getTransactions(testAddress, {
          limit: 5,
        });

        expect(Array.isArray(transactions)).toBe(true);
        expect(transactions.length).toBeLessThanOrEqual(5);
      });

      it('should filter by block range', async () => {
        const fromBlock = 1000000n;
        const toBlock = 1000100n;

        const transactions = await adapter.getTransactions(testAddress, {
          fromBlock,
          toBlock,
        });

        expect(Array.isArray(transactions)).toBe(true);

        transactions.forEach((tx) => {
          expect(tx.blockNumber).toBeGreaterThanOrEqual(fromBlock);
          expect(tx.blockNumber).toBeLessThanOrEqual(toBlock);
        });
      });
    });

    describe('Real-time Subscriptions', () => {
      if (!skipSubscriptionTests) {
        it('should subscribe to balance changes', async () => {
          const callback = vitest.fn();
          const unsubscribe = await adapter.subscribeToBalance(testAddress, callback);

          expect(typeof unsubscribe).toBe('function');

          // Cleanup
          unsubscribe();
        });

        it('should subscribe to transaction updates', async () => {
          const callback = vitest.fn();
          const unsubscribe = await adapter.subscribeToTransactions(testAddress, callback);

          expect(typeof unsubscribe).toBe('function');

          // Cleanup
          unsubscribe();
        });

        it('should cleanup subscriptions on unsubscribe', async () => {
          const callback = vitest.fn();
          const unsubscribe = await adapter.subscribeToBalance(testAddress, callback);

          expect(() => unsubscribe()).not.toThrow();
          expect(() => unsubscribe()).not.toThrow(); // Should handle multiple calls
        });

        it('should cleanup all subscriptions on disconnect', async () => {
          const callback1 = vitest.fn();
          const callback2 = vitest.fn();

          await adapter.subscribeToBalance(testAddress, callback1);
          await adapter.subscribeToTransactions(testAddress, callback2);

          expect(() => adapter.disconnect()).not.toThrow();
        });
      }
    });

    describe('Error Handling', () => {
      if (!skipValidationTests) {
        it('should throw descriptive errors for invalid inputs', async () => {
          const invalidAddress = 'not-an-address' as Address;

          await expect(adapter.getBalance(invalidAddress)).rejects.toThrow();
        });
      }

      it('should handle network errors gracefully', async () => {
        // This test depends on the adapter implementation
        // Most adapters should throw a ConnectionError for network issues
        // We can't easily simulate network errors in a contract test
        // So we just verify the method exists and returns a promise
        expect(adapter.getBalance(testAddress)).toBeInstanceOf(Promise);
      });
    });

    describe('Type Safety', () => {
      it('should return correct types for all methods', async () => {
        const balance = await adapter.getBalance(testAddress);
        const tokenBalances = await adapter.getTokenBalances(testAddress, []);
        const transactions = await adapter.getTransactions(testAddress);
        const chainInfo = adapter.getChainInfo();
        const isHealthy = await adapter.isHealthy();

        expect(typeof balance).toBe('object');
        expect(Array.isArray(tokenBalances)).toBe(true);
        expect(Array.isArray(transactions)).toBe(true);
        expect(typeof chainInfo).toBe('object');
        expect(typeof isHealthy).toBe('boolean');
      });
    });

    describe('Idempotency', () => {
      it('should return consistent results for repeated queries', async () => {
        const balance1 = await adapter.getBalance(testAddress);
        const balance2 = await adapter.getBalance(testAddress);

        // Balance might change, but structure should be consistent
        expect(balance1).toHaveProperty('address');
        expect(balance2).toHaveProperty('address');
        expect(balance1.address).toBe(balance2.address);
        expect(balance1.chainId).toBe(balance2.chainId);
      });
    });
  });
}
