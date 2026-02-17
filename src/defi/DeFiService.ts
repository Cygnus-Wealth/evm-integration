import { Address } from 'viem';
import {
  IDeFiProtocol,
  DeFiPositions,
  MultiChainDeFiPositions,
  DeFiServiceConfig,
} from './types.js';
import { CacheManager } from '../performance/CacheManager.js';
import { Validators } from '../utils/validators.js';

export interface DeFiQueryOptions {
  forceFresh?: boolean;
}

export interface DeFiServiceStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  failedRequests: number;
}

export class DeFiService {
  private protocols: IDeFiProtocol[];
  private cache: CacheManager<DeFiPositions>;
  private config: DeFiServiceConfig;
  private stats: DeFiServiceStats;

  constructor(protocols: IDeFiProtocol[], config?: Partial<DeFiServiceConfig>) {
    this.protocols = protocols;
    this.config = {
      enableCache: config?.enableCache ?? true,
      cacheTTL: config?.cacheTTL ?? 60,
      enableCircuitBreaker: config?.enableCircuitBreaker ?? true,
      failureThreshold: config?.failureThreshold ?? 5,
      circuitTimeout: config?.circuitTimeout ?? 60000,
      enableRetry: config?.enableRetry ?? true,
      maxRetries: config?.maxRetries ?? 3,
      retryDelay: config?.retryDelay ?? 1000,
    };

    this.cache = new CacheManager<DeFiPositions>({
      capacity: 500,
      defaultTTL: this.config.cacheTTL,
      enableLRU: true,
    });

    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      failedRequests: 0,
    };
  }

  async getPositions(
    address: Address,
    chainId: number,
    options?: DeFiQueryOptions,
  ): Promise<DeFiPositions> {
    Validators.validateAddress(address);

    this.stats.totalRequests++;

    // Check cache
    if (this.config.enableCache && !options?.forceFresh) {
      const cacheKey = this.getCacheKey(address, chainId);
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        this.stats.cacheHits++;
        return cached;
      }
      this.stats.cacheMisses++;
    }

    const applicableProtocols = this.protocols.filter(p => p.supportsChain(chainId));

    const result: DeFiPositions = {
      lendingPositions: [],
      stakedPositions: [],
      liquidityPositions: [],
    };

    const protocolResults = await Promise.allSettled(
      applicableProtocols.map(async (protocol) => {
        const [lending, staked, liquidity] = await Promise.all([
          protocol.getLendingPositions(address, chainId),
          protocol.getStakedPositions(address, chainId),
          protocol.getLiquidityPositions(address, chainId),
        ]);
        return { lending, staked, liquidity };
      }),
    );

    for (const res of protocolResults) {
      if (res.status === 'fulfilled') {
        result.lendingPositions.push(...res.value.lending);
        result.stakedPositions.push(...res.value.staked);
        result.liquidityPositions.push(...res.value.liquidity);
      } else {
        this.stats.failedRequests++;
      }
    }

    // Cache the result
    if (this.config.enableCache) {
      const cacheKey = this.getCacheKey(address, chainId);
      await this.cache.set(cacheKey, result);
    }

    return result;
  }

  async getMultiChainPositions(
    address: Address,
    chainIds: number[],
  ): Promise<MultiChainDeFiPositions> {
    Validators.validateAddress(address);

    const positions = new Map<number, DeFiPositions>();
    const errors = new Map<number, Error>();

    const results = await Promise.allSettled(
      chainIds.map(async (chainId) => ({
        chainId,
        positions: await this.getPositions(address, chainId),
      })),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        positions.set(result.value.chainId, result.value.positions);
      } else {
        const idx = results.indexOf(result);
        errors.set(chainIds[idx], result.reason);
      }
    }

    return { positions, errors };
  }

  getStats(): Readonly<DeFiServiceStats> {
    return { ...this.stats };
  }

  async destroy(): Promise<void> {
    await this.cache.clear();
  }

  private getCacheKey(address: Address, chainId: number): string {
    return `defi:${chainId}:${address}`;
  }
}
