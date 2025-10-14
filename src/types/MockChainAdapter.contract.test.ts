/**
 * Example usage of IChainAdapter contract tests with a mock adapter
 * This demonstrates how to use the contract test suite
 *
 * @module types/MockChainAdapter.contract.test
 */

import { describe } from 'vitest';
import { testIChainAdapterContract } from './IChainAdapter.contract.test';
import { createMockAdapter, createMockAddress } from '../test-utils';
import type { IChainAdapter, ChainInfo } from './IChainAdapter';
import type { Address } from 'viem';

/**
 * Create a fully functional mock adapter for testing
 */
function createFullMockAdapter(): IChainAdapter {
  const adapter = createMockAdapter(1) as IChainAdapter;

  // Add missing methods for full IChainAdapter compliance
  adapter.getChainInfo = () => ({
    id: 1,
    name: 'Ethereum Mainnet',
    symbol: 'ETH',
    decimals: 18,
    explorer: 'https://etherscan.io',
  });

  adapter.isHealthy = async () => true;

  adapter.connect = async () => {
    // Mock connection
  };

  adapter.disconnect = () => {
    // Mock disconnection
  };

  // getBalance is already mocked by createMockAdapter
  adapter.getBalance.mockImplementation(async (address: Address) => ({
    address,
    chainId: 1,
    balance: '1000000000000000000',
    balanceFormatted: '1.0',
    symbol: 'ETH',
    decimals: 18,
    blockNumber: 12345678n,
    timestamp: new Date(),
  }));

  // getTokenBalances is already mocked
  adapter.getTokenBalances.mockImplementation(async () => []);

  // getTransactions is already mocked
  adapter.getTransactions.mockImplementation(async () => []);

  // subscribeToBalance is already mocked
  adapter.subscribeToBalance.mockImplementation(async () => () => {});

  // subscribeToTransactions is already mocked (as subscribeToBlocks in test-utils)
  if (!adapter.subscribeToTransactions) {
    adapter.subscribeToTransactions = adapter.subscribeToBlocks;
  }
  adapter.subscribeToTransactions.mockImplementation(async () => () => {});

  return adapter;
}

describe('MockChainAdapter Contract Compliance', () => {
  testIChainAdapterContract(createFullMockAdapter, {
    testAddress: createMockAddress(123),
    skipConnectionTests: false,
    skipSubscriptionTests: false,
    skipValidationTests: true, // Mocks don't validate addresses
  });
});
