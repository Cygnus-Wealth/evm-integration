import { Address } from 'viem';
import { Transaction, TransactionType } from '@cygnus-wealth/data-models';
import { IChainAdapter, TransactionOptions } from '../types/IChainAdapter.js';
import { CacheManager } from '../performance/CacheManager.js';
import { ValidationError } from '../utils/errors.js';
import { Validators } from '../utils/validators.js';

/**
 * Transaction query options
 */
export interface TransactionQueryOptions extends TransactionOptions {
  /**
   * Filter by transaction type
   */
  types?: TransactionType[];

  /**
   * Filter by status
   */
  statuses?: Array<'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'>;

  /**
   * Filter by date range
   */
  dateRange?: {
    from: Date;
    to: Date;
  };

  /**
   * Exclude pending transactions
   * @default false
   */
  excludePending?: boolean;

  /**
   * Force fresh fetch (bypass cache)
   * @default false
   */
  forceFresh?: boolean;

  /**
   * Page number (1-indexed)
   * @default 1
   */
  page?: number;

  /**
   * Page size
   * @default 50
   */
  pageSize?: number;
}

/**
 * Paginated transaction results
 */
export interface PaginatedTransactions {
  /**
   * Transaction items
   */
  items: Transaction[];

  /**
   * Current page (1-indexed)
   */
  page: number;

  /**
   * Items per page
   */
  pageSize: number;

  /**
   * Total items
   */
  total: number;

  /**
   * Total pages
   */
  totalPages: number;

  /**
   * Has more pages
   */
  hasMore: boolean;
}

/**
 * Transaction subscription options
 */
export interface TransactionSubscriptionOptions {
  /**
   * Filter by transaction type
   */
  types?: TransactionType[];

  /**
   * Include pending transactions
   * @default true
   */
  includePending?: boolean;
}

/**
 * Transaction service configuration
 */
export interface TransactionServiceConfig {
  /**
   * Enable caching
   * @default true
   */
  enableCache: boolean;

  /**
   * Default page size
   * @default 50
   */
  defaultPageSize: number;

  /**
   * Cache TTL for transactions (seconds)
   * @default 300
   */
  cacheTTL: number;

  /**
   * Maximum transactions per request
   * @default 1000
   */
  maxTransactions: number;
}

/**
 * Transaction service for fetching and monitoring transactions
 * Implements pagination, filtering, and real-time monitoring
 */
export class TransactionService {
  private adapters: Map<number, IChainAdapter>;
  private cache: CacheManager<Transaction[]>;
  private config: TransactionServiceConfig;
  private subscriptions: Map<string, () => void>;

  /**
   * Creates a new transaction service
   * @param adapters - Map of chain ID to adapter instances
   * @param config - Service configuration
   */
  constructor(
    adapters: Map<number, IChainAdapter>,
    config?: Partial<TransactionServiceConfig>
  ) {
    this.adapters = adapters;
    this.config = {
      enableCache: config?.enableCache ?? true,
      defaultPageSize: config?.defaultPageSize ?? 50,
      cacheTTL: config?.cacheTTL ?? 300,
      maxTransactions: config?.maxTransactions ?? 1000,
    };

    // Initialize cache
    this.cache = new CacheManager<Transaction[]>({
      capacity: 500,
      defaultTTL: this.config.cacheTTL,
      enableLRU: true,
    });

    this.subscriptions = new Map();
  }

  /**
   * Fetches transaction history for an address
   * @param address - Wallet address
   * @param chainId - Chain ID
   * @param options - Query options
   * @returns Paginated transaction results
   */
  async getTransactions(
    address: Address,
    chainId: number,
    options?: TransactionQueryOptions
  ): Promise<PaginatedTransactions> {
    // Validate inputs
    Validators.validateAddress(address);

    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? this.config.defaultPageSize;

    if (page < 1) {
      throw ValidationError.invalidParameter('page', 'Integer >= 1', String(page));
    }
    if (pageSize < 1 || pageSize > this.config.maxTransactions) {
      throw ValidationError.invalidParameter(
        'pageSize',
        `Integer between 1 and ${this.config.maxTransactions}`,
        String(pageSize)
      );
    }

    // Check cache unless force fresh
    let transactions: Transaction[];
    const cacheKey = this.getCacheKey(address, chainId, options);

    if (this.config.enableCache && !options?.forceFresh) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        transactions = cached;
      } else {
        transactions = await this.fetchTransactions(
          address,
          chainId,
          options
        );
        await this.cache.set(cacheKey, transactions);
      }
    } else {
      transactions = await this.fetchTransactions(address, chainId, options);
      if (this.config.enableCache) {
        await this.cache.set(cacheKey, transactions);
      }
    }

    // Apply filters
    const filtered = this.filterTransactions(transactions, options || {});

    // Apply pagination
    return this.paginateTransactions(filtered, page, pageSize);
  }

  /**
   * Fetches a specific transaction by hash
   * @param txHash - Transaction hash
   * @param chainId - Chain ID
   * @returns Transaction data
   * @throws DataError if transaction not found
   */
  async getTransaction(
    txHash: string,
    chainId: number
  ): Promise<Transaction> {
    Validators.validateTxHash(txHash);

    const adapter = this.getAdapter(chainId);
    const transactions = await adapter.getTransactions(
      '0x0000000000000000000000000000000000000000' as Address
    );

    const transaction = transactions.find((tx) => tx.hash === txHash);
    if (!transaction) {
      throw ValidationError.invalidParameter(
        'txHash',
        'Valid transaction hash on chain',
        txHash
      );
    }

    return transaction;
  }

  /**
   * Fetches pending transactions for an address
   * @param address - Wallet address
   * @param chainId - Chain ID
   * @returns Array of pending transactions
   */
  async getPendingTransactions(
    address: Address,
    chainId: number
  ): Promise<Transaction[]> {
    Validators.validateAddress(address);

    const adapter = this.getAdapter(chainId);
    const transactions = await adapter.getTransactions(address);

    // Filter to only pending transactions
    return transactions.filter(
      (tx) => tx.status === 'PENDING'
    );
  }

  /**
   * Subscribes to new transactions for an address
   * @param address - Address to monitor
   * @param chainId - Chain ID
   * @param callback - Callback invoked on new transaction
   * @param options - Subscription options
   * @returns Unsubscribe function
   */
  async subscribeToTransactions(
    address: Address,
    chainId: number,
    callback: (transaction: Transaction) => void,
    options?: TransactionSubscriptionOptions
  ): Promise<() => void> {
    Validators.validateAddress(address);

    const adapter = this.getAdapter(chainId);

    // Wrap callback with filtering logic
    const wrappedCallback = (transaction: Transaction) => {
      // Filter by type if specified
      if (options?.types && options.types.length > 0) {
        if (!options.types.includes(transaction.type)) {
          return;
        }
      }

      // Filter by pending status
      const isPending = transaction.status === 'PENDING';
      const includePending = options?.includePending ?? true;
      if (isPending && !includePending) {
        return;
      }

      callback(transaction);
    };

    const unsubscribe = await adapter.subscribeToTransactions(
      address,
      wrappedCallback
    );

    const key = `${address}-${chainId}`;
    this.subscriptions.set(key, unsubscribe);

    // Return wrapped unsubscribe
    return () => {
      unsubscribe();
      this.subscriptions.delete(key);
    };
  }

  /**
   * Unsubscribes from all transaction monitoring
   * @param address - Address (optional, unsubscribes all if not provided)
   * @param chainId - Chain ID (optional)
   */
  unsubscribeAll(address?: Address, chainId?: number): void {
    if (address && chainId) {
      const key = `${address}-${chainId}`;
      const unsubscribe = this.subscriptions.get(key);
      if (unsubscribe) {
        unsubscribe();
        this.subscriptions.delete(key);
      }
    } else if (address) {
      // Unsubscribe all for this address across all chains
      for (const [key, unsubscribe] of this.subscriptions.entries()) {
        if (key.startsWith(address)) {
          unsubscribe();
          this.subscriptions.delete(key);
        }
      }
    } else {
      // Unsubscribe all
      for (const unsubscribe of this.subscriptions.values()) {
        unsubscribe();
      }
      this.subscriptions.clear();
    }
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
   * Fetches transactions from adapter
   * @param address - Address
   * @param chainId - Chain ID
   * @param options - Query options
   * @returns Transactions
   * @private
   */
  private async fetchTransactions(
    address: Address,
    chainId: number,
    options?: TransactionQueryOptions
  ): Promise<Transaction[]> {
    const adapter = this.getAdapter(chainId);

    const adapterOptions: TransactionOptions = {
      limit: options?.limit,
      fromBlock: options?.fromBlock,
      toBlock: options?.toBlock,
    };

    return await adapter.getTransactions(address, adapterOptions);
  }

  /**
   * Filters transactions by criteria
   * @param transactions - Transactions to filter
   * @param options - Filter options
   * @returns Filtered transactions
   * @private
   */
  private filterTransactions(
    transactions: Transaction[],
    options: TransactionQueryOptions
  ): Transaction[] {
    let filtered = [...transactions];

    // Filter by type
    if (options.types && options.types.length > 0) {
      filtered = filtered.filter((tx) => options.types!.includes(tx.type));
    }

    // Filter by status
    if (options.statuses && options.statuses.length > 0) {
      filtered = filtered.filter((tx) =>
        options.statuses!.includes(tx.status)
      );
    }

    // Exclude pending if requested
    if (options.excludePending) {
      filtered = filtered.filter(
        (tx) => tx.status !== 'PENDING'
      );
    }

    // Filter by date range
    if (options.dateRange) {
      const fromTime = options.dateRange.from.getTime();
      const toTime = options.dateRange.to.getTime();
      filtered = filtered.filter((tx) => {
        const txTime = tx.timestamp.getTime();
        return txTime >= fromTime && txTime <= toTime;
      });
    }

    return filtered;
  }

  /**
   * Applies pagination to transactions
   * @param transactions - Transactions to paginate
   * @param page - Page number (1-indexed)
   * @param pageSize - Items per page
   * @returns Paginated result
   * @private
   */
  private paginateTransactions(
    transactions: Transaction[],
    page: number,
    pageSize: number
  ): PaginatedTransactions {
    const total = transactions.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const items = transactions.slice(start, end);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages,
      hasMore: page < totalPages,
    };
  }

  /**
   * Generates cache key for transaction query
   * @param address - Address
   * @param chainId - Chain ID
   * @param options - Query options
   * @private
   */
  private getCacheKey(
    address: Address,
    chainId: number,
    options?: TransactionQueryOptions
  ): string {
    const parts = [`tx:${chainId}:${address}`];

    if (options?.limit) parts.push(`limit:${options.limit}`);
    if (options?.fromBlock) parts.push(`from:${options.fromBlock}`);
    if (options?.toBlock) parts.push(`to:${options.toBlock}`);
    if (options?.types) parts.push(`types:${options.types.join(',')}`);
    if (options?.statuses) parts.push(`status:${options.statuses.join(',')}`);
    if (options?.dateRange) {
      parts.push(
        `date:${options.dateRange.from.getTime()}-${options.dateRange.to.getTime()}`
      );
    }
    if (options?.excludePending) parts.push('nopending');

    return parts.join(':');
  }

  /**
   * Destroys the service and cleans up resources
   */
  async destroy(): Promise<void> {
    this.unsubscribeAll();
    await this.cache.clear();
  }
}
