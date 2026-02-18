/**
 * Subscription service types
 *
 * Defines all interfaces for the WebSocket subscription infrastructure:
 * connection management, subscription handles, service API, and configuration.
 *
 * @module subscriptions/types
 */

import { Address, Log } from 'viem';

// ============================================================================
// DOMAIN EVENTS
// ============================================================================

export enum SubscriptionEventType {
  // WebSocket lifecycle
  WEBSOCKET_CONNECTED = 'WEBSOCKET_CONNECTED',
  WEBSOCKET_DISCONNECTED = 'WEBSOCKET_DISCONNECTED',
  WEBSOCKET_RECONNECTING = 'WEBSOCKET_RECONNECTING',
  WEBSOCKET_FAILED = 'WEBSOCKET_FAILED',

  // Subscription lifecycle
  SUBSCRIPTION_CREATED = 'SUBSCRIPTION_CREATED',
  SUBSCRIPTION_REMOVED = 'SUBSCRIPTION_REMOVED',

  // Transport
  TRANSPORT_FALLBACK_TO_POLLING = 'TRANSPORT_FALLBACK_TO_POLLING',
  TRANSPORT_RESTORED_TO_WS = 'TRANSPORT_RESTORED_TO_WS',

  // Live data
  LIVE_BALANCE_UPDATED = 'LIVE_BALANCE_UPDATED',
  LIVE_TRANSFER_DETECTED = 'LIVE_TRANSFER_DETECTED',
  LIVE_BLOCK_RECEIVED = 'LIVE_BLOCK_RECEIVED',
}

export interface SubscriptionEvent<T = unknown> {
  type: SubscriptionEventType;
  chainId: number;
  timestamp: Date;
  data: T;
}

// ============================================================================
// CONNECTION TYPES
// ============================================================================

export type TransportType = 'websocket' | 'polling';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

export interface ConnectionInfo {
  chainId: number;
  provider: string;
  status: ConnectionStatus;
  transport: TransportType;
  url: string;
  connectedAt?: Date;
  lastError?: string;
  reconnectAttempts: number;
}

export interface ConnectionPoolKey {
  chainId: number;
  provider: string;
}

// ============================================================================
// SUBSCRIPTION TYPES
// ============================================================================

export type SubscriptionType =
  | 'balances'
  | 'tokenTransfers'
  | 'newBlocks'
  | 'pendingTransactions'
  | 'contractEvents';

export type SubscriptionStatus = 'active' | 'paused' | 'error' | 'closed';

export interface SubscriptionHandle<T = unknown> {
  id: string;
  type: SubscriptionType;
  chainId: number;
  status: SubscriptionStatus;
  transport: TransportType;
  createdAt: Date;
  onData: (callback: (data: T) => void) => void;
  onError: (callback: (error: Error) => void) => void;
  onStatusChange: (callback: (status: SubscriptionStatus) => void) => void;
  unsubscribe: () => void;
}

export interface SubscriptionInfo {
  id: string;
  type: SubscriptionType;
  chainId: number;
  status: SubscriptionStatus;
  transport: TransportType;
  createdAt: Date;
  addresses?: Address[];
}

// ============================================================================
// LIVE DATA TYPES
// ============================================================================

export interface LiveBalanceUpdate {
  address: Address;
  chainId: number;
  balance: bigint;
  blockNumber: bigint;
  timestamp: Date;
}

export interface LiveTransferEvent {
  from: Address;
  to: Address;
  tokenAddress: Address;
  value: bigint;
  chainId: number;
  blockNumber: bigint;
  transactionHash: string;
  logIndex: number;
  timestamp: Date;
}

export interface LiveBlock {
  chainId: number;
  number: bigint;
  hash: string;
  parentHash: string;
  timestamp: bigint;
  gasUsed: bigint;
  gasLimit: bigint;
  baseFeePerGas?: bigint;
  transactionCount: number;
}

