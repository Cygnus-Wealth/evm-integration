/**
 * PollManager — HTTP Polling Fallback
 *
 * When WebSocket fails after max retries, falls back to periodic HTTP polling.
 * Continuously attempts WS recovery every 60s while polling.
 * Emits the same events as the WS path (transport-agnostic).
 *
 * @module subscriptions/PollManager
 */

import { Address, PublicClient, parseAbiItem, decodeEventLog } from 'viem';
import {
  PollManagerConfig,
  DEFAULT_POLL_CONFIG,
  LiveBalanceUpdate,
  LiveBlock,
  LiveTransferEvent,
  SubscriptionEventType,
} from './types.js';
import { EventBus } from './EventBus.js';
import { WebSocketConnectionManager } from './WebSocketConnectionManager.js';

const TRANSFER_ABI = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

interface PollState {
  chainId: number;
  client: PublicClient;
  lastBlockNumber: bigint | null;
  pollTimer: ReturnType<typeof setInterval>;
  wsRecoveryTimer: ReturnType<typeof setInterval>;
  trackedAddresses: Set<Address>;
  trackTransfers: boolean;
}

export interface PollCallbacks {
  onBlock: (block: LiveBlock) => void;
  onBalanceUpdate: (update: LiveBalanceUpdate) => void;
  onTransfer: (transfer: LiveTransferEvent) => void;
  onError: (error: Error) => void;
  onWsRecovered: (chainId: number) => void;
}

export class PollManager {
  private polls = new Map<number, PollState>();
  private config: PollManagerConfig;
  private eventBus: EventBus;
  private connectionManager: WebSocketConnectionManager;

  constructor(
    eventBus: EventBus,
    connectionManager: WebSocketConnectionManager,
    config?: Partial<PollManagerConfig>,
  ) {
    this.eventBus = eventBus;
    this.connectionManager = connectionManager;
    this.config = { ...DEFAULT_POLL_CONFIG, ...config };
  }

  /**
   * Start polling for a chain.
   * Called when WS connection fails after max retries.
   */
  startPolling(
    chainId: number,
    client: PublicClient,
    trackedAddresses: Address[],
    callbacks: PollCallbacks,
    trackTransfers: boolean = true,
  ): void {
    // Don't double-poll
    if (this.polls.has(chainId)) return;

    const state: PollState = {
      chainId,
      client,
      lastBlockNumber: null,
      trackedAddresses: new Set(trackedAddresses.map(a => a.toLowerCase() as Address)),
      trackTransfers,
      pollTimer: setInterval(
        () => this.poll(chainId, callbacks),
        this.config.defaultPollIntervalMs,
      ),
      wsRecoveryTimer: setInterval(
        () => this.attemptWsRecovery(chainId, callbacks),
        this.config.wsRecoveryIntervalMs,
      ),
    };

    this.polls.set(chainId, state);

    // Immediate first poll
    this.poll(chainId, callbacks);
  }

  stopPolling(chainId: number): void {
    const state = this.polls.get(chainId);
    if (!state) return;

    clearInterval(state.pollTimer);
    clearInterval(state.wsRecoveryTimer);
    this.polls.delete(chainId);
  }

  addTrackedAddress(chainId: number, address: Address): void {
    const state = this.polls.get(chainId);
    if (state) {
      state.trackedAddresses.add(address.toLowerCase() as Address);
    }
  }

  removeTrackedAddress(chainId: number, address: Address): void {
    const state = this.polls.get(chainId);
    if (state) {
      state.trackedAddresses.delete(address.toLowerCase() as Address);
    }
  }

  isPolling(chainId: number): boolean {
    return this.polls.has(chainId);
  }

  destroy(): void {
    for (const state of this.polls.values()) {
      clearInterval(state.pollTimer);
      clearInterval(state.wsRecoveryTimer);
    }
    this.polls.clear();
  }

  // ---- Private helpers ----

  private async poll(chainId: number, callbacks: PollCallbacks): Promise<void> {
    const state = this.polls.get(chainId);
    if (!state) return;

    try {
      const currentBlock = await state.client.getBlockNumber();

      if (state.lastBlockNumber === null) {
        state.lastBlockNumber = currentBlock;
        // Fetch initial balances
        await this.fetchBalances(state, currentBlock, callbacks);
        return;
      }

      if (currentBlock <= state.lastBlockNumber) return;

      // Process new blocks
      for (let blockNum = state.lastBlockNumber + 1n; blockNum <= currentBlock; blockNum++) {
        const block = await state.client.getBlock({ blockNumber: blockNum });

        const liveBlock: LiveBlock = {
          chainId,
          number: block.number,
          hash: block.hash,
          parentHash: block.parentHash,
          timestamp: block.timestamp,
          gasUsed: block.gasUsed,
          gasLimit: block.gasLimit,
          baseFeePerGas: block.baseFeePerGas ?? undefined,
          transactionCount: block.transactions.length,
        };

        callbacks.onBlock(liveBlock);
        this.eventBus.emit(
          SubscriptionEventType.LIVE_BLOCK_RECEIVED,
          chainId,
          liveBlock,
        );

        // Fetch Transfer logs for this block range if tracking transfers
        if (state.trackTransfers && state.trackedAddresses.size > 0) {
          await this.fetchTransferLogs(state, blockNum, blockNum, callbacks);
        }
      }

      // Batch-fetch updated balances at latest block
      await this.fetchBalances(state, currentBlock, callbacks);
      state.lastBlockNumber = currentBlock;
    } catch (error) {
      callbacks.onError(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  private async fetchBalances(
    state: PollState,
    blockNumber: bigint,
    callbacks: PollCallbacks,
  ): Promise<void> {
    if (state.trackedAddresses.size === 0) return;

    const results = await Promise.allSettled(
      Array.from(state.trackedAddresses).map(async (address) => {
        const balance = await state.client.getBalance({ address, blockNumber });
        return { address, balance };
      }),
    );

    const now = new Date();
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const update: LiveBalanceUpdate = {
          address: result.value.address,
          chainId: state.chainId,
          balance: result.value.balance,
          blockNumber,
          timestamp: now,
        };
        callbacks.onBalanceUpdate(update);
        this.eventBus.emit(
          SubscriptionEventType.LIVE_BALANCE_UPDATED,
          state.chainId,
          update,
        );
      }
    }
  }

  private async fetchTransferLogs(
    state: PollState,
    fromBlock: bigint,
    toBlock: bigint,
    callbacks: PollCallbacks,
  ): Promise<void> {
    const addressList = Array.from(state.trackedAddresses);

    try {
      const logs = await state.client.getLogs({
        event: TRANSFER_ABI,
        fromBlock,
        toBlock,
      });

      for (const log of logs) {
        try {
          const decoded = decodeEventLog({
            abi: [TRANSFER_ABI],
            data: log.data,
            topics: log.topics,
          });

          const from = (decoded.args.from as string).toLowerCase() as Address;
          const to = (decoded.args.to as string).toLowerCase() as Address;

          if (state.trackedAddresses.has(from) || state.trackedAddresses.has(to)) {
            const transfer: LiveTransferEvent = {
              from: decoded.args.from as Address,
              to: decoded.args.to as Address,
              tokenAddress: log.address as Address,
              value: decoded.args.value as bigint,
              chainId: state.chainId,
              blockNumber: log.blockNumber ?? 0n,
              transactionHash: log.transactionHash ?? '',
              logIndex: log.logIndex ?? 0,
              timestamp: new Date(),
            };

            callbacks.onTransfer(transfer);
            this.eventBus.emit(
              SubscriptionEventType.LIVE_TRANSFER_DETECTED,
              state.chainId,
              transfer,
            );
          }
        } catch {
          // Skip un-decodable logs
        }
      }
    } catch {
      // Log fetch failures are non-fatal; will retry on next poll
    }
  }

  private async attemptWsRecovery(
    chainId: number,
    callbacks: PollCallbacks,
  ): Promise<void> {
    try {
      const { transport } = await this.connectionManager.connect(chainId);
      if (transport === 'websocket') {
        // WS recovered — stop polling
        this.stopPolling(chainId);
        this.eventBus.emit(
          SubscriptionEventType.TRANSPORT_RESTORED_TO_WS,
          chainId,
          { recoveredAt: new Date() },
        );
        callbacks.onWsRecovered(chainId);
      }
    } catch {
      // WS still unavailable — keep polling
    }
  }
}
