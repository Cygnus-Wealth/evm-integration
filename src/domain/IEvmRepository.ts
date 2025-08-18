import { WalletAddress } from './blockchain/Address';
import { EvmChain } from './blockchain/Chain';
import { Portfolio } from './portfolio/Portfolio';
import type { Asset, Transaction } from '@cygnus-wealth/data-models';

/**
 * Repository interface for EVM blockchain interactions
 * Defines the contract for infrastructure implementations
 */
export interface IEvmRepository {
  /**
   * Gets the portfolio for a wallet address on a specific chain
   */
  getPortfolio(address: WalletAddress, chain: EvmChain): Promise<Portfolio>;

  /**
   * Gets the native token balance
   */
  getNativeBalance(address: WalletAddress, chain: EvmChain): Promise<bigint>;

  /**
   * Gets token balances for specific tokens
   */
  getTokenBalances(
    address: WalletAddress, 
    chain: EvmChain, 
    tokens: Asset[]
  ): Promise<Map<string, bigint>>;

  /**
   * Gets transaction history
   */
  getTransactions(
    address: WalletAddress,
    chain: EvmChain,
    limit?: number
  ): Promise<Transaction[]>;

  /**
   * Subscribes to balance updates
   */
  subscribeToBalances(
    address: WalletAddress,
    chain: EvmChain,
    callback: (portfolio: Portfolio) => void
  ): () => void;
}

/**
 * Repository error for blockchain-related failures
 */
export class RepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export class RpcUnavailableError extends RepositoryError {
  constructor(chain: EvmChain, cause?: Error) {
    super(
      `RPC unavailable for ${chain.name}`,
      'RPC_UNAVAILABLE',
      cause
    );
  }
}

export class InsufficientDataError extends RepositoryError {
  constructor(message: string) {
    super(message, 'INSUFFICIENT_DATA');
  }
}