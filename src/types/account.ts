/**
 * Account-attributed types for multi-wallet multi-account architecture.
 *
 * Phase 3 of en-fr0z: All query results carry accountId for attribution
 * back to the originating account. AddressRequest replaces plain string[]
 * addresses to enable per-account chain scoping and address deduplication.
 *
 * @module types/account
 */

import type { Balance, Transaction, LendingPosition, StakedPosition, LiquidityPosition, NFT } from '@cygnus-wealth/data-models';

// ============================================================================
// IDENTITY TYPES
// ============================================================================

/**
 * Unique identifier for a specific account across the system.
 *
 * Format: `{walletConnectionId}:{checksummedAddress}` for connected accounts
 * or `watch:{checksummedAddress}` for watch addresses.
 *
 * @example 'metamask:a1b2c3d4:0xAbC...123'
 * @example 'watch:0xAbC...123'
 */
export type AccountId = string & { readonly __brand: 'AccountId' };

// ============================================================================
// REQUEST TYPES
// ============================================================================

/**
 * Account-scoped address query request.
 *
 * Replaces plain string[] addresses in all service methods.
 * Enables attribution, per-account chain scoping, and address deduplication.
 */
export interface AddressRequest {
  /** Account identifier for result attribution */
  accountId: AccountId;
  /** Checksummed EVM address */
  address: string;
  /** Chains to query for this address */
  chainScope: number[];
}

// ============================================================================
// RESULT TYPES — BALANCES
// ============================================================================

/**
 * Balance result attributed to a specific account on a specific chain.
 */
export interface AccountBalance {
  accountId: AccountId;
  address: string;
  chainId: number;
  nativeBalance: Balance;
  tokenBalances: Balance[];
}

/**
 * Aggregated account-attributed balance results with partial failure support.
 */
export interface AccountBalanceList {
  balances: AccountBalance[];
  errors: AccountError[];
  timestamp: string;
}

// ============================================================================
// RESULT TYPES — TRANSACTIONS
// ============================================================================

/**
 * Transaction results attributed to a specific account on a specific chain.
 */
export interface AccountTransaction {
  accountId: AccountId;
  address: string;
  chainId: number;
  transactions: Transaction[];
}

/**
 * Aggregated account-attributed transaction results.
 */
export interface AccountTransactionList {
  transactions: AccountTransaction[];
  errors: AccountError[];
  timestamp: string;
}

// ============================================================================
// RESULT TYPES — TOKENS
// ============================================================================

/**
 * Token balance results attributed to a specific account on a specific chain.
 */
export interface AccountTokenBalance {
  accountId: AccountId;
  address: string;
  chainId: number;
  tokenBalances: Balance[];
}

/**
 * Aggregated account-attributed token results.
 */
export interface AccountTokenList {
  tokens: AccountTokenBalance[];
  errors: AccountError[];
  timestamp: string;
}

// ============================================================================
// RESULT TYPES — NFTs
// ============================================================================

/**
 * NFT results attributed to a specific account on a specific chain.
 */
export interface AccountNFT {
  accountId: AccountId;
  address: string;
  chainId: number;
  nfts: NFT[];
}

/**
 * Aggregated account-attributed NFT results.
 */
export interface AccountNFTList {
  nfts: AccountNFT[];
  errors: AccountError[];
  timestamp: string;
}

// ============================================================================
// RESULT TYPES — DEFI POSITIONS
// ============================================================================

/**
 * DeFi position results attributed to a specific account on a specific chain.
 */
export interface AccountDeFiPosition {
  accountId: AccountId;
  address: string;
  chainId: number;
  lendingPositions: LendingPosition[];
  stakedPositions: StakedPosition[];
  liquidityPositions: LiquidityPosition[];
}

/**
 * Aggregated account-attributed DeFi position results.
 */
export interface AccountDeFiPositionList {
  positions: AccountDeFiPosition[];
  errors: AccountError[];
  timestamp: string;
}

// ============================================================================
// ERROR TYPE
// ============================================================================

/**
 * Per-account error for partial failure reporting.
 */
export interface AccountError {
  accountId: AccountId;
  address: string;
  chainId: number;
  error: string;
  code?: string;
}
