/**
 * Account-attributed DeFi positions service.
 *
 * Wraps IDeFiProtocol[] to provide account-attributed DeFi position queries
 * with address deduplication.
 *
 * @module services/AccountDeFiService
 */

import type { Address } from 'viem';
import type { IDeFiProtocol, DeFiPositions } from '../defi/types.js';
import type {
  AddressRequest,
  AccountId,
  AccountDeFiPosition,
  AccountDeFiPositionList,
  AccountError,
} from '../types/account.js';

interface DeduplicatedQuery {
  address: string;
  chainId: number;
  accountIds: AccountId[];
}

export class AccountDeFiService {
  private protocols: IDeFiProtocol[];

  constructor(protocols: IDeFiProtocol[]) {
    this.protocols = protocols;
  }

  async getAccountPositions(requests: AddressRequest[]): Promise<AccountDeFiPositionList> {
    if (requests.length === 0) {
      return { positions: [], errors: [], timestamp: new Date().toISOString() };
    }

    const queries = this.deduplicateRequests(requests);
    const positions: AccountDeFiPosition[] = [];
    const errors: AccountError[] = [];

    const results = await Promise.allSettled(
      queries.map(async (query) => {
        try {
          const defiPositions = await this.fetchPositions(query.address, query.chainId);
          return { query, defiPositions };
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
        const { query, defiPositions } = result.value;
        for (const accountId of query.accountIds) {
          positions.push({
            accountId,
            address: query.address,
            chainId: query.chainId,
            ...defiPositions,
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
            code: 'DEFI_ERROR',
          });
        }
      }
    }

    return {
      positions,
      errors,
      timestamp: new Date().toISOString(),
    };
  }

  private async fetchPositions(address: string, chainId: number): Promise<DeFiPositions> {
    const applicableProtocols = this.protocols.filter(p => p.supportsChain(chainId));

    const result: DeFiPositions = {
      lendingPositions: [],
      stakedPositions: [],
      liquidityPositions: [],
    };

    const protocolResults = await Promise.allSettled(
      applicableProtocols.map(async (protocol) => {
        const [lending, staked, liquidity] = await Promise.all([
          protocol.getLendingPositions(address as Address, chainId),
          protocol.getStakedPositions(address as Address, chainId),
          protocol.getLiquidityPositions(address as Address, chainId),
        ]);
        return { lending, staked, liquidity };
      }),
    );

    let hasAnySuccess = applicableProtocols.length === 0; // empty = success (no protocols for this chain)
    for (const res of protocolResults) {
      if (res.status === 'fulfilled') {
        hasAnySuccess = true;
        result.lendingPositions.push(...res.value.lending);
        result.stakedPositions.push(...res.value.staked);
        result.liquidityPositions.push(...res.value.liquidity);
      }
    }

    // If ALL protocols failed, propagate as error
    if (!hasAnySuccess) {
      const firstError = protocolResults.find(r => r.status === 'rejected');
      throw (firstError as PromiseRejectedResult).reason;
    }

    return result;
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
