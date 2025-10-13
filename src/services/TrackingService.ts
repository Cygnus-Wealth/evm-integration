import { Address } from 'viem';
import { Balance, Transaction } from '@cygnus-wealth/data-models';
import { BalanceService } from './BalanceService';
import { TransactionService } from './TransactionService';
import { TokenConfig } from '../types/IChainAdapter';
import { Validators } from '../utils/validators';

/**
 * Tracking configuration for an address
 */
export interface AddressTrackingConfig {
  /**
   * Address to track
   */
  address: Address;

  /**
   * Chain IDs to track on
   */
  chainIds: number[];

  /**
   * Polling interval (ms)
   * @default 30000
   */
  pollingInterval?: number;

  /**
   * Track balance changes
   * @default true
   */
  trackBalances?: boolean;

  /**
   * Track new transactions
   * @default true
   */
  trackTransactions?: boolean;

  /**
   * Track token balances
   * @default false
   */
  trackTokens?: boolean;

  /**
   * Specific token addresses to track
   */
  tokenAddresses?: TokenConfig[];

  /**
   * Custom label for this address
   */
  label?: string;
}

/**
 * Balance change event
 */
export interface BalanceChangeEvent {
  address: Address;
  chainId: number;
  oldBalance: Balance;
  newBalance: Balance;
  timestamp: Date;
}

/**
 * New transaction event
 */
export interface NewTransactionEvent {
  address: Address;
  chainId: number;
  transaction: Transaction;
  timestamp: Date;
}

/**
 * Event handlers for tracking
 */
export interface TrackingEventHandlers {
  onBalanceChange?: (event: BalanceChangeEvent) => void;
  onNewTransaction?: (event: NewTransactionEvent) => void;
  onError?: (error: Error, address: Address, chainId: number) => void;
}

/**
 * Tracking status for an address
 */
export interface TrackingStatus {
  address: Address;
  chainIds: number[];
  isActive: boolean;
  lastUpdate: Date;
  errorCount: number;
  lastError?: Error;
}

/**
 * Tracking service for monitoring multiple addresses across chains
 * Coordinates balance and transaction monitoring
 */
export class TrackingService {
  private configs: Map<Address, AddressTrackingConfig>;
  private intervals: Map<string, NodeJS.Timeout>;
  private handlers: TrackingEventHandlers;
  private status: Map<Address, Map<number, TrackingStatus>>;
  private balanceCache: Map<string, Balance>;
  private transactionCache: Map<string, Set<string>>; // address-chainId -> Set of tx hashes
  private balanceService: BalanceService;
  private transactionService: TransactionService;

  /**
   * Creates a new tracking service
   * @param balanceService - Balance service instance
   * @param transactionService - Transaction service instance
   * @param handlers - Event handlers
   */
  constructor(
    balanceService: BalanceService,
    transactionService: TransactionService,
    handlers: TrackingEventHandlers
  ) {
    this.balanceService = balanceService;
    this.transactionService = transactionService;
    this.handlers = handlers;
    this.configs = new Map();
    this.intervals = new Map();
    this.status = new Map();
    this.balanceCache = new Map();
    this.transactionCache = new Map();
  }

  /**
   * Starts tracking an address
   * @param config - Tracking configuration
   */
  startTracking(config: AddressTrackingConfig): void {
    Validators.validateAddress(config.address);

    // Store config
    this.configs.set(config.address, {
      ...config,
      pollingInterval: config.pollingInterval ?? 30000,
      trackBalances: config.trackBalances ?? true,
      trackTransactions: config.trackTransactions ?? true,
      trackTokens: config.trackTokens ?? false,
    });

    // Initialize status for this address
    if (!this.status.has(config.address)) {
      this.status.set(config.address, new Map());
    }
    const addressStatus = this.status.get(config.address)!;

    // Start tracking on each chain
    for (const chainId of config.chainIds) {
      // Initialize status
      addressStatus.set(chainId, {
        address: config.address,
        chainIds: [chainId],
        isActive: true,
        lastUpdate: new Date(),
        errorCount: 0,
      });

      // Set up polling interval
      const intervalKey = this.getIntervalKey(config.address, chainId);
      if (!this.intervals.has(intervalKey)) {
        const interval = setInterval(() => {
          this.pollUpdates(config.address, chainId, config);
        }, config.pollingInterval ?? 30000);

        this.intervals.set(intervalKey, interval);

        // Do initial poll immediately
        this.pollUpdates(config.address, chainId, config);
      }
    }
  }

