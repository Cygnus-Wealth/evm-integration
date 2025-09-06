import { Address } from 'viem';
import { Balance, Transaction, Asset } from '@cygnus-wealth/data-models';

export type Unsubscribe = () => void;

export interface TransactionOptions {
  limit?: number;
  fromBlock?: bigint;
  toBlock?: bigint;
}

export interface ChainInfo {
  id: number;
  name: string;
  symbol: string;
  decimals: number;
  explorer: string;
}

export interface TokenConfig {
  address: Address;
  symbol?: string;
  decimals?: number;
  name?: string;
}

/**
 * Standard interface for all chain adapters
 * Uses @cygnus-wealth/data-models types for compatibility
 */
export interface IChainAdapter {
  // Core methods - return data-models types
  getBalance(address: Address): Promise<Balance>;
  getTokenBalances(address: Address, tokens?: TokenConfig[]): Promise<Balance[]>;
  getTransactions(address: Address, options?: TransactionOptions): Promise<Transaction[]>;
  
  // Real-time subscriptions
  subscribeToBalance(
    address: Address, 
    callback: (balance: Balance) => void
  ): Promise<Unsubscribe>;
  
  subscribeToTransactions(
    address: Address,
    callback: (transaction: Transaction) => void
  ): Promise<Unsubscribe>;
  
  // Chain info
  getChainInfo(): ChainInfo;
  isHealthy(): Promise<boolean>;
  
  // Connection management
  connect(): Promise<void>;
  disconnect(): void;
}