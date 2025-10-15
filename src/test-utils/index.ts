/**
 * Test utilities for EVM integration testing
 */

import { Address } from 'viem';
import { Balance, Transaction } from '@cygnus-wealth/data-models';

/**
 * Creates a mock chain adapter
 */
export function createMockAdapter(chainId: number): any {
  return {
    chainId,
    getBalance: vi.fn(),
    getTokenBalances: vi.fn(),
    getTransactions: vi.fn(),
    getTransaction: vi.fn(),
    subscribeToBlocks: vi.fn(),
    subscribeToBalance: vi.fn(),
    unsubscribe: vi.fn(),
  };
}

/**
 * Creates a mock balance response
 */
export function createMockBalance(params?: Partial<Balance>): Balance {
  return {
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' as Address,
    chainId: 1,
    balance: '1000000000000000000',
    balanceFormatted: '1.0',
    symbol: 'ETH',
    decimals: 18,
    blockNumber: 12345678n,
    timestamp: new Date(),
    ...params,
  };
}

/**
 * Creates a mock transaction response
 */
export function createMockTransaction(params?: Partial<Transaction>): Transaction {
  return {
    hash: '0x1234567890123456789012345678901234567890123456789012345678901234',
    from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' as Address,
    to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEc' as Address,
    value: '1000000000000000000',
    blockNumber: 12345678n,
    timestamp: new Date(),
    status: 'success',
    type: 'SEND',
    chainId: 1,
    gasUsed: '21000',
    gasPrice: '50000000000',
    ...params,
  };
}

/**
 * Creates a mock RPC client
 */
export function createMockRpcClient(): any {
  return {
    getBalance: vi.fn(),
    getBlockNumber: vi.fn(),
    getBlock: vi.fn(),
    getTransaction: vi.fn(),
    getTransactionReceipt: vi.fn(),
    call: vi.fn(),
    readContract: vi.fn(),
  };
}

/**
 * Advances fake timers and flushes promises
 */
export async function advanceTimersAndFlush(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
  await vi.runAllTimersAsync();
  await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Waits for condition with timeout
 */
export async function waitFor(
  condition: () => boolean,
  timeout: number = 5000
): Promise<void> {
  const start = Date.now();

  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error(`Timeout waiting for condition after ${timeout}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Creates test chain config
 */
export function createTestChainConfig(
  chainId: number,
  overrides?: Partial<any>
): any {
  return {
    chainId,
    name: `Test Chain ${chainId}`,
    rpcUrl: `https://test-rpc-${chainId}.example.com`,
    wsUrl: `wss://test-ws-${chainId}.example.com`,
    blockExplorer: `https://explorer-${chainId}.example.com`,
    nativeCurrency: {
      name: 'Test Token',
      symbol: 'TEST',
      decimals: 18,
    },
    ...overrides,
  };
}

/**
 * Creates a mock address
 */
export function createMockAddress(seed: number = 0): Address {
  const hex = seed.toString(16).padStart(40, '0');
  return `0x${hex}` as Address;
}

/**
 * Sleep utility for tests
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Flushes all pending promises
 */
export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}