  /**
   * Stops tracking an address
   * @param address - Address to stop tracking
   * @param chainId - Specific chain (optional, stops all if not provided)
   */
  stopTracking(address: Address, chainId?: number): void {
    Validators.validateAddress(address);

    if (chainId !== undefined) {
      // Stop tracking on specific chain
      const intervalKey = this.getIntervalKey(address, chainId);
      const interval = this.intervals.get(intervalKey);
      if (interval) {
        clearInterval(interval);
        this.intervals.delete(intervalKey);
      }

      // Update status
      const addressStatus = this.status.get(address);
      if (addressStatus) {
        const status = addressStatus.get(chainId);
        if (status) {
          status.isActive = false;
        }
      }
    } else {
      // Stop tracking on all chains for this address
      const config = this.configs.get(address);
      if (config) {
        for (const cid of config.chainIds) {
          const intervalKey = this.getIntervalKey(address, cid);
          const interval = this.intervals.get(intervalKey);
          if (interval) {
            clearInterval(interval);
            this.intervals.delete(intervalKey);
          }

          // Update status
          const addressStatus = this.status.get(address);
          if (addressStatus) {
            const status = addressStatus.get(cid);
            if (status) {
              status.isActive = false;
            }
          }
        }

        this.configs.delete(address);
      }
    }
  }

  /**
   * Updates tracking configuration for an address
   * @param address - Address to update
   * @param updates - Partial configuration updates
   */
  updateTrackingConfig(
    address: Address,
    updates: Partial<AddressTrackingConfig>
  ): void {
    Validators.validateAddress(address);

    const existing = this.configs.get(address);
    if (!existing) {
      throw new Error(`Address ${address} is not being tracked`);
    }

    // Stop current tracking
    this.stopTracking(address);

    // Start with updated config
    const newConfig: AddressTrackingConfig = {
      ...existing,
      ...updates,
      address: existing.address, // Don't allow address change
    };

    this.startTracking(newConfig);
  }

  /**
   * Gets tracking status for an address
   * @param address - Address
   * @returns Tracking status per chain
   */
  getTrackingStatus(
    address: Address
  ): Map<number, TrackingStatus> | undefined {
    return this.status.get(address);
  }

  /**
   * Gets all tracked addresses
   * @returns Array of tracked addresses
   */
  getTrackedAddresses(): Address[] {
    return Array.from(this.configs.keys());
  }

  /**
   * Checks if an address is being tracked
   * @param address - Address to check
   * @param chainId - Specific chain (optional)
   * @returns True if being tracked
   */
  isTracking(address: Address, chainId?: number): boolean {
    const config = this.configs.get(address);
    if (!config) {
      return false;
    }

    if (chainId !== undefined) {
      return config.chainIds.includes(chainId);
    }

    return true;
  }

  /**
   * Stops tracking all addresses
   */
  stopAll(): void {
    for (const address of this.configs.keys()) {
      this.stopTracking(address);
    }

    // Clear all intervals
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();

    // Clear all status
    for (const addressStatus of this.status.values()) {
      for (const status of addressStatus.values()) {
        status.isActive = false;
      }
    }
  }

  /**
   * Gets service statistics
   * @returns Tracking statistics
   */
  getStats(): {
    totalAddresses: number;
    totalChains: number;
    activeTracking: number;
    totalErrors: number;
  } {
    let totalChains = 0;
    let activeTracking = 0;
    let totalErrors = 0;

    for (const addressStatus of this.status.values()) {
      for (const status of addressStatus.values()) {
        totalChains++;
        if (status.isActive) {
          activeTracking++;
        }
        totalErrors += status.errorCount;
      }
    }

    return {
      totalAddresses: this.configs.size,
      totalChains,
      activeTracking,
      totalErrors,
    };
  }

  /**
   * Polls for updates on a specific address/chain
   * @param address - Address
   * @param chainId - Chain ID
   * @param config - Tracking config
   * @private
   */
  private async pollUpdates(
    address: Address,
    chainId: number,
    config: AddressTrackingConfig
  ): Promise<void> {
    try {
      // Check for balance changes if enabled
      if (config.trackBalances) {
        await this.checkBalanceChanges(address, chainId, config);
      }

      // Check for new transactions if enabled
      if (config.trackTransactions) {
        await this.checkNewTransactions(address, chainId);
      }

      // Update last update time
      const addressStatus = this.status.get(address);
      if (addressStatus) {
        const status = addressStatus.get(chainId);
        if (status) {
          status.lastUpdate = new Date();
        }
      }
    } catch (error) {
      this.handleError(error as Error, address, chainId);
    }
  }

  /**
   * Checks for balance changes
   * @param address - Address
   * @param chainId - Chain ID
   * @param config - Tracking config
   * @private
   */
  private async checkBalanceChanges(
    address: Address,
    chainId: number,
    config: AddressTrackingConfig
  ): Promise<void> {
    const cacheKey = `${address}-${chainId}`;

    // Fetch current balance
    const newBalance = await this.balanceService.getBalance(
      address,
      chainId,
      {
        forceFresh: true,
        includeTokens: config.trackTokens,
        tokens: config.tokenAddresses,
      }
    );

    // Check if balance changed
    const oldBalance = this.balanceCache.get(cacheKey);
    if (oldBalance) {
      // Compare balance values
      if (oldBalance.value !== newBalance.value) {
        // Balance changed - invoke callback
        if (this.handlers.onBalanceChange) {
          this.handlers.onBalanceChange({
            address,
            chainId,
            oldBalance,
            newBalance,
            timestamp: new Date(),
          });
        }
      }
    }

    // Update cache
    this.balanceCache.set(cacheKey, newBalance);
  }

  /**
   * Checks for new transactions
   * @param address - Address
   * @param chainId - Chain ID
   * @private
   */
  private async checkNewTransactions(
    address: Address,
    chainId: number
  ): Promise<void> {
    const cacheKey = `${address}-${chainId}`;

    // Fetch recent transactions
    const result = await this.transactionService.getTransactions(
      address,
      chainId,
      {
        page: 1,
        pageSize: 10,
        forceFresh: true,
      }
    );

    const transactions = result.items;

    // Get known transaction hashes
    let knownHashes = this.transactionCache.get(cacheKey);
    if (!knownHashes) {
      knownHashes = new Set();
      this.transactionCache.set(cacheKey, knownHashes);
      // Initialize with current transactions (don't emit events for initial state)
      for (const tx of transactions) {
        if (tx.hash) {
          knownHashes.add(tx.hash);
        }
      }
      return;
    }

    // Check for new transactions
    for (const tx of transactions) {
      if (tx.hash && !knownHashes.has(tx.hash)) {
        // New transaction - invoke callback
        if (this.handlers.onNewTransaction) {
          this.handlers.onNewTransaction({
            address,
            chainId,
            transaction: tx,
            timestamp: new Date(),
          });
        }

        knownHashes.add(tx.hash);
      }
    }

    // Prune old hashes to prevent unlimited growth (keep last 100)
    if (knownHashes.size > 100) {
      const toDelete = knownHashes.size - 100;
      const iter = knownHashes.values();
      for (let i = 0; i < toDelete; i++) {
        const val = iter.next().value;
        if (val) {
          knownHashes.delete(val);
        }
      }
    }
  }

  /**
   * Generates interval key for address/chain
   * @param address - Address
   * @param chainId - Chain ID
   * @private
   */
  private getIntervalKey(address: Address, chainId: number): string {
    return `${address}-${chainId}`;
  }

  /**
   * Handles tracking error
   * @param error - Error that occurred
   * @param address - Address
   * @param chainId - Chain ID
   * @private
   */
  private handleError(
    error: Error,
    address: Address,
    chainId: number
  ): void {
    // Update error count in status
    const addressStatus = this.status.get(address);
    if (addressStatus) {
      const status = addressStatus.get(chainId);
      if (status) {
        status.errorCount++;
        status.lastError = error;
      }
    }

    // Invoke error handler if provided
    if (this.handlers.onError) {
      this.handlers.onError(error, address, chainId);
    }
  }

  /**
   * Destroys the service and cleans up resources
   */
  destroy(): void {
    this.stopAll();
    this.configs.clear();
    this.status.clear();
    this.balanceCache.clear();
    this.transactionCache.clear();
  }
}
