/**
 * Chain adapter interfaces and types
 *
 * @module types/IChainAdapter
 * @see UNIT_ARCHITECTURE.md Section 4: Service Layer
 */

import { Address } from 'viem';
import { Balance, Transaction, Asset } from '@cygnus-wealth/data-models';

/**
 * Unsubscribe function type returned by subscription methods
 */
export type Unsubscribe = () => void;

/**
 * Options for filtering transaction queries
 */
export interface TransactionOptions {
  /**
   * Maximum number of transactions to return
   */
  limit?: number;

  /**
   * Starting block number (inclusive)
   */
  fromBlock?: bigint;

  /**
   * Ending block number (inclusive)
   */
  toBlock?: bigint;
}

/**
 * Chain information structure
 */
export interface ChainInfo {
  /**
   * Chain ID
   */
  id: number;

  /**
   * Human-readable chain name
   */
  name: string;

  /**
   * Native token symbol
   */
  symbol: string;

  /**
   * Native token decimals
   */
  decimals: number;

  /**
   * Block explorer URL
   */
  explorer: string;
}

/**
 * Token configuration for balance queries
 */
export interface TokenConfig {
  /**
   * Token contract address
   */
  address: Address;

  /**
   * Token symbol (optional, fetched if not provided)
   */
  symbol?: string;

  /**
   * Token decimals (optional, fetched if not provided)
   */
  decimals?: number;

  /**
   * Token name (optional, fetched if not provided)
   */
  name?: string;
}

/**
 * Standard interface for all chain adapters
 *
 * All chain-specific implementations must implement this contract.
 * Uses @cygnus-wealth/data-models types for cross-domain compatibility.
 *
 * @see EvmChainAdapter for EVM implementation
 */
export interface IChainAdapter {
  /**
   * Fetches native token balance for an address
   *
   * @param address - Wallet address to query
   * @returns Promise resolving to balance data
   * @throws ConnectionError if RPC request fails
   * @throws ValidationError if address is invalid
   */
  getBalance(address: Address): Promise<Balance>;

  /**
   * Fetches token balances for an address
   *
   * @param address - Wallet address to query
   * @param tokens - Optional token configurations (uses popular tokens if not provided)
   * @returns Promise resolving to array of token balances
   * @throws ConnectionError if RPC request fails
   * @throws ValidationError if address is invalid
   */
  getTokenBalances(address: Address, tokens?: TokenConfig[]): Promise<Balance[]>;

  /**
   * Fetches transaction history for an address
   *
   * @param address - Wallet address to query
   * @param options - Optional filtering/pagination options
   * @returns Promise resolving to array of transactions
   * @throws ConnectionError if RPC request fails
   * @throws ValidationError if address is invalid
   */
  getTransactions(address: Address, options?: TransactionOptions): Promise<Transaction[]>;

  /**
   * Subscribes to real-time balance updates
   *
   * @param address - Wallet address to monitor
   * @param callback - Function invoked when balance changes
   * @returns Promise resolving to unsubscribe function
   * @throws ConnectionError if subscription setup fails
   * @throws ValidationError if address is invalid
   */
  subscribeToBalance(
    address: Address,
    callback: (balance: Balance) => void
  ): Promise<Unsubscribe>;

  /**
   * Subscribes to real-time new transactions
   *
   * @param address - Wallet address to monitor
   * @param callback - Function invoked when new transaction detected
   * @returns Promise resolving to unsubscribe function
   * @throws ConnectionError if subscription setup fails
   * @throws ValidationError if address is invalid
   */
  subscribeToTransactions(
    address: Address,
    callback: (transaction: Transaction) => void
  ): Promise<Unsubscribe>;

  /**
   * Gets static information about the chain
   *
   * @returns Chain information
   */
  getChainInfo(): ChainInfo;

  /**
   * Checks if adapter connection is healthy
   *
   * @returns Promise resolving to true if healthy
   */
  isHealthy(): Promise<boolean>;

  /**
   * Establishes connection to the chain
   *
   * @returns Promise that resolves when connected
   * @throws ConnectionError if connection fails
   */
  connect(): Promise<void>;

  /**
   * Closes connection to the chain
   * Cleans up all subscriptions and resources
   */
  disconnect(): void;
}