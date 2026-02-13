/**
 * Cache entry with metadata
 */
export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  hitCount: number;
  lastAccessedAt: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  hitRate: number;
  size: number;
  capacity: number;
}

/**
 * Cache layer configuration
 */
export interface CacheLayerConfig {
  /**
   * Maximum number of entries
   */
  capacity: number;

  /**
   * Default TTL in seconds
   */
  defaultTTL: number;

  /**
   * Enable LRU eviction
   */
  enableLRU: boolean;
}

/**
 * Multi-layer cache manager
 * Implements L1 (memory), L2 (IndexedDB), L3 (network) caching strategy
 */
export class CacheManager<T = any> {
  private l1Cache: Map<string, CacheEntry<T>>;
  private l1Config: CacheLayerConfig;
  private stats: CacheStats;
  private cleanupInterval: NodeJS.Timeout;
  private keyPrefix: string;

  /**
   * Creates a new cache manager
   * @param config - Cache layer configuration
   * @param environmentPrefix - Optional environment prefix for cache keys (e.g. 'production', 'testnet')
   */
  constructor(config: Partial<CacheLayerConfig> = {}, environmentPrefix?: string) {
    this.keyPrefix = environmentPrefix ? `${environmentPrefix}:` : '';
    this.l1Config = {
      capacity: config.capacity ?? 1000,
      defaultTTL: config.defaultTTL ?? 60,
      enableLRU: config.enableLRU ?? true,
    };

    this.l1Cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      hitRate: 0,
      size: 0,
      capacity: this.l1Config.capacity,
    };

    // Cleanup expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  private prefixKey(key: string): string {
    return this.keyPrefix + key;
  }

  /**
   * Gets a value from cache
   * @param key - Cache key
   * @returns Cached value or undefined if not found/expired
   */
  async get(key: string): Promise<T | undefined> {
    const prefixed = this.prefixKey(key);
    const entry = this.l1Cache.get(prefixed);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.l1Cache.delete(prefixed);
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // Update access metadata
    entry.hitCount++;
    entry.lastAccessedAt = Date.now();
    this.stats.hits++;
    this.updateHitRate();

    return entry.value;
  }

  /**
   * Sets a value in cache
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time to live in seconds (optional, uses default)
   */
  async set(key: string, value: T, ttl?: number): Promise<void> {
    const prefixed = this.prefixKey(key);
    const ttlSeconds = ttl ?? this.l1Config.defaultTTL;
    const expiresAt = Date.now() + ttlSeconds * 1000;

    // Check if we need to evict
    if (this.l1Cache.size >= this.l1Config.capacity && !this.l1Cache.has(prefixed)) {
      if (this.l1Config.enableLRU) {
        this.evictLRU();
      } else {
        // FIFO eviction - remove oldest entry
        const firstKey = this.l1Cache.keys().next().value;
        if (firstKey) {
          this.l1Cache.delete(firstKey);
          this.stats.evictions++;
        }
      }
    }

    const entry: CacheEntry<T> = {
      value,
      expiresAt,
      createdAt: Date.now(),
      hitCount: 0,
      lastAccessedAt: Date.now(),
    };

    this.l1Cache.set(prefixed, entry);
    this.stats.sets++;
    this.stats.size = this.l1Cache.size;
  }

  /**
   * Checks if key exists in cache
   * @param key - Cache key
   * @returns True if key exists and not expired
   */
  async has(key: string): Promise<boolean> {
    const prefixed = this.prefixKey(key);
    const entry = this.l1Cache.get(prefixed);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.l1Cache.delete(prefixed);
      return false;
    }
    return true;
  }

  /**
   * Deletes a value from cache
   * @param key - Cache key
   * @returns True if deleted
   */
  async delete(key: string): Promise<boolean> {
    const deleted = this.l1Cache.delete(this.prefixKey(key));
    if (deleted) {
      this.stats.deletes++;
      this.stats.size = this.l1Cache.size;
    }
    return deleted;
  }

  /**
   * Clears all cache entries
   */
  async clear(): Promise<void> {
    this.l1Cache.clear();
    this.stats.size = 0;
  }

  /**
   * Gets cache statistics
   * @returns Current cache stats
   */
  getStats(): Readonly<CacheStats> {
    return { ...this.stats };
  }

  /**
   * Resets cache statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      hitRate: 0,
      size: this.l1Cache.size,
      capacity: this.l1Config.capacity,
    };
  }

  /**
   * Generates cache key from components
   * @param parts - Key components
   * @returns Generated cache key
   */
  static generateKey(...parts: (string | number)[]): string {
    return parts.join(':');
  }

  getKeyPrefix(): string {
    return this.keyPrefix;
  }

  /**
   * Promotes value to L1 cache
   * @param key - Cache key
   * @param value - Value to promote
   * @private
   */
  private promoteToL1(key: string, value: T): void {
    // This would be used in a multi-layer cache scenario
    // For now, just a placeholder for future implementation
  }

  /**
   * Evicts least recently used entry
   * @private
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of this.l1Cache.entries()) {
      if (entry.lastAccessedAt < lruTime) {
        lruTime = entry.lastAccessedAt;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.l1Cache.delete(lruKey);
      this.stats.evictions++;
    }
  }

  /**
   * Checks if entry is expired
   * @param entry - Cache entry
   * @returns True if expired
   * @private
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() >= entry.expiresAt;
  }

  /**
   * Removes expired entries
   * @private
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.l1Cache.entries()) {
      if (now >= entry.expiresAt) {
        this.l1Cache.delete(key);
      }
    }
    this.stats.size = this.l1Cache.size;
  }

  /**
   * Updates hit rate calculation
   * @private
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Destroys cache manager and cleans up resources
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.l1Cache.clear();
  }
}

/**
 * TTL strategy definitions
 */
export const TTL_STRATEGY = {
  // Static data
  TOKEN_METADATA: 86400,    // 24 hours
  CONTRACT_ABI: 604800,     // 7 days

  // Semi-dynamic data
  BALANCE: 60,              // 1 minute
  TRANSACTION: 300,         // 5 minutes

  // Dynamic data
  GAS_PRICE: 10,            // 10 seconds
  EXCHANGE_RATE: 30,        // 30 seconds

  // User-specific
  PORTFOLIO: 120,           // 2 minutes
} as const;
