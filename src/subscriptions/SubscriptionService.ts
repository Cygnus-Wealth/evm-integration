/**
 * SubscriptionService
 *
 * Main entry point for real-time blockchain subscriptions.
 * Orchestrates WebSocket connections, newHeads, Transfer logs,
 * and polling fallback across all supported EVM chains.
 *
 * API:
 *   subscribeBalances, subscribeTokenTransfers, subscribeNewBlocks,
 *   subscribePendingTransactions, subscribeContractEvents,
 *   unsubscribe, getSubscriptionStatus
 *
 * @module subscriptions/SubscriptionService
 */

import { Address, PublicClient, parseAbiItem, decodeEventLog } from 'viem';
import {
  ISubscriptionService,
  SubscriptionHandle,
  SubscriptionInfo,
  SubscriptionType,
  SubscriptionStatus,
  SubscriptionServiceConfig,
  DEFAULT_SUBSCRIPTION_CONFIG,
  ConnectionInfo,
  LiveBalanceUpdate,
  LiveBlock,
  LiveTransferEvent,
  LivePendingTransaction,
  LiveContractEvent,
  SubscriptionEventType,
  TransportType,
  EventListener,
} from './types.js';
import { EventBus } from './EventBus.js';
import {
  WebSocketConnectionManager,
  DEFAULT_CHAIN_ENDPOINTS,
} from './WebSocketConnectionManager.js';
import { NewHeadsSubscription } from './NewHeadsSubscription.js';
import { TransferLogsSubscription } from './TransferLogsSubscription.js';
import { PollManager } from './PollManager.js';

let nextSubId = 1;
function generateId(): string {
  return `sub-${nextSubId++}`;
}

interface ActiveSubscription<T> {
  id: string;
  type: SubscriptionType;
  chainId: number;
  status: SubscriptionStatus;
  transport: TransportType;
  createdAt: Date;
  addresses?: Address[];
  dataCallbacks: Set<(data: T) => void>;
  errorCallbacks: Set<(error: Error) => void>;
  statusCallbacks: Set<(status: SubscriptionStatus) => void>;
  cleanup: () => void;
}

export class SubscriptionService implements ISubscriptionService {
  private config: SubscriptionServiceConfig;
  private eventBus: EventBus;
  private connectionManager: WebSocketConnectionManager;
  private newHeads: NewHeadsSubscription;
  private transferLogs: TransferLogsSubscription;
  private pollManager: PollManager;
  private subscriptions = new Map<string, ActiveSubscription<any>>();
  private destroyed = false;

  constructor(config?: Partial<SubscriptionServiceConfig>) {
    this.config = {
      connection: { ...DEFAULT_SUBSCRIPTION_CONFIG.connection, ...config?.connection },
      polling: { ...DEFAULT_SUBSCRIPTION_CONFIG.polling, ...config?.polling },
      maxSubscriptionsPerChain: config?.maxSubscriptionsPerChain ?? DEFAULT_SUBSCRIPTION_CONFIG.maxSubscriptionsPerChain,
    };

    this.eventBus = new EventBus();
    this.connectionManager = new WebSocketConnectionManager(
      this.eventBus,
      this.config.connection,
    );
    this.newHeads = new NewHeadsSubscription(this.eventBus);
    this.transferLogs = new TransferLogsSubscription(this.eventBus);
    this.pollManager = new PollManager(
      this.eventBus,
      this.connectionManager,
      this.config.polling,
    );
  }

  // ========================================================================
  // PUBLIC API
  // ========================================================================

  subscribeBalances(
    chainId: number,
    addresses: Address[],
  ): SubscriptionHandle<LiveBalanceUpdate> {
    this.assertNotDestroyed();
    const id = generateId();

    const sub = this.createSubscription<LiveBalanceUpdate>(id, 'balances', chainId, addresses);

    // Setup async (non-blocking)
    this.setupBalanceSubscription(id, chainId, addresses).catch((error) => {
      this.notifyError(id, error instanceof Error ? error : new Error(String(error)));
    });

    return this.toHandle(sub);
  }

  subscribeTokenTransfers(
    chainId: number,
    addresses: Address[],
    tokenAddresses?: Address[],
  ): SubscriptionHandle<LiveTransferEvent> {
    this.assertNotDestroyed();
    const id = generateId();

    const sub = this.createSubscription<LiveTransferEvent>(id, 'tokenTransfers', chainId, addresses);

    this.setupTransferSubscription(id, chainId, addresses, tokenAddresses).catch((error) => {
      this.notifyError(id, error instanceof Error ? error : new Error(String(error)));
    });

    return this.toHandle(sub);
  }

  subscribeNewBlocks(
    chainId: number,
  ): SubscriptionHandle<LiveBlock> {
    this.assertNotDestroyed();
    const id = generateId();

    const sub = this.createSubscription<LiveBlock>(id, 'newBlocks', chainId);

    this.setupBlockSubscription(id, chainId).catch((error) => {
      this.notifyError(id, error instanceof Error ? error : new Error(String(error)));
    });

    return this.toHandle(sub);
  }

  subscribePendingTransactions(
    chainId: number,
    addresses: Address[],
  ): SubscriptionHandle<LivePendingTransaction> {
    this.assertNotDestroyed();
    const id = generateId();

    const sub = this.createSubscription<LivePendingTransaction>(
      id, 'pendingTransactions', chainId, addresses,
    );

    this.setupPendingTxSubscription(id, chainId, addresses).catch((error) => {
      this.notifyError(id, error instanceof Error ? error : new Error(String(error)));
    });

    return this.toHandle(sub);
  }

  subscribeContractEvents(
    chainId: number,
    contractAddress: Address,
    eventTopics?: string[],
  ): SubscriptionHandle<LiveContractEvent> {
    this.assertNotDestroyed();
    const id = generateId();

    const sub = this.createSubscription<LiveContractEvent>(
      id, 'contractEvents', chainId, [contractAddress],
    );

    this.setupContractEventSubscription(id, chainId, contractAddress, eventTopics).catch((error) => {
      this.notifyError(id, error instanceof Error ? error : new Error(String(error)));
    });

    return this.toHandle(sub);
  }

  unsubscribe(subscriptionId: string): void {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return;

    sub.cleanup();
    sub.status = 'closed';
    this.notifyStatusChange(subscriptionId, 'closed');
    this.subscriptions.delete(subscriptionId);

    this.eventBus.emit(
      SubscriptionEventType.SUBSCRIPTION_REMOVED,
      sub.chainId,
      { subscriptionId, type: sub.type },
    );
  }

  getSubscriptionStatus(subscriptionId: string): SubscriptionInfo | undefined {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return undefined;
    return this.toInfo(sub);
  }

  getConnectionInfo(chainId: number): ConnectionInfo | undefined {
    return this.connectionManager.getConnectionInfo(chainId);
  }

  getAllSubscriptions(): SubscriptionInfo[] {
    return Array.from(this.subscriptions.values()).map((s) => this.toInfo(s));
  }

  /** Listen to domain events */
  on(type: SubscriptionEventType, listener: EventListener): () => void {
    return this.eventBus.on(type, listener);
  }

  /** Listen to all domain events */
  onAll(listener: EventListener): () => void {
    return this.eventBus.onAll(listener);
  }

  destroy(): void {
    this.destroyed = true;

    for (const [id] of this.subscriptions) {
      this.unsubscribe(id);
    }

    this.newHeads.destroy();
    this.transferLogs.destroy();
    this.pollManager.destroy();
    this.connectionManager.destroy();
    this.eventBus.removeAllListeners();
  }

  // ========================================================================
  // SUBSCRIPTION SETUP (async internals)
  // ========================================================================

