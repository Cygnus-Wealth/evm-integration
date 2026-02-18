/**
 * Subscription infrastructure barrel export
 * @module subscriptions
 */

export { SubscriptionService } from './SubscriptionService.js';
export { WebSocketConnectionManager, DEFAULT_CHAIN_ENDPOINTS } from './WebSocketConnectionManager.js';
export { NewHeadsSubscription } from './NewHeadsSubscription.js';
export { TransferLogsSubscription } from './TransferLogsSubscription.js';
export { PollManager } from './PollManager.js';
export { EventBus } from './EventBus.js';

export type {
  ISubscriptionService,
  SubscriptionHandle,
  SubscriptionInfo,
  SubscriptionType,
  SubscriptionStatus,
  SubscriptionServiceConfig,
  WebSocketConnectionConfig,
  PollManagerConfig,
  ConnectionInfo,
  ConnectionStatus,
  TransportType,
  LiveBalanceUpdate,
  LiveTransferEvent,
  LiveBlock,
  LivePendingTransaction,
  LiveContractEvent,
  SubscriptionEvent,
  EventListener,
  ChainWsEndpoint,
} from './types.js';

export {
  SubscriptionEventType,
  ERC20_TRANSFER_TOPIC,
  DEFAULT_WS_CONNECTION_CONFIG,
  DEFAULT_POLL_CONFIG,
  DEFAULT_SUBSCRIPTION_CONFIG,
} from './types.js';