export interface LivePendingTransaction {
  hash: string;
  from: Address;
  to: Address | null;
  value: bigint;
  chainId: number;
  timestamp: Date;
}

export interface LiveContractEvent {
  chainId: number;
  contractAddress: Address;
  eventName: string;
  log: Log;
  blockNumber: bigint;
  transactionHash: string;
  timestamp: Date;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface WebSocketConnectionConfig {
  /** Base delay for exponential backoff (ms) @default 1000 */
  reconnectBaseDelayMs: number;
  /** Maximum reconnection delay (ms) @default 30000 */
  reconnectMaxDelayMs: number;
  /** Maximum reconnection attempts @default 10 */
  maxReconnectAttempts: number;
  /** Heartbeat ping interval (ms) @default 30000 */
  heartbeatIntervalMs: number;
  /** Pong response timeout (ms) @default 5000 */
  pongTimeoutMs: number;
  /** Connection establishment timeout (ms) @default 10000 */
  connectionTimeoutMs: number;
}

export interface PollManagerConfig {
  /** Default polling interval when WS unavailable (ms) @default 30000 */
  defaultPollIntervalMs: number;
  /** Interval to attempt WS recovery while polling (ms) @default 60000 */
  wsRecoveryIntervalMs: number;
}

export interface SubscriptionServiceConfig {
  /** WebSocket connection settings */
  connection: WebSocketConnectionConfig;
  /** Polling fallback settings */
  polling: PollManagerConfig;
  /** Maximum concurrent subscriptions per chain @default 50 */
  maxSubscriptionsPerChain: number;
}

export const DEFAULT_WS_CONNECTION_CONFIG: WebSocketConnectionConfig = {
  reconnectBaseDelayMs: 1_000,
  reconnectMaxDelayMs: 30_000,
  maxReconnectAttempts: 10,
  heartbeatIntervalMs: 30_000,
  pongTimeoutMs: 5_000,
  connectionTimeoutMs: 10_000,
};

export const DEFAULT_POLL_CONFIG: PollManagerConfig = {
  defaultPollIntervalMs: 30_000,
  wsRecoveryIntervalMs: 60_000,
};

export const DEFAULT_SUBSCRIPTION_CONFIG: SubscriptionServiceConfig = {
  connection: DEFAULT_WS_CONNECTION_CONFIG,
  polling: DEFAULT_POLL_CONFIG,
  maxSubscriptionsPerChain: 50,
};

// ============================================================================
// CHAIN WS ENDPOINTS
// ============================================================================

export interface ChainWsEndpoint {
  chainId: number;
  name: string;
  wsUrls: string[];
  httpUrls: string[];
}

/** ERC-20 Transfer event topic: keccak256('Transfer(address,address,uint256)') */
export const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as const;

// ============================================================================
// SERVICE INTERFACE
// ============================================================================

export interface ISubscriptionService {
  subscribeBalances(
    chainId: number,
    addresses: Address[],
  ): SubscriptionHandle<LiveBalanceUpdate>;

  subscribeTokenTransfers(
    chainId: number,
    addresses: Address[],
    tokenAddresses?: Address[],
  ): SubscriptionHandle<LiveTransferEvent>;

  subscribeNewBlocks(
    chainId: number,
  ): SubscriptionHandle<LiveBlock>;

  subscribePendingTransactions(
    chainId: number,
    addresses: Address[],
  ): SubscriptionHandle<LivePendingTransaction>;

  subscribeContractEvents(
    chainId: number,
    contractAddress: Address,
    eventTopics?: string[],
  ): SubscriptionHandle<LiveContractEvent>;

  unsubscribe(subscriptionId: string): void;

  getSubscriptionStatus(subscriptionId: string): SubscriptionInfo | undefined;

  getConnectionInfo(chainId: number): ConnectionInfo | undefined;

  getAllSubscriptions(): SubscriptionInfo[];

  destroy(): void;
}

export type EventListener = (event: SubscriptionEvent) => void;