  private async setupBalanceSubscription(
    id: string,
    chainId: number,
    addresses: Address[],
  ): Promise<void> {
    const { client, transport } = await this.connectionManager.getClient(chainId);
    const sub = this.subscriptions.get(id);
    if (!sub) return; // Already unsubscribed

    sub.transport = transport;
    this.connectionManager.incrementSubscriptionCount(chainId);

    // Track addresses in newHeads
    for (const addr of addresses) {
      this.newHeads.trackAddress(chainId, addr);
    }

    if (transport === 'websocket') {
      await this.ensureNewHeads(chainId, client);
    } else {
      this.ensurePolling(chainId, client, addresses);
    }

    sub.status = 'active';
    this.notifyStatusChange(id, 'active');

    // Wire data callbacks
    const offData = this.eventBus.on(
      SubscriptionEventType.LIVE_BALANCE_UPDATED,
      (event) => {
        const data = event.data as LiveBalanceUpdate;
        if (event.chainId === chainId && addresses.some(a => a.toLowerCase() === data.address.toLowerCase())) {
          for (const cb of sub.dataCallbacks) cb(data);
        }
      },
    );

    sub.cleanup = () => {
      offData();
      for (const addr of addresses) {
        this.newHeads.untrackAddress(chainId, addr);
      }
      this.connectionManager.decrementSubscriptionCount(chainId);
    };

    this.eventBus.emit(
      SubscriptionEventType.SUBSCRIPTION_CREATED,
      chainId,
      { subscriptionId: id, type: 'balances', addresses },
    );
  }

  private async setupTransferSubscription(
    id: string,
    chainId: number,
    addresses: Address[],
    tokenAddresses?: Address[],
  ): Promise<void> {
    const { client, transport } = await this.connectionManager.getClient(chainId);
    const sub = this.subscriptions.get(id);
    if (!sub) return;

    sub.transport = transport;
    this.connectionManager.incrementSubscriptionCount(chainId);

    for (const addr of addresses) {
      this.transferLogs.trackAddress(chainId, addr);
    }

    if (transport === 'websocket') {
      await this.transferLogs.subscribe(chainId, client, {
        onTransfer: (transfer) => {
          if (addresses.some(a =>
            a.toLowerCase() === transfer.from.toLowerCase() ||
            a.toLowerCase() === transfer.to.toLowerCase()
          )) {
            for (const cb of sub.dataCallbacks) cb(transfer);
          }
        },
        onError: (error) => this.notifyError(id, error),
      }, tokenAddresses);
    } else {
      this.ensurePolling(chainId, client, addresses, true);
    }

    sub.status = 'active';
    this.notifyStatusChange(id, 'active');

    // Also listen via event bus for polling path
    const offData = this.eventBus.on(
      SubscriptionEventType.LIVE_TRANSFER_DETECTED,
      (event) => {
        if (event.chainId !== chainId) return;
        const data = event.data as LiveTransferEvent;
        if (addresses.some(a =>
          a.toLowerCase() === data.from.toLowerCase() ||
          a.toLowerCase() === data.to.toLowerCase()
        )) {
          for (const cb of sub.dataCallbacks) cb(data);
        }
      },
    );

    sub.cleanup = () => {
      offData();
      for (const addr of addresses) {
        this.transferLogs.untrackAddress(chainId, addr);
      }
      this.transferLogs.unsubscribe(chainId);
      this.connectionManager.decrementSubscriptionCount(chainId);
    };

    this.eventBus.emit(
      SubscriptionEventType.SUBSCRIPTION_CREATED,
      chainId,
      { subscriptionId: id, type: 'tokenTransfers', addresses },
    );
  }

