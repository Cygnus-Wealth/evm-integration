import { Address } from 'viem';
import { Balance } from '@cygnus-wealth/data-models';
import { IChainAdapter, TokenConfig } from '../types/IChainAdapter';
import { CacheManager } from '../performance/CacheManager';
import { BatchProcessor } from '../performance/BatchProcessor';
import { RequestCoalescer } from '../performance/RequestCoalescer';
import { CircuitBreaker } from '../resilience/CircuitBreaker';
import { RetryPolicy } from '../resilience/RetryPolicy';
import { ValidationError } from '../utils/errors';
import { Validators } from '../utils/validators';

/**
 * Balance query options
 */
export interface BalanceQueryOptions {
  /**
   * Force fresh fetch (bypass cache)
   * @default false
   */
  forceFresh?: boolean;

  /**
   * Include token balances
   * @default false
   */
  includeTokens?: boolean;

  /**
   * Specific token addresses to query
   */
  tokens?: TokenConfig[];
}

/**
 * Multi-chain balance query options
 */
export interface MultiChainBalanceOptions {
  /**
   * Force fresh fetch (bypass cache)
   * @default false
   */
  forceFresh?: boolean;

  /**
   * Fail fast on first error or collect all results
   * @default false
   */
  failFast?: boolean;
}

/**
 * Multi-chain balance result
 */
export interface MultiChainBalance {
  /**
   * Balances by chain ID
   */
  balances: Map<number, Balance>;

  /**
   * Errors by chain ID (if any)
   */
  errors: Map<number, Error>;

  /**
   * Total value across all chains (if available)
   */
  totalValue?: string;
}

/**
 * Balance subscription options
 */
export interface BalanceSubscriptionOptions {
  /**
   * Include token balances in updates
   * @default false
   */
  includeTokens?: boolean;

  /**
   * Polling interval (ms) for chains without WebSocket support
   * @default 15000
   */
  pollingInterval?: number;
}

/**
 * Balance service configuration
 */
export interface BalanceServiceConfig {
  /**
   * Enable caching
   * @default true
   */
  enableCache: boolean;

  /**
   * Cache TTL for balance data (seconds)
   * @default 60
   */
  cacheTTL: number;

  /**
   * Enable request batching
   * @default true
   */
  enableBatching: boolean;

  /**
   * Batch window (ms)
   * @default 100
   */
  batchWindow: number;

  /**
   * Max batch size
   * @default 10
   */
  maxBatchSize: number;

  /**
   * Enable circuit breaker
   * @default true
   */
  enableCircuitBreaker: boolean;

  /**
   * Circuit breaker failure threshold
   * @default 5
   */
  failureThreshold: number;

  /**
   * Circuit breaker timeout (ms)
   * @default 60000
   */
  circuitTimeout: number;

  /**
   * Enable retry on failure
   * @default true
   */
  enableRetry: boolean;

  /**
   * Max retry attempts
   * @default 3
   */
  maxRetries: number;

  /**
   * Base retry delay (ms)
   * @default 1000
   */
  retryDelay: number;
}

/**
 * Balance service statistics
 */
export interface BalanceServiceStats {
  /**
   * Total balance requests
   */
  totalRequests: number;

  /**
   * Cache hits
   */
  cacheHits: number;

  /**
   * Cache misses
   */
  cacheMisses: number;

  /**
   * Batched requests
   */
  batchedRequests: number;

  /**
   * Failed requests
   */
  failedRequests: number;

  /**
   * Active subscriptions
   */
  activeSubscriptions: number;
}

/**
 * Internal balance request type
 * @private
 */
interface BalanceRequest {
  address: Address;
  chainId: number;
  isToken: boolean;
  tokenAddress?: Address;
}

/**
 * Balance service for fetching and managing balance data
 * Implements caching, batching, and resilience patterns
 */
export class BalanceService {
  private adapters: Map<number, IChainAdapter>;
  private cache: CacheManager<Balance>;
  private batchProcessor: BatchProcessor<BalanceRequest, Balance>;
  private coalescer: RequestCoalescer;
  private circuitBreakers: Map<number, CircuitBreaker>;
  private retryPolicy: RetryPolicy;
  private config: BalanceServiceConfig;
  private subscriptions: Map<string, () => void>;
  private stats: BalanceServiceStats;

