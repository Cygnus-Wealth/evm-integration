/**
 * Account-attributed subscription service.
 *
 * Wraps ISubscriptionService to add accountId attribution to subscription events.
 * When a balance update fires for an address, it resolves all accountIds that
 * reference that address and includes them in the event payload.
 *
 * @module subscriptions/AccountSubscriptionService
 */

import type { Address } from 'viem';
import type {
  ISubscriptionService,
  SubscriptionHandle,
  LiveBalanceUpdate,
} from './types.js';
import type { AddressRequest, AccountId } from '../types/account.js';

/**
 * LiveBalanceUpdate enriched with account attribution.
 */
export interface AccountLiveBalanceUpdate extends LiveBalanceUpdate {
  accountIds: AccountId[];
}

/**
 * Composite subscription handle that manages multiple chain subscriptions.
 */
export interface AccountSubscriptionHandle {
  id: string;
  onData: (callback: (data: AccountLiveBalanceUpdate) => void) => void;
  onError: (callback: (error: Error) => void) => void;
  unsubscribe: () => void;
}

let nextAccountSubId = 1;

export class AccountSubscriptionService {
  private subscriptionService: ISubscriptionService;

  constructor(subscriptionService: ISubscriptionService) {
    this.subscriptionService = subscriptionService;
  }

  /**
   * Subscribes to balance updates for the given AddressRequests.
   *
   * Deduplicates addresses per chain, creates one underlying subscription per chain,
   * and enriches events with the accountIds for the updated address.
   */
  subscribeAccountBalances(requests: AddressRequest[]): AccountSubscriptionHandle {
    const id = `account-sub-${nextAccountSubId++}`;
    const dataCallbacks = new Set<(data: AccountLiveBalanceUpdate) => void>();
    const errorCallbacks = new Set<(error: Error) => void>();
    const innerHandles: SubscriptionHandle<LiveBalanceUpdate>[] = [];

    // Build address→accountIds mapping per chain
    const chainMap = new Map<number, Map<string, AccountId[]>>();
    for (const request of requests) {
      for (const chainId of request.chainScope) {
        if (!chainMap.has(chainId)) {
          chainMap.set(chainId, new Map());
        }
        const addrMap = chainMap.get(chainId)!;
        const addrKey = request.address.toLowerCase();
        if (!addrMap.has(addrKey)) {
          addrMap.set(addrKey, []);
        }
        addrMap.get(addrKey)!.push(request.accountId);
      }
    }

    // Create one subscription per chain with deduplicated addresses
    for (const [chainId, addrMap] of chainMap) {
      const addresses = Array.from(addrMap.keys()) as Address[];
      const handle = this.subscriptionService.subscribeBalances(chainId, addresses);

      handle.onData((update: LiveBalanceUpdate) => {
        const addrKey = update.address.toLowerCase();
        const accountIds = addrMap.get(addrKey) ?? [];

        const enriched: AccountLiveBalanceUpdate = {
          ...update,
          accountIds,
        };

        for (const cb of dataCallbacks) {
          try { cb(enriched); } catch { /* swallow */ }
        }
      });

      handle.onError((error: Error) => {
        for (const cb of errorCallbacks) {
          try { cb(error); } catch { /* swallow */ }
        }
      });

      innerHandles.push(handle);
    }

    return {
      id,
      onData: (cb) => { dataCallbacks.add(cb); },
      onError: (cb) => { errorCallbacks.add(cb); },
      unsubscribe: () => {
        for (const handle of innerHandles) {
          handle.unsubscribe();
        }
        dataCallbacks.clear();
        errorCallbacks.clear();
      },
    };
  }
}
