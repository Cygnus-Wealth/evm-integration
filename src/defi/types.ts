import { Address } from 'viem';
import {
  LendingPosition,
  StakedPosition,
  LiquidityPosition,
} from '@cygnus-wealth/data-models';

/**
 * Aggregated DeFi positions for a wallet on a single chain
 */
export interface DeFiPositions {
  lendingPositions: LendingPosition[];
  stakedPositions: StakedPosition[];
  liquidityPositions: LiquidityPosition[];
}

/**
 * Multi-chain DeFi positions result
 */
export interface MultiChainDeFiPositions {
  positions: Map<number, DeFiPositions>;
  errors: Map<number, Error>;
}

/**
 * Configuration for DeFiService
 */
export interface DeFiServiceConfig {
  enableCache: boolean;
  cacheTTL: number;
  enableCircuitBreaker: boolean;
  failureThreshold: number;
  circuitTimeout: number;
  enableRetry: boolean;
  maxRetries: number;
  retryDelay: number;
}

/**
 * Interface for DeFi protocol adapters.
 *
 * Each protocol (Beefy, Aave, etc.) implements this interface to provide
 * read-only access to user DeFi positions.
 */
export interface IDeFiProtocol {
  /** Human-readable protocol name */
  readonly protocolName: string;

  /** Chain IDs this protocol supports */
  readonly supportedChains: number[];

  /**
   * Returns true if this protocol supports the given chain
   */
  supportsChain(chainId: number): boolean;

  /**
   * Fetches lending positions (supply/borrow) for an address on a chain.
   * Returns empty array if protocol has no lending on this chain.
   */
  getLendingPositions(address: Address, chainId: number): Promise<LendingPosition[]>;

  /**
   * Fetches staked positions (vault deposits, staking) for an address on a chain.
   * Returns empty array if protocol has no staking on this chain.
   */
  getStakedPositions(address: Address, chainId: number): Promise<StakedPosition[]>;

  /**
   * Fetches liquidity positions (LP tokens, pool shares) for an address on a chain.
   * Returns empty array if protocol has no liquidity pools on this chain.
   */
  getLiquidityPositions(address: Address, chainId: number): Promise<LiquidityPosition[]>;
}
