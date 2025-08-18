/**
 * Branded types for improved type safety
 * These types prevent accidental mixing of primitive values
 */

declare const brand: unique symbol;

/**
 * Brand type helper
 * Creates a nominal type from a base type
 */
export type Brand<T, TBrand extends string> = T & { [brand]: TBrand };

/**
 * Chain ID branded type
 * Ensures chain IDs are not confused with regular numbers
 */
export type ChainId = Brand<number, 'ChainId'>;

/**
 * Creates a ChainId from a number
 */
export const toChainId = (id: number): ChainId => {
  if (id <= 0 || !Number.isInteger(id)) {
    throw new Error(`Invalid chain ID: ${id}`);
  }
  return id as ChainId;
};

/**
 * Block number branded type
 */
export type BlockNumber = Brand<bigint, 'BlockNumber'>;

/**
 * Creates a BlockNumber from a bigint
 */
export const toBlockNumber = (block: bigint): BlockNumber => {
  if (block < 0n) {
    throw new Error(`Invalid block number: ${block}`);
  }
  return block as BlockNumber;
};

/**
 * Transaction hash branded type
 */
export type TransactionHash = Brand<string, 'TransactionHash'>;

/**
 * Creates a TransactionHash from a string
 */
export const toTransactionHash = (hash: string): TransactionHash => {
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    throw new Error(`Invalid transaction hash: ${hash}`);
  }
  return hash as TransactionHash;
};

/**
 * Wei amount branded type
 */
export type Wei = Brand<bigint, 'Wei'>;

/**
 * Creates a Wei amount from a bigint
 */
export const toWei = (amount: bigint): Wei => {
  if (amount < 0n) {
    throw new Error(`Invalid wei amount: ${amount}`);
  }
  return amount as Wei;
};

/**
 * Timestamp branded type (milliseconds)
 */
export type Timestamp = Brand<number, 'Timestamp'>;

/**
 * Creates a Timestamp from a number
 */
export const toTimestamp = (ms: number): Timestamp => {
  if (ms < 0 || !Number.isInteger(ms)) {
    throw new Error(`Invalid timestamp: ${ms}`);
  }
  return ms as Timestamp;
};

/**
 * Token address branded type
 */
export type TokenAddress = Brand<string, 'TokenAddress'>;

/**
 * Creates a TokenAddress from a string
 */
export const toTokenAddress = (address: string): TokenAddress => {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`Invalid token address: ${address}`);
  }
  return address as TokenAddress;
};

/**
 * Asset ID branded type
 */
export type AssetId = Brand<string, 'AssetId'>;

/**
 * Creates an AssetId from chain and address
 */
export const toAssetId = (chainId: ChainId, address?: string): AssetId => {
  return address 
    ? `${chainId}:${address}` as AssetId
    : `${chainId}:native` as AssetId;
};

/**
 * Type guards for branded types
 */
export const isChainId = (value: unknown): value is ChainId => {
  return typeof value === 'number' && value > 0 && Number.isInteger(value);
};

export const isBlockNumber = (value: unknown): value is BlockNumber => {
  return typeof value === 'bigint' && value >= 0n;
};

export const isTransactionHash = (value: unknown): value is TransactionHash => {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value);
};

export const isWei = (value: unknown): value is Wei => {
  return typeof value === 'bigint' && value >= 0n;
};

export const isTimestamp = (value: unknown): value is Timestamp => {
  return typeof value === 'number' && value >= 0 && Number.isInteger(value);
};

export const isTokenAddress = (value: unknown): value is TokenAddress => {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
};

export const isAssetId = (value: unknown): value is AssetId => {
  return typeof value === 'string' && /^\d+:(0x[a-fA-F0-9]{40}|native)$/.test(value);
};