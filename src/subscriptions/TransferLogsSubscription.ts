/**
 * ERC-20 Transfer Logs Subscription
 *
 * Subscribes to eth_subscribe('logs') for ERC-20 Transfer events
 * filtered to tracked addresses (from OR to).
 * Topic: keccak256('Transfer(address,address,uint256)')
 *
 * @module subscriptions/TransferLogsSubscription
 */

import { Address, PublicClient, decodeEventLog, parseAbiItem } from 'viem';
import {
  LiveTransferEvent,
  ERC20_TRANSFER_TOPIC,
  SubscriptionEventType,
} from './types.js';
import { EventBus } from './EventBus.js';

const TRANSFER_ABI = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

export interface TransferLogsCallbacks {
  onTransfer: (transfer: LiveTransferEvent) => void;
  onError: (error: Error) => void;
}

interface ChainSubscription {
  unwatch: () => void;
  tokenAddresses?: Address[];
}

export class TransferLogsSubscription {
  private trackedAddresses = new Map<number, Set<Address>>();
  private subscriptions = new Map<number, ChainSubscription>();
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Start watching Transfer logs for a chain.
   * Filters logs where from OR to matches any tracked address.
   */
  async subscribe(
    chainId: number,
    client: PublicClient,
    callbacks: TransferLogsCallbacks,
    tokenAddresses?: Address[],
  ): Promise<void> {
    if (this.subscriptions.has(chainId)) return;

    const addresses = this.trackedAddresses.get(chainId);
    if (!addresses || addresses.size === 0) return;

    const addressList = Array.from(addresses);

    // Watch logs using viem's watchEvent
    // We subscribe to Transfer events and filter by tracked addresses
    const unwatch = client.watchEvent({
      event: TRANSFER_ABI,
      args: tokenAddresses && tokenAddresses.length > 0
        ? { from: addressList, to: addressList }
        : { from: addressList, to: addressList },
      address: tokenAddresses,
      onLogs: (logs) => {
        for (const log of logs) {
          try {
            const decoded = decodeEventLog({
              abi: [TRANSFER_ABI],
              data: log.data,
              topics: log.topics,
            });

            const transfer: LiveTransferEvent = {
              from: decoded.args.from as Address,
              to: decoded.args.to as Address,
              tokenAddress: log.address as Address,
              value: decoded.args.value as bigint,
              chainId,
              blockNumber: log.blockNumber ?? 0n,
              transactionHash: log.transactionHash ?? '',
              logIndex: log.logIndex ?? 0,
              timestamp: new Date(),
            };

            // Only emit if the address is actually tracked (from OR to)
            const fromTracked = addresses.has(transfer.from.toLowerCase() as Address);
            const toTracked = addresses.has(transfer.to.toLowerCase() as Address);
            if (fromTracked || toTracked) {
              callbacks.onTransfer(transfer);
              this.eventBus.emit(
                SubscriptionEventType.LIVE_TRANSFER_DETECTED,
                chainId,
                transfer,
              );
            }
          } catch {
            // Skip logs that can't be decoded
          }
        }
      },
      onError: (error) => {
        callbacks.onError(
          error instanceof Error ? error : new Error(String(error)),
        );
      },
    });

    this.subscriptions.set(chainId, { unwatch, tokenAddresses });
  }

  /**
   * Resubscribe with updated address list.
   * Called when tracked addresses change.
   */
  async resubscribe(
    chainId: number,
    client: PublicClient,
    callbacks: TransferLogsCallbacks,
  ): Promise<void> {
    const existing = this.subscriptions.get(chainId);
    if (existing) {
      existing.unwatch();
      this.subscriptions.delete(chainId);
    }
    await this.subscribe(chainId, client, callbacks, existing?.tokenAddresses);
  }

  trackAddress(chainId: number, address: Address): void {
    let set = this.trackedAddresses.get(chainId);
    if (!set) {
      set = new Set();
      this.trackedAddresses.set(chainId, set);
    }
    set.add(address.toLowerCase() as Address);
  }

  untrackAddress(chainId: number, address: Address): void {
    const set = this.trackedAddresses.get(chainId);
    if (set) {
      set.delete(address.toLowerCase() as Address);
      if (set.size === 0) this.trackedAddresses.delete(chainId);
    }
  }

  getTrackedAddresses(chainId: number): Address[] {
    return Array.from(this.trackedAddresses.get(chainId) ?? []);
  }

  unsubscribe(chainId: number): void {
    const sub = this.subscriptions.get(chainId);
    if (sub) {
      sub.unwatch();
      this.subscriptions.delete(chainId);
    }
  }

  isSubscribed(chainId: number): boolean {
    return this.subscriptions.has(chainId);
  }

  destroy(): void {
    for (const sub of this.subscriptions.values()) {
      sub.unwatch();
    }
    this.subscriptions.clear();
    this.trackedAddresses.clear();
  }
}
