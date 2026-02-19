/**
 * Account-attributed balance service.
 *
 * Wraps IChainAdapter to provide account-attributed balance queries
 * with address deduplication. When multiple accountIds reference the
 * same address on the same chain, only one RPC call is made and the
 * result is fanned out to all associated accountIds.
 *
 * @module services/AccountBalanceService
 */

import type { Address } from 'viem';
import type { Balance } from '@cygnus-wealth/data-models';
import type { IChainAdapter } from '../types/IChainAdapter.js';
import type {
  AddressRequest,
  AccountId,
  AccountBalance,
  AccountBalanceList,
  AccountError,
} from '../types/account.js';

/**
 * Groups AddressRequests by unique (address, chainId) pairs and tracks
 * which accountIds map to each pair for fan-out after query.
 */
interface DeduplicatedQuery {
  address: string;
  chainId: number;
  accountIds: AccountId[];
}

export class AccountBalanceService {
  private adapters: Map<number, IChainAdapter>;

  constructor(adapters: Map<number, IChainAdapter>) {
    this.adapters = adapters;
  }

  /**
   * Fetches balances for all AddressRequests with account attribution.
   *
   * Deduplicates by (address, chainId): executes one RPC query per unique pair,
   * then fans out results to all associated accountIds.
   */
  async getAccountBalances(requests: AddressRequest[]): Promise<AccountBalanceList> {
    if (requests.length === 0) {
      return { balances: [], errors: [], timestamp: new Date().toISOString() };
    }

    const queries = this.deduplicateRequests(requests);
    const balances: AccountBalance[] = [];
    const errors: AccountError[] = [];

    // Execute all deduplicated queries in parallel
    const results = await Promise.allSettled(
      queries.map(async (query) => {
        const adapter = this.adapters.get(query.chainId);
        if (!adapter) {
          throw new Error(`Chain ${query.chainId} not supported`);
        }

        try {
          const [nativeBalance, tokenBalances] = await Promise.all([
            adapter.getBalance(query.address as Address),
            adapter.getTokenBalances(query.address as Address).catch(() => [] as Balance[]),
          ]);

          return { query, nativeBalance, tokenBalances };
        } catch (err) {
          throw Object.assign(
            err instanceof Error ? err : new Error(String(err)),
            { __query: query },
          );
        }
      }),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        const { query, nativeBalance, tokenBalances } = result.value;
        // Fan out to all accountIds that share this (address, chainId)
        for (const accountId of query.accountIds) {
          balances.push({
            accountId,
            address: query.address,
            chainId: query.chainId,
            nativeBalance,
            tokenBalances,
          });
        }
      } else {
        const error = result.reason;
        const query: DeduplicatedQuery = error.__query ?? queries[i];

        // Fan out error to all accountIds
        for (const accountId of query.accountIds) {
          errors.push({
            accountId,
            address: query.address,
            chainId: query.chainId,
            error: error.message ?? String(error),
            code: 'RPC_ERROR',
          });
        }
      }
    }

    return {
      balances,
      errors,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Batch-optimized version of getAccountBalances.
   * Uses the same deduplication logic.
   */
  async getBatchAccountBalances(requests: AddressRequest[]): Promise<AccountBalanceList> {
    return this.getAccountBalances(requests);
  }

  /**
   * Groups requests by unique (address lowercase, chainId) pairs.
   * Collects all accountIds that map to each pair.
   */
  private deduplicateRequests(requests: AddressRequest[]): DeduplicatedQuery[] {
    const queryMap = new Map<string, DeduplicatedQuery>();

    for (const request of requests) {
      for (const chainId of request.chainScope) {
        const key = `${request.address.toLowerCase()}:${chainId}`;
        const existing = queryMap.get(key);
        if (existing) {
          existing.accountIds.push(request.accountId);
        } else {
          queryMap.set(key, {
            address: request.address,
            chainId,
            accountIds: [request.accountId],
          });
        }
      }
    }

    return Array.from(queryMap.values());
  }
}
