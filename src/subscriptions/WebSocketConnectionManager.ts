/**
 * WebSocket Connection Manager
 *
 * Manages a pool of WebSocket connections — one per (chain, provider) pair.
 * Connections are established lazily on first subscription request.
 *
 * Features:
 * - Connection pool keyed by chainId + provider tier
 * - Lazy establishment (connect on first use)
 * - Reconnection with exponential backoff (1s base, 30s max, 10 retries)
 * - Heartbeat monitoring (30s ping, 5s pong timeout)
 * - Subscription registry tracking active subs per connection
 *
 * @module subscriptions/WebSocketConnectionManager
 */

import {
  createPublicClient,
  webSocket,
  http,
  fallback,
  PublicClient,
  Chain,
} from 'viem';
import {
  mainnet,
  polygon,
  arbitrum,
  optimism,
  base,
  bsc,
  avalanche,
  fantom,
} from 'viem/chains';
import {
  ConnectionInfo,
  ConnectionStatus,
  TransportType,
  WebSocketConnectionConfig,
  DEFAULT_WS_CONNECTION_CONFIG,
  ChainWsEndpoint,
  SubscriptionEventType,
} from './types.js';
import { EventBus } from './EventBus.js';

interface PoolEntry {
  client: PublicClient;
  chainId: number;
  provider: string;
  url: string;
  transport: TransportType;
  status: ConnectionStatus;
  connectedAt?: Date;
  lastError?: string;
  reconnectAttempts: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  heartbeatTimer?: ReturnType<typeof setInterval>;
  subscriptionCount: number;
}

const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  137: polygon,
  42161: arbitrum,
  10: optimism,
  8453: base,
  56: bsc,
  43114: avalanche,
  250: fantom,
};

/**
 * Default WS endpoints per chain, ordered by provider priority
 */
export const DEFAULT_CHAIN_ENDPOINTS: ChainWsEndpoint[] = [
  {
    chainId: 1,
    name: 'Ethereum',
    wsUrls: [
      'wss://eth-mainnet.public.blastapi.io',
      'wss://ethereum.blockpi.network/v1/ws/public',
    ],
    httpUrls: [
      'https://ethereum-rpc.publicnode.com',
      'https://eth.public-rpc.com',
      'https://rpc.ankr.com/eth',
    ],
  },
  {
    chainId: 137,
    name: 'Polygon',
    wsUrls: [
      'wss://polygon-mainnet.public.blastapi.io',
      'wss://polygon.blockpi.network/v1/ws/public',
    ],
    httpUrls: [
      'https://polygon-bor-rpc.publicnode.com',
      'https://polygon-rpc.com',
      'https://rpc.ankr.com/polygon',
    ],
  },
  {
    chainId: 42161,
    name: 'Arbitrum',
    wsUrls: [
      'wss://arbitrum-one.public.blastapi.io',
    ],
    httpUrls: [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum-one-rpc.publicnode.com',
      'https://rpc.ankr.com/arbitrum',
    ],
  },
  {
    chainId: 10,
    name: 'Optimism',
    wsUrls: [
      'wss://optimism-mainnet.public.blastapi.io',
      'wss://optimism.blockpi.network/v1/ws/public',
    ],
    httpUrls: [
      'https://optimism-rpc.publicnode.com',
      'https://mainnet.optimism.io',
      'https://rpc.ankr.com/optimism',
    ],
  },
  {
    chainId: 8453,
    name: 'Base',
    wsUrls: [
      'wss://base-mainnet.public.blastapi.io',
    ],
    httpUrls: [
      'https://mainnet.base.org',
      'https://base-rpc.publicnode.com',
      'https://rpc.ankr.com/base',
    ],
  },
  {
    chainId: 56,
    name: 'BNB Chain',
    wsUrls: [
      'wss://bsc-rpc.publicnode.com',
      'wss://bsc-mainnet.public.blastapi.io',
    ],
    httpUrls: [
      'https://bsc-rpc.publicnode.com',
      'https://bsc-dataseed.binance.org',
      'https://rpc.ankr.com/bsc',
    ],
  },
  {
    chainId: 43114,
    name: 'Avalanche',
    wsUrls: [
      'wss://avalanche-c-chain-rpc.publicnode.com',
      'wss://ava-mainnet.public.blastapi.io/ext/bc/C/ws',
    ],
    httpUrls: [
      'https://avalanche-c-chain-rpc.publicnode.com',
      'https://api.avax.network/ext/bc/C/rpc',
      'https://rpc.ankr.com/avalanche',
    ],
  },
  {
    chainId: 250,
    name: 'Fantom',
    wsUrls: [
      'wss://fantom-rpc.publicnode.com',
    ],
    httpUrls: [
      'https://fantom-rpc.publicnode.com',
      'https://rpcapi.fantom.network',
      'https://rpc.ankr.com/fantom',
    ],
  },
];

export class WebSocketConnectionManager {
  private pool = new Map<string, PoolEntry>();
  private config: WebSocketConnectionConfig;
  private eventBus: EventBus;
  private endpoints: ChainWsEndpoint[];
  private destroyed = false;

  constructor(
    eventBus: EventBus,
    config?: Partial<WebSocketConnectionConfig>,
    endpoints?: ChainWsEndpoint[],
  ) {
    this.eventBus = eventBus;
    this.config = { ...DEFAULT_WS_CONNECTION_CONFIG, ...config };
    this.endpoints = endpoints ?? DEFAULT_CHAIN_ENDPOINTS;
  }

  /**
   * Get or lazily create a client for the given chain.
   * Tries WebSocket first, falls back to HTTP if WS unavailable.
   */
  async getClient(chainId: number): Promise<{ client: PublicClient; transport: TransportType }> {
    const key = this.poolKey(chainId);
    const existing = this.pool.get(key);
    if (existing && existing.status === 'connected') {
      return { client: existing.client, transport: existing.transport };
    }

    return this.connect(chainId);
  }

  async connect(chainId: number): Promise<{ client: PublicClient; transport: TransportType }> {
    if (this.destroyed) {
      throw new Error('ConnectionManager has been destroyed');
    }

    const endpoint = this.endpoints.find((e) => e.chainId === chainId);
    if (!endpoint) {
      throw new Error(`No endpoints configured for chain ${chainId}`);
    }

    const chain = CHAIN_MAP[chainId];
    if (!chain) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    const key = this.poolKey(chainId);

    // Attempt WebSocket connection
    if (endpoint.wsUrls.length > 0) {
      for (const wsUrl of endpoint.wsUrls) {
        try {
          this.updatePoolStatus(key, chainId, wsUrl, 'connecting', 'websocket');

          const transport = webSocket(wsUrl, {
            timeout: this.config.connectionTimeoutMs,
            reconnect: false, // We handle reconnection ourselves
          });

          const client = createPublicClient({ chain, transport }) as PublicClient;

          // Verify connection
          await Promise.race([
            client.getBlockNumber(),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error('WS connection timeout')),
                this.config.connectionTimeoutMs,
              ),
            ),
          ]);

          const entry: PoolEntry = {
            client,
            chainId,
            provider: this.extractProvider(wsUrl),
            url: wsUrl,
            transport: 'websocket',
            status: 'connected',
            connectedAt: new Date(),
            reconnectAttempts: 0,
            subscriptionCount: 0,
          };

          this.pool.set(key, entry);
          this.startHeartbeat(key);

          this.eventBus.emit(
            SubscriptionEventType.WEBSOCKET_CONNECTED,
            chainId,
            { url: wsUrl, provider: entry.provider },
          );

          return { client, transport: 'websocket' };
        } catch {
          // Try next WS URL
          continue;
        }
      }
    }

    // Fallback to HTTP
    return this.connectHttp(chainId, endpoint, chain);
  }

  private async connectHttp(
    chainId: number,
    endpoint: ChainWsEndpoint,
    chain: Chain,
  ): Promise<{ client: PublicClient; transport: TransportType }> {
    const key = this.poolKey(chainId);
    const transports = endpoint.httpUrls.map((url) => http(url));
    const client = createPublicClient({
      chain,
      transport: fallback(transports),
    }) as PublicClient;

    const entry: PoolEntry = {
      client,
      chainId,
      provider: 'http-fallback',
      url: endpoint.httpUrls[0],
      transport: 'polling',
      status: 'connected',
      connectedAt: new Date(),
      reconnectAttempts: 0,
      subscriptionCount: 0,
    };

    this.pool.set(key, entry);

    this.eventBus.emit(
      SubscriptionEventType.TRANSPORT_FALLBACK_TO_POLLING,
      chainId,
      { reason: 'WS unavailable', httpUrls: endpoint.httpUrls },
    );

    return { client, transport: 'polling' };
  }

  /**
   * Schedule reconnection with exponential backoff and jitter
   */
  scheduleReconnect(chainId: number): void {
    const key = this.poolKey(chainId);
    const entry = this.pool.get(key);
    if (!entry || this.destroyed) return;

    if (entry.reconnectAttempts >= this.config.maxReconnectAttempts) {
      entry.status = 'failed';
      this.eventBus.emit(
        SubscriptionEventType.WEBSOCKET_FAILED,
        chainId,
        { attempts: entry.reconnectAttempts, lastError: entry.lastError },
      );
      return;
    }

    entry.status = 'reconnecting';
    entry.reconnectAttempts++;

    const delay = this.calculateBackoff(entry.reconnectAttempts);

    this.eventBus.emit(
      SubscriptionEventType.WEBSOCKET_RECONNECTING,
      chainId,
      { attempt: entry.reconnectAttempts, delayMs: delay },
    );

    entry.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect(chainId);
      } catch {
        this.scheduleReconnect(chainId);
      }
    }, delay);
  }

  handleDisconnect(chainId: number, error?: Error): void {
    const key = this.poolKey(chainId);
    const entry = this.pool.get(key);
    if (!entry) return;

    entry.status = 'disconnected';
    entry.lastError = error?.message;
    this.stopHeartbeat(key);

    this.eventBus.emit(
      SubscriptionEventType.WEBSOCKET_DISCONNECTED,
      chainId,
      { error: error?.message },
    );

    this.scheduleReconnect(chainId);
  }

  incrementSubscriptionCount(chainId: number): void {
    const key = this.poolKey(chainId);
    const entry = this.pool.get(key);
    if (entry) entry.subscriptionCount++;
  }

  decrementSubscriptionCount(chainId: number): void {
    const key = this.poolKey(chainId);
    const entry = this.pool.get(key);
    if (entry && entry.subscriptionCount > 0) entry.subscriptionCount--;
  }

  getConnectionInfo(chainId: number): ConnectionInfo | undefined {
    const key = this.poolKey(chainId);
    const entry = this.pool.get(key);
    if (!entry) return undefined;

    return {
      chainId: entry.chainId,
      provider: entry.provider,
      status: entry.status,
      transport: entry.transport,
      url: entry.url,
      connectedAt: entry.connectedAt,
      lastError: entry.lastError,
      reconnectAttempts: entry.reconnectAttempts,
    };
  }

  getTransport(chainId: number): TransportType | undefined {
    const key = this.poolKey(chainId);
    return this.pool.get(key)?.transport;
  }

  isConnected(chainId: number): boolean {
    const key = this.poolKey(chainId);
    const entry = this.pool.get(key);
    return entry?.status === 'connected';
  }

  isWebSocket(chainId: number): boolean {
    const key = this.poolKey(chainId);
    const entry = this.pool.get(key);
    return entry?.transport === 'websocket' && entry?.status === 'connected';
  }

  disconnect(chainId: number): void {
    const key = this.poolKey(chainId);
    const entry = this.pool.get(key);
    if (!entry) return;

    this.stopHeartbeat(key);
    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
    }

    this.pool.delete(key);
  }

  destroy(): void {
    this.destroyed = true;
    for (const [key, entry] of this.pool) {
      this.stopHeartbeat(key);
      if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
    }
    this.pool.clear();
  }

  // ---- Private helpers ----

  private poolKey(chainId: number): string {
    return `chain-${chainId}`;
  }

  private updatePoolStatus(
    key: string,
    chainId: number,
    url: string,
    status: ConnectionStatus,
    transport: TransportType,
  ): void {
    const existing = this.pool.get(key);
    if (existing) {
      existing.status = status;
      existing.url = url;
      existing.transport = transport;
    }
  }

  private startHeartbeat(key: string): void {
    const entry = this.pool.get(key);
    if (!entry || entry.transport !== 'websocket') return;

    entry.heartbeatTimer = setInterval(async () => {
      try {
        await Promise.race([
          entry.client.getBlockNumber(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('Heartbeat pong timeout')),
              this.config.pongTimeoutMs,
            ),
          ),
        ]);
      } catch {
        this.handleDisconnect(entry.chainId, new Error('Heartbeat failed'));
      }
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(key: string): void {
    const entry = this.pool.get(key);
    if (entry?.heartbeatTimer) {
      clearInterval(entry.heartbeatTimer);
      entry.heartbeatTimer = undefined;
    }
  }

  private calculateBackoff(attempt: number): number {
    const baseDelay = this.config.reconnectBaseDelayMs;
    const maxDelay = this.config.reconnectMaxDelayMs;
    const exponential = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * baseDelay * 0.5;
    return Math.min(exponential + jitter, maxDelay);
  }

  private extractProvider(url: string): string {
    try {
      const hostname = new URL(url).hostname;
      const parts = hostname.split('.');
      // e.g. 'eth-mainnet.public.blastapi.io' -> 'blastapi'
      return parts.length >= 3 ? parts[parts.length - 2] : parts[0];
    } catch {
      return 'unknown';
    }
  }
}
