/**
 * newHeads Subscription
 *
 * Subscribes to eth_subscribe('newHeads') once per chain.
 * On each new block, batch-fetches balances for all tracked addresses
 * via eth_getBalance.
 *
 * @module subscriptions/NewHeadsSubscription
 */

import { Address, PublicClient } from 'viem';
import {
  LiveBalanceUpdate,
  LiveBlock,
  SubscriptionEventType,
} from './types.js';
import { EventBus } from './EventBus.js';

export interface NewHeadsCallbacks {
  onBlock: (block: LiveBlock) => void;
  onBalanceUpdate: (update: LiveBalanceUpdate) => void;
  onError: (error: Error) => void;
}

export class NewHeadsSubscription {
  private trackedAddresses = new Map<number, Set<Address>>();
  private unsubscribeFns = new Map<number, () => void>();
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Start watching newHeads for a chain.
   * Registers a watchBlockNumber listener that triggers balance batch-fetch.
   */
  async subscribe(
    chainId: number,
    client: PublicClient,
    callbacks: NewHeadsCallbacks,
  ): Promise<void> {
    // Don't double-subscribe
    if (this.unsubscribeFns.has(chainId)) return;

    const unsubscribe = client.watchBlockNumber({
      onBlockNumber: async (blockNumber) => {
        try {
          // Fetch block details for the LiveBlock event
          const block = await client.getBlock({ blockNumber });

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

          // Batch-fetch balances for all tracked addresses on this chain
          await this.batchFetchBalances(chainId, client, blockNumber, callbacks);
        } catch (error) {
          callbacks.onError(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      },
      onError: (error) => {
        callbacks.onError(
          error instanceof Error ? error : new Error(String(error)),
        );
      },
    });

    this.unsubscribeFns.set(chainId, unsubscribe);
  }

  /**
   * Track an address for balance refresh on new blocks
   */
  trackAddress(chainId: number, address: Address): void {
    let set = this.trackedAddresses.get(chainId);
    if (!set) {
      set = new Set();
      this.trackedAddresses.set(chainId, set);
    }
    set.add(address);
  }

  /**
   * Stop tracking an address
   */
  untrackAddress(chainId: number, address: Address): void {
    const set = this.trackedAddresses.get(chainId);
    if (set) {
      set.delete(address);
      if (set.size === 0) this.trackedAddresses.delete(chainId);
    }
  }

  getTrackedAddresses(chainId: number): Address[] {
    return Array.from(this.trackedAddresses.get(chainId) ?? []);
  }

  /**
   * Unsubscribe from newHeads for a chain
   */
  unsubscribe(chainId: number): void {
    const unsub = this.unsubscribeFns.get(chainId);
    if (unsub) {
      unsub();
      this.unsubscribeFns.delete(chainId);
    }
  }

  isSubscribed(chainId: number): boolean {
    return this.unsubscribeFns.has(chainId);
  }

  destroy(): void {
    for (const unsub of this.unsubscribeFns.values()) {
      unsub();
    }
    this.unsubscribeFns.clear();
    this.trackedAddresses.clear();
  }

  // ---- Private helpers ----

  private async batchFetchBalances(
    chainId: number,
    client: PublicClient,
    blockNumber: bigint,
    callbacks: NewHeadsCallbacks,
  ): Promise<void> {
    const addresses = this.trackedAddresses.get(chainId);
    if (!addresses || addresses.size === 0) return;

    // Fetch all balances concurrently
    const results = await Promise.allSettled(
      Array.from(addresses).map(async (address) => {
        const balance = await client.getBalance({ address, blockNumber });
        return { address, balance };
      }),
    );

    const now = new Date();
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const update: LiveBalanceUpdate = {
          address: result.value.address,
          chainId,
          balance: result.value.balance,
          blockNumber,
          timestamp: now,
        };
        callbacks.onBalanceUpdate(update);
        this.eventBus.emit(
          SubscriptionEventType.LIVE_BALANCE_UPDATED,
          chainId,
          update,
        );
      }
      // Silently skip failed balance fetches — they'll be retried on next block
    }
  }
}