  private async setupBlockSubscription(
    id: string,
    chainId: number,
  ): Promise<void> {
    const { client, transport } = await this.connectionManager.getClient(chainId);
    const sub = this.subscriptions.get(id);
    if (!sub) return;

    sub.transport = transport;
    this.connectionManager.incrementSubscriptionCount(chainId);

    if (transport === 'websocket') {
      await this.ensureNewHeads(chainId, client);
    } else {
      this.ensurePolling(chainId, client, []);
    }

    sub.status = 'active';
    this.notifyStatusChange(id, 'active');

    const offData = this.eventBus.on(
      SubscriptionEventType.LIVE_BLOCK_RECEIVED,
      (event) => {
        if (event.chainId === chainId) {
          for (const cb of sub.dataCallbacks) cb(event.data as LiveBlock);
        }
      },
    );

    sub.cleanup = () => {
      offData();
      this.connectionManager.decrementSubscriptionCount(chainId);
    };

    this.eventBus.emit(
      SubscriptionEventType.SUBSCRIPTION_CREATED,
      chainId,
      { subscriptionId: id, type: 'newBlocks' },
    );
  }

  private async setupPendingTxSubscription(
    id: string,
    chainId: number,
    addresses: Address[],
  ): Promise<void> {
    const { client, transport } = await this.connectionManager.getClient(chainId);
    const sub = this.subscriptions.get(id);
    if (!sub) return;

    sub.transport = transport;
    this.connectionManager.incrementSubscriptionCount(chainId);

    if (transport === 'websocket') {
      const unwatch = client.watchPendingTransactions({
        onTransactions: async (hashes) => {
          for (const hash of hashes) {
            try {
              const tx = await client.getTransaction({ hash });
              if (!tx) continue;

              const matchesAddress = addresses.some(
                (a) => a.toLowerCase() === tx.from?.toLowerCase() || a.toLowerCase() === tx.to?.toLowerCase(),
              );
              if (!matchesAddress) continue;

              const pending: LivePendingTransaction = {
                hash: tx.hash,
                from: tx.from as Address,
                to: tx.to,
                value: tx.value,
                chainId,
                timestamp: new Date(),
              };
              for (const cb of sub.dataCallbacks) cb(pending);
            } catch {
              // Skip failed tx lookups
            }
          }
        },
      });

      sub.cleanup = () => {
        unwatch();
        this.connectionManager.decrementSubscriptionCount(chainId);
      };
    } else {
      // Pending transactions not available via polling — set paused status
      sub.status = 'paused';
      this.notifyStatusChange(id, 'paused');
      sub.cleanup = () => {
        this.connectionManager.decrementSubscriptionCount(chainId);
      };
      return;
    }

    sub.status = 'active';
    this.notifyStatusChange(id, 'active');

    this.eventBus.emit(
      SubscriptionEventType.SUBSCRIPTION_CREATED,
      chainId,
      { subscriptionId: id, type: 'pendingTransactions', addresses },
    );
  }

  private async setupContractEventSubscription(
    id: string,
    chainId: number,
    contractAddress: Address,
    eventTopics?: string[],
  ): Promise<void> {
    const { client, transport } = await this.connectionManager.getClient(chainId);
    const sub = this.subscriptions.get(id);
    if (!sub) return;

    sub.transport = transport;
    this.connectionManager.incrementSubscriptionCount(chainId);

    const unwatch = client.watchEvent({
      address: contractAddress,
      ...(eventTopics && eventTopics.length > 0 ? { topics: [eventTopics as `0x${string}`[]] } : {}),
      onLogs: (logs) => {
        for (const log of logs) {
          const event: LiveContractEvent = {
            chainId,
            contractAddress,
            eventName: log.topics[0] ?? 'unknown',
            log,
            blockNumber: log.blockNumber ?? 0n,
            transactionHash: log.transactionHash ?? '',
            timestamp: new Date(),
          };
          for (const cb of sub.dataCallbacks) cb(event);
        }
      },
      onError: (error) => {
        this.notifyError(id, error instanceof Error ? error : new Error(String(error)));
      },
    });

    sub.cleanup = () => {
      unwatch();
      this.connectionManager.decrementSubscriptionCount(chainId);
    };

    sub.status = 'active';
    this.notifyStatusChange(id, 'active');

    this.eventBus.emit(
      SubscriptionEventType.SUBSCRIPTION_CREATED,
      chainId,
      { subscriptionId: id, type: 'contractEvents', contractAddress },
    );
  }

