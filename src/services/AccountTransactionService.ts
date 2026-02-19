/**
 * Account-attributed transaction service.
 *
 * Wraps IChainAdapter to provide account-attributed transaction queries
 * with address deduplication.
 *
 * @module services/AccountTransactionService
 */

import type { Address } from 'viem';
import type { Transaction } from '@cygnus-wealth/data-models';
import type { IChainAdapter, TransactionOptions } from '../types/IChainAdapter.js';
import type {
  AddressRequest,
  AccountId,
  AccountTransaction,
  AccountTransactionList,
  AccountError,
} from '../types/account.js';

interface DeduplicatedQuery {
  address: string;
  chainId: number;
  accountIds: AccountId[];
}

export class AccountTransactionService {
  private adapters: Map<number, IChainAdapter>;

  constructor(adapters: Map<number, IChainAdapter>) {
    this.adapters = adapters;
  }

  async getAccountTransactions(
    requests: AddressRequest[],
    options?: TransactionOptions,
  ): Promise<AccountTransactionList> {
    if (requests.length === 0) {
      return { transactions: [], errors: [], timestamp: new Date().toISOString() };
    }

    const queries = this.deduplicateRequests(requests);
    const transactions: AccountTransaction[] = [];
    const errors: AccountError[] = [];

    const results = await Promise.allSettled(
      queries.map(async (query) => {
        const adapter = this.adapters.get(query.chainId);
        if (!adapter) {
          throw new Error(`Chain ${query.chainId} not supported`);
        }

        try {
          const txs = await adapter.getTransactions(
            query.address as Address,
            options,
          );
          return { query, txs };
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
        const { query, txs } = result.value;
        for (const accountId of query.accountIds) {
          transactions.push({
            accountId,
            address: query.address,
            chainId: query.chainId,
            transactions: txs,
          });
        }
      } else {
        const error = result.reason;
        const query: DeduplicatedQuery = error.__query ?? queries[i];
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
      transactions,
      errors,
      timestamp: new Date().toISOString(),
    };
  }

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