  /**
   * Creates a new balance service
   * @param adapters - Map of chain ID to adapter instances
   * @param config - Service configuration
   */
  constructor(
    adapters: Map<number, IChainAdapter>,
    config?: Partial<BalanceServiceConfig>
  ) {
    this.adapters = adapters;
    this.config = {
      enableCache: config?.enableCache ?? true,
      cacheTTL: config?.cacheTTL ?? 60,
      enableBatching: config?.enableBatching ?? true,
      batchWindow: config?.batchWindow ?? 100,
      maxBatchSize: config?.maxBatchSize ?? 10,
      enableCircuitBreaker: config?.enableCircuitBreaker ?? true,
      failureThreshold: config?.failureThreshold ?? 5,
      circuitTimeout: config?.circuitTimeout ?? 60000,
      enableRetry: config?.enableRetry ?? true,
      maxRetries: config?.maxRetries ?? 3,
      retryDelay: config?.retryDelay ?? 1000,
    };

    // Initialize cache
    this.cache = new CacheManager<Balance>({
      capacity: 1000,
      defaultTTL: this.config.cacheTTL,
      enableLRU: true,
    });

    // Initialize batch processor
    this.batchProcessor = new BatchProcessor<BalanceRequest, Balance>(
      async (requests) => this.processBatch(requests),
      {
        windowMs: this.config.batchWindow,
        maxSize: this.config.maxBatchSize,
        autoFlush: true,
      }
    );

    // Initialize coalescer
    this.coalescer = new RequestCoalescer();

    // Initialize circuit breakers per chain
    this.circuitBreakers = new Map();
    if (this.config.enableCircuitBreaker) {
      for (const chainId of adapters.keys()) {
        this.circuitBreakers.set(
          chainId,
          new CircuitBreaker({
            failureThreshold: this.config.failureThreshold,
            timeout: this.config.circuitTimeout,
            name: `balance-service-chain-${chainId}`,
          })
        );
      }
    }

    // Initialize retry policy
    this.retryPolicy = new RetryPolicy({
      maxAttempts: this.config.maxRetries,
      baseDelay: this.config.retryDelay,
      maxDelay: this.config.retryDelay * 10,
      multiplier: 2,
    });

    // Initialize subscriptions and stats
    this.subscriptions = new Map();
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      batchedRequests: 0,
      failedRequests: 0,
      activeSubscriptions: 0,
    };
  }

  /**
   * Fetches native balance for an address on a specific chain
   * @param address - Wallet address
   * @param chainId - Chain ID
   * @param options - Query options
   * @returns Balance data
   * @throws ValidationError if address or chainId invalid
   * @throws ConnectionError if RPC fails
   */
  async getBalance(
    address: Address,
    chainId: number,
    options?: BalanceQueryOptions
  ): Promise<Balance> {
    // Validate inputs
    Validators.validateAddress(address);

    this.stats.totalRequests++;

    // Check cache unless force fresh
    if (this.config.enableCache && !options?.forceFresh) {
      const cacheKey = this.getCacheKey(address, chainId, false);
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        this.stats.cacheHits++;
        return cached;
      }
      this.stats.cacheMisses++;
    }

    // Use coalescer to deduplicate concurrent requests
    const coalescerKey = RequestCoalescer.generateKey(
      'getBalance',
      chainId,
      address
    );

    return await this.coalescer.execute(coalescerKey, async () => {
      const adapter = this.getAdapter(chainId);
      const breaker = this.circuitBreakers.get(chainId);

      // Wrap in circuit breaker and retry logic
      const fetchBalance = async () => {
        const balance = await adapter.getBalance(address);

        // Cache the result
        if (this.config.enableCache) {
          const cacheKey = this.getCacheKey(address, chainId, false);
          await this.cache.set(cacheKey, balance);
        }

        return balance;
      };

      try {
        if (this.config.enableCircuitBreaker && breaker) {
          return await breaker.execute(async () => {
            if (this.config.enableRetry) {
              return await this.retryPolicy.execute(fetchBalance);
            }
            return await fetchBalance();
          });
        } else if (this.config.enableRetry) {
          return await this.retryPolicy.execute(fetchBalance);
        }
        return await fetchBalance();
      } catch (error) {
        this.stats.failedRequests++;
        throw error;
      }
    });
  }

  /**
   * Fetches token balances for an address
   * @param address - Wallet address
   * @param chainId - Chain ID
   * @param tokens - Token configurations
   * @param options - Query options
   * @returns Array of token balances
   * @throws ValidationError if address or chainId invalid
   */
  async getTokenBalances(
    address: Address,
    chainId: number,
    tokens: TokenConfig[],
    options?: BalanceQueryOptions
  ): Promise<Balance[]> {
    // Validate inputs
    Validators.validateAddress(address);

    if (!tokens || tokens.length === 0) {
      return [];
    }

    this.stats.totalRequests++;

    const adapter = this.getAdapter(chainId);
    const breaker = this.circuitBreakers.get(chainId);

    const fetchTokenBalances = async () => {
      const balances = await adapter.getTokenBalances(address, tokens);

      // Cache each token balance
      if (this.config.enableCache) {
        for (let i = 0; i < balances.length; i++) {
          const cacheKey = this.getCacheKey(
            address,
            chainId,
            true,
            tokens[i].address
          );
          await this.cache.set(cacheKey, balances[i]);
        }
      }

      return balances;
    };

    try {
      if (this.config.enableCircuitBreaker && breaker) {
        return await breaker.execute(async () => {
          if (this.config.enableRetry) {
            return await this.retryPolicy.execute(fetchTokenBalances);
          }
          return await fetchTokenBalances();
        });
      } else if (this.config.enableRetry) {
        return await this.retryPolicy.execute(fetchTokenBalances);
      }
      return await fetchTokenBalances();
    } catch (error) {
      this.stats.failedRequests++;
      throw error;
    }
  }

  /**
   * Fetches balance across multiple chains
   * @param address - Wallet address
   * @param chainIds - Array of chain IDs
   * @param options - Query options
   * @returns Multi-chain balance results
   */
  async getMultiChainBalance(
    address: Address,
    chainIds: number[],
    options?: MultiChainBalanceOptions
  ): Promise<MultiChainBalance> {
    Validators.validateAddress(address);

    const balances = new Map<number, Balance>();
    const errors = new Map<number, Error>();

    if (options?.failFast) {
      // Fail on first error
      for (const chainId of chainIds) {
        try {
          const balance = await this.getBalance(address, chainId, {
            forceFresh: options.forceFresh,
          });
          balances.set(chainId, balance);
        } catch (error) {
          errors.set(chainId, error as Error);
          throw error;
        }
      }
    } else {
      // Collect all results, errors included
      const results = await Promise.allSettled(
        chainIds.map((chainId) =>
          this.getBalance(address, chainId, {
            forceFresh: options?.forceFresh,
          })
        )
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const chainId = chainIds[i];
        if (result.status === 'fulfilled') {
          balances.set(chainId, result.value);
        } else {
          errors.set(chainId, result.reason);
        }
      }
    }

    return {
      balances,
      errors,
    };
  }

  /**
   * Fetches balances for multiple addresses in batch
   * @param requests - Array of balance requests
   * @returns Array of balances
   */
  async getBatchBalances(
    requests: Array<{ address: Address; chainId: number }>
  ): Promise<Balance[]> {
    if (!this.config.enableBatching) {
      // Fallback to sequential requests
      return await Promise.all(
        requests.map((req) => this.getBalance(req.address, req.chainId))
      );
    }

    this.stats.batchedRequests += requests.length;

    const balanceRequests: BalanceRequest[] = requests.map((req) => ({
      address: req.address,
      chainId: req.chainId,
      isToken: false,
    }));

    return await Promise.all(
      balanceRequests.map((req) => this.batchProcessor.add(req))
    );
  }

  /**
   * Subscribes to balance changes for an address
   * @param address - Address to monitor
   * @param chainId - Chain ID
   * @param callback - Callback invoked on balance change
   * @param options - Subscription options
   * @returns Unsubscribe function
   */
  async subscribeToBalance(
    address: Address,
    chainId: number,
    callback: (balance: Balance) => void,
    options?: BalanceSubscriptionOptions
  ): Promise<() => void> {
    Validators.validateAddress(address);

    const adapter = this.getAdapter(chainId);
    const unsubscribe = await adapter.subscribeToBalance(address, callback);

    const key = `${address}-${chainId}`;
    this.subscriptions.set(key, unsubscribe);
    this.stats.activeSubscriptions++;

    // Return wrapped unsubscribe that updates stats
    return () => {
      unsubscribe();
      this.subscriptions.delete(key);
      this.stats.activeSubscriptions--;
    };
  }

  /**
   * Invalidates cached balance for an address
   * @param address - Address
   * @param chainId - Chain ID
   * @param tokenAddress - Token address (optional)
   */
  async invalidateCache(
    address: Address,
    chainId: number,
    tokenAddress?: Address
  ): Promise<void> {
    const isToken = !!tokenAddress;
    const cacheKey = this.getCacheKey(address, chainId, isToken, tokenAddress);
    await this.cache.delete(cacheKey);
  }

  /**
   * Clears all cached balances
   */
  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  /**
   * Gets service statistics
   * @returns Current stats
   */
  getStats(): Readonly<BalanceServiceStats> {
    return { ...this.stats };
  }

  /**
   * Gets circuit breaker stats for a chain
   * @param chainId - Chain ID
   * @returns Circuit breaker stats
   */
  getCircuitBreakerStats(chainId: number) {
    const breaker = this.circuitBreakers.get(chainId);
    return breaker?.getStats();
  }

  /**
   * Unsubscribes from all balance monitoring
   */
  unsubscribeAll(): void {
    for (const unsubscribe of this.subscriptions.values()) {
      unsubscribe();
    }
    this.subscriptions.clear();
    this.stats.activeSubscriptions = 0;
  }

  /**
   * Destroys the service and cleans up resources
   */
  async destroy(): Promise<void> {
    this.unsubscribeAll();
    this.batchProcessor.destroy();
    this.coalescer.destroy();
    await this.cache.clear();
  }

  /**
   * Gets adapter for a specific chain
   * @param chainId - Chain ID
   * @returns Chain adapter
   * @throws ValidationError if chain not supported
   * @private
   */
  private getAdapter(chainId: number): IChainAdapter {
    const adapter = this.adapters.get(chainId);
    if (!adapter) {
      throw ValidationError.invalidChainId(chainId);
    }
    return adapter;
  }

  /**
   * Generates cache key for balance
   * @param address - Address
   * @param chainId - Chain ID
   * @param isToken - Whether this is a token balance
   * @param tokenAddress - Token contract address
   * @private
   */
  private getCacheKey(
    address: Address,
    chainId: number,
    isToken: boolean,
    tokenAddress?: Address
  ): string {
    if (isToken && tokenAddress) {
      return `balance:${chainId}:${address}:${tokenAddress}`;
    }
    return `balance:${chainId}:${address}:native`;
  }

  /**
   * Processes a batch of balance requests
   * @param requests - Balance requests
   * @returns Array of balances
   * @private
   */
  private async processBatch(
    requests: BalanceRequest[]
  ): Promise<Balance[]> {
    // Group by chain ID
    const byChain = new Map<number, BalanceRequest[]>();
    for (const req of requests) {
      const chainReqs = byChain.get(req.chainId) || [];
      chainReqs.push(req);
      byChain.set(req.chainId, chainReqs);
    }

    // Process each chain's batch
    const results: Balance[] = [];
    for (const [chainId, chainRequests] of byChain.entries()) {
      const adapter = this.getAdapter(chainId);
      const breaker = this.circuitBreakers.get(chainId);

      for (const req of chainRequests) {
        const fetchBalance = async () => {
          if (req.isToken && req.tokenAddress) {
            const balances = await adapter.getTokenBalances(req.address, [
              { address: req.tokenAddress },
            ]);
            return balances[0];
          }
          return await adapter.getBalance(req.address);
        };

        try {
          let balance: Balance;
          if (this.config.enableCircuitBreaker && breaker) {
            balance = await breaker.execute(fetchBalance);
          } else {
            balance = await fetchBalance();
          }
          results.push(balance);

          // Cache the result
          if (this.config.enableCache) {
            const cacheKey = this.getCacheKey(
              req.address,
              req.chainId,
              req.isToken,
              req.tokenAddress
            );
            await this.cache.set(cacheKey, balance);
          }
        } catch (error) {
          this.stats.failedRequests++;
          throw error;
        }
      }
    }

    return results;
  }
}