  // ========================================================================
  // INTERNAL HELPERS
  // ========================================================================

  private async ensureNewHeads(chainId: number, client: PublicClient): Promise<void> {
    if (this.newHeads.isSubscribed(chainId)) return;

    await this.newHeads.subscribe(chainId, client, {
      onBlock: () => {},
      onBalanceUpdate: () => {},
      onError: (error) => {
        // On WS error, fall back to polling
        this.connectionManager.handleDisconnect(chainId, error);
      },
    });
  }

  private ensurePolling(
    chainId: number,
    client: PublicClient,
    addresses: Address[],
    trackTransfers: boolean = false,
  ): void {
    if (this.pollManager.isPolling(chainId)) {
      // Add new addresses to existing poll
      for (const addr of addresses) {
        this.pollManager.addTrackedAddress(chainId, addr);
      }
      return;
    }

    this.pollManager.startPolling(chainId, client, addresses, {
      onBlock: () => {},
      onBalanceUpdate: () => {},
      onTransfer: () => {},
      onError: () => {},
      onWsRecovered: async (recoveredChainId) => {
        // Re-establish WS subscriptions
        try {
          const { client: wsClient } = await this.connectionManager.getClient(recoveredChainId);
          await this.ensureNewHeads(recoveredChainId, wsClient);
        } catch {
          // Recovery failed — polling continues
        }
      },
    }, trackTransfers);
  }

  private createSubscription<T>(
    id: string,
    type: SubscriptionType,
    chainId: number,
    addresses?: Address[],
  ): ActiveSubscription<T> {
    const sub: ActiveSubscription<T> = {
      id,
      type,
      chainId,
      status: 'active',
      transport: 'websocket', // Will be updated once connected
      createdAt: new Date(),
      addresses,
      dataCallbacks: new Set(),
      errorCallbacks: new Set(),
      statusCallbacks: new Set(),
      cleanup: () => {},
    };

    this.subscriptions.set(id, sub);
    return sub;
  }

  private toHandle<T>(sub: ActiveSubscription<T>): SubscriptionHandle<T> {
    return {
      id: sub.id,
      type: sub.type,
      chainId: sub.chainId,
      get status() { return sub.status; },
      get transport() { return sub.transport; },
      createdAt: sub.createdAt,
      onData: (cb) => { sub.dataCallbacks.add(cb); },
      onError: (cb) => { sub.errorCallbacks.add(cb); },
      onStatusChange: (cb) => { sub.statusCallbacks.add(cb); },
      unsubscribe: () => this.unsubscribe(sub.id),
    };
  }

  private toInfo(sub: ActiveSubscription<any>): SubscriptionInfo {
    return {
      id: sub.id,
      type: sub.type,
      chainId: sub.chainId,
      status: sub.status,
      transport: sub.transport,
      createdAt: sub.createdAt,
      addresses: sub.addresses,
    };
  }

  private notifyError(id: string, error: Error): void {
    const sub = this.subscriptions.get(id);
    if (!sub) return;
    sub.status = 'error';
    for (const cb of sub.errorCallbacks) {
      try { cb(error); } catch { /* swallow */ }
    }
    for (const cb of sub.statusCallbacks) {
      try { cb('error'); } catch { /* swallow */ }
    }
  }

  private notifyStatusChange(id: string, status: SubscriptionStatus): void {
    const sub = this.subscriptions.get(id);
    if (!sub) return;
    for (const cb of sub.statusCallbacks) {
      try { cb(status); } catch { /* swallow */ }
    }
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error('SubscriptionService has been destroyed');
    }
  }
}
