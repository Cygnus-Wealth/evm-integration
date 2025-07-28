import { 
  createPublicClient, 
  webSocket, 
  http, 
  PublicClient, 
  Address,
  Transport,
  Chain,
  fallback
} from 'viem';
import { mainnet, polygon, arbitrum, optimism, bsc, avalanche } from 'viem/chains';
import { ConnectionManager } from '../services/ConnectionManager';

export interface ChainConfig {
  chainId: number;
  name: string;
  wsUrls: string[];
  httpUrls: string[];
  chain: Chain;
}

export interface EnhancedWebSocketProviderOptions {
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  pollInterval?: number;
  connectionTimeout?: number;
  preferWebSocket?: boolean;
}

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED_WS = 'CONNECTED_WS',
  CONNECTED_HTTP = 'CONNECTED_HTTP',
  RECONNECTING = 'RECONNECTING',
  ERROR = 'ERROR'
}

interface SubscriptionOptions {
  pollInterval?: number;
}

export class EnhancedWebSocketProvider {
  private clients: Map<number, PublicClient> = new Map();
  private connectionStates: Map<number, ConnectionState> = new Map();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private wsUnsubscribes: Map<string, () => void> = new Map();
  private options: Required<EnhancedWebSocketProviderOptions>;
  private connectionManager: ConnectionManager;
  private reconnectAttempts: Map<number, number> = new Map();

  private readonly chainConfigs: ChainConfig[] = [
    { 
      chainId: 1, 
      name: 'mainnet',
      chain: mainnet,
      wsUrls: [
        'wss://ethereum-rpc.publicnode.com',
        'wss://eth-mainnet.public.blastapi.io',
        'wss://rpc.ankr.com/eth/ws'
      ],
      httpUrls: [
        'https://ethereum-rpc.publicnode.com',
        'https://eth.public-rpc.com',
        'https://rpc.ankr.com/eth'
      ]
    },
    { 
      chainId: 137, 
      name: 'polygon',
      chain: polygon,
      wsUrls: [
        'wss://polygon-bor-rpc.publicnode.com',
        'wss://polygon-mainnet.public.blastapi.io',
        'wss://rpc.ankr.com/polygon/ws'
      ],
      httpUrls: [
        'https://polygon-bor-rpc.publicnode.com',
        'https://polygon-rpc.com',
        'https://rpc.ankr.com/polygon'
      ]
    },
    { 
      chainId: 42161, 
      name: 'arbitrum',
      chain: arbitrum,
      wsUrls: [
        'wss://arbitrum-one-rpc.publicnode.com',
        'wss://arb-mainnet.public.blastapi.io',
        'wss://rpc.ankr.com/arbitrum/ws'
      ],
      httpUrls: [
        'https://arbitrum-one-rpc.publicnode.com',
        'https://arb1.arbitrum.io/rpc',
        'https://rpc.ankr.com/arbitrum'
      ]
    },
    { 
      chainId: 10, 
      name: 'optimism',
      chain: optimism,
      wsUrls: [
        'wss://optimism-rpc.publicnode.com',
        'wss://optimism-mainnet.public.blastapi.io',
        'wss://rpc.ankr.com/optimism/ws'
      ],
      httpUrls: [
        'https://optimism-rpc.publicnode.com',
        'https://mainnet.optimism.io',
        'https://rpc.ankr.com/optimism'
      ]
    },
    { 
      chainId: 56, 
      name: 'bsc',
      chain: bsc,
      wsUrls: [
        'wss://bsc-rpc.publicnode.com',
        'wss://bsc-mainnet.public.blastapi.io',
        'wss://rpc.ankr.com/bsc/ws'
      ],
      httpUrls: [
        'https://bsc-rpc.publicnode.com',
        'https://bsc-dataseed.binance.org',
        'https://rpc.ankr.com/bsc'
      ]
    },
    { 
      chainId: 43114, 
      name: 'avalanche',
      chain: avalanche,
      wsUrls: [
        'wss://avalanche-c-chain-rpc.publicnode.com',
        'wss://ava-mainnet.public.blastapi.io/ext/bc/C/ws',
        'wss://rpc.ankr.com/avalanche/ws'
      ],
      httpUrls: [
        'https://avalanche-c-chain-rpc.publicnode.com',
        'https://api.avax.network/ext/bc/C/rpc',
        'https://rpc.ankr.com/avalanche'
      ]
    }
  ];

  constructor(options: EnhancedWebSocketProviderOptions = {}) {
    this.options = {
      autoReconnect: options.autoReconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 5000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
      pollInterval: options.pollInterval ?? 12000, // 12 seconds default
      connectionTimeout: options.connectionTimeout ?? 10000,
      preferWebSocket: options.preferWebSocket ?? true,
    };

    this.connectionManager = new ConnectionManager();
  }

  public async connect(chainId: number): Promise<PublicClient> {
    const chainConfig = this.chainConfigs.find(c => c.chainId === chainId);
    if (!chainConfig) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    // Return existing client if already connected
    if (this.clients.has(chainId)) {
      return this.clients.get(chainId)!;
    }

    this.connectionStates.set(chainId, ConnectionState.CONNECTING);

    try {
      // Try WebSocket first if preferred
      if (this.options.preferWebSocket) {
        const wsClient = await this.createWebSocketClient(chainConfig);
        if (wsClient) {
          this.clients.set(chainId, wsClient);
          this.connectionStates.set(chainId, ConnectionState.CONNECTED_WS);
          this.reconnectAttempts.set(chainId, 0);
          return wsClient;
        }
      }

      // Fallback to HTTP with polling
      const httpClient = await this.createHttpClient(chainConfig);
      this.clients.set(chainId, httpClient);
      this.connectionStates.set(chainId, ConnectionState.CONNECTED_HTTP);
      this.reconnectAttempts.set(chainId, 0);
      return httpClient;

    } catch (error) {
      this.connectionStates.set(chainId, ConnectionState.ERROR);
      throw error;
    }
  }

  private async createWebSocketClient(chainConfig: ChainConfig): Promise<PublicClient | null> {
    // Try each WebSocket URL in order
    for (const wsUrl of chainConfig.wsUrls) {
      try {
        const transport = webSocket(wsUrl, {
          timeout: this.options.connectionTimeout,
          reconnect: this.options.autoReconnect ? {
            delay: this.options.reconnectInterval,
            attempts: this.options.maxReconnectAttempts,
          } : undefined,
        });

        const client = createPublicClient({
          chain: chainConfig.chain,
          transport,
        }) as PublicClient;

        // Test the connection
        await Promise.race([
          client.getBlockNumber(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('WebSocket connection timeout')), this.options.connectionTimeout)
          )
        ]);

        console.log(`WebSocket connected to ${chainConfig.name} via ${wsUrl}`);
        return client;
      } catch (error) {
        console.warn(`WebSocket connection failed for ${wsUrl}:`, error);
        continue;
      }
    }

    return null;
  }

  private async createHttpClient(chainConfig: ChainConfig): Promise<PublicClient> {
    // Create fallback transport with multiple HTTP endpoints
    const transports = chainConfig.httpUrls.map(url => http(url));
    
    const client = createPublicClient({
      chain: chainConfig.chain,
      transport: fallback(transports),
    }) as PublicClient;

    console.log(`HTTP polling fallback activated for ${chainConfig.name}`);
    return client;
  }

  public async subscribeToBalance(
    address: Address,
    chainId: number,
    callback: (balance: bigint) => void,
    options: SubscriptionOptions = {}
  ): Promise<() => void> {
    const client = await this.connect(chainId);
    const state = this.connectionStates.get(chainId);
    const subscriptionKey = `balance-${chainId}-${address}`;

    // Clean up any existing subscription
    this.unsubscribeByKey(subscriptionKey);

    if (state === ConnectionState.CONNECTED_WS) {
      // Use WebSocket subscription
      try {
        const unsubscribe = await client.watchBlockNumber({
          onBlockNumber: async () => {
            try {
              const balance = await client.getBalance({ address });
              callback(balance);
            } catch (error) {
              console.error('Error fetching balance via WebSocket:', error);
              // Fallback to polling on error
              await this.fallbackToPolling(chainId);
              this.setupPollingSubscription(subscriptionKey, client, address, callback, options);
            }
          },
        });

        this.wsUnsubscribes.set(subscriptionKey, unsubscribe);
        return () => this.unsubscribeByKey(subscriptionKey);
      } catch (error) {
        console.error('WebSocket subscription failed, falling back to polling:', error);
        await this.fallbackToPolling(chainId);
      }
    }

    // Use polling for HTTP connections or as fallback
    this.setupPollingSubscription(subscriptionKey, client, address, callback, options);
    return () => this.unsubscribeByKey(subscriptionKey);
  }

  private setupPollingSubscription(
    key: string,
    client: PublicClient,
    address: Address,
    callback: (balance: bigint) => void,
    options: SubscriptionOptions
  ): void {
    const pollInterval = options.pollInterval || this.options.pollInterval;

    // Initial fetch
    client.getBalance({ address })
      .then(callback)
      .catch(error => console.error('Error fetching balance:', error));

    // Set up polling
    const interval = setInterval(async () => {
      try {
        const balance = await client.getBalance({ address });
        callback(balance);
      } catch (error) {
        console.error('Error polling balance:', error);
      }
    }, pollInterval);

    this.pollingIntervals.set(key, interval);
  }

  public async subscribeToTokenBalance(
    address: Address,
    tokenAddress: Address,
    chainId: number,
    callback: (balance: bigint) => void,
    options: SubscriptionOptions = {}
  ): Promise<() => void> {
    const client = await this.connect(chainId);
    const state = this.connectionStates.get(chainId);
    const subscriptionKey = `token-balance-${chainId}-${address}-${tokenAddress}`;

    // Clean up any existing subscription
    this.unsubscribeByKey(subscriptionKey);

    if (state === ConnectionState.CONNECTED_WS) {
      // Use WebSocket subscription
      try {
        const unsubscribe = await client.watchBlockNumber({
          onBlockNumber: async () => {
            try {
              const balance = await client.readContract({
                address: tokenAddress,
                abi: [
                  {
                    name: 'balanceOf',
                    type: 'function',
                    stateMutability: 'view',
                    inputs: [{ name: 'owner', type: 'address' }],
                    outputs: [{ name: 'balance', type: 'uint256' }],
                  },
                ],
                functionName: 'balanceOf',
                args: [address],
              }) as bigint;
              callback(balance);
            } catch (error) {
              console.error('Error fetching token balance via WebSocket:', error);
              // Fallback to polling on error
              await this.fallbackToPolling(chainId);
              this.setupTokenPollingSubscription(subscriptionKey, client, address, tokenAddress, callback, options);
            }
          },
        });

        this.wsUnsubscribes.set(subscriptionKey, unsubscribe);
        return () => this.unsubscribeByKey(subscriptionKey);
      } catch (error) {
        console.error('WebSocket subscription failed, falling back to polling:', error);
        await this.fallbackToPolling(chainId);
      }
    }

    // Use polling for HTTP connections or as fallback
    this.setupTokenPollingSubscription(subscriptionKey, client, address, tokenAddress, callback, options);
    return () => this.unsubscribeByKey(subscriptionKey);
  }

  private setupTokenPollingSubscription(
    key: string,
    client: PublicClient,
    address: Address,
    tokenAddress: Address,
    callback: (balance: bigint) => void,
    options: SubscriptionOptions
  ): void {
    const pollInterval = options.pollInterval || this.options.pollInterval;

    // Initial fetch
    client.readContract({
      address: tokenAddress,
      abi: [
        {
          name: 'balanceOf',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'owner', type: 'address' }],
          outputs: [{ name: 'balance', type: 'uint256' }],
        },
      ],
      functionName: 'balanceOf',
      args: [address],
    })
      .then(balance => callback(balance as bigint))
      .catch(error => console.error('Error fetching token balance:', error));

    // Set up polling
    const interval = setInterval(async () => {
      try {
        const balance = await client.readContract({
          address: tokenAddress,
          abi: [
            {
              name: 'balanceOf',
              type: 'function',
              stateMutability: 'view',
              inputs: [{ name: 'owner', type: 'address' }],
              outputs: [{ name: 'balance', type: 'uint256' }],
            },
          ],
          functionName: 'balanceOf',
          args: [address],
        }) as bigint;
        callback(balance);
      } catch (error) {
        console.error('Error polling token balance:', error);
      }
    }, pollInterval);

    this.pollingIntervals.set(key, interval);
  }

  public async subscribeToTransactions(
    address: Address,
    chainId: number,
    callback: (tx: any) => void,
    options: SubscriptionOptions = {}
  ): Promise<() => void> {
    const client = await this.connect(chainId);
    const state = this.connectionStates.get(chainId);
    const subscriptionKey = `tx-${chainId}-${address}`;

    // Clean up any existing subscription
    this.unsubscribeByKey(subscriptionKey);

    if (state === ConnectionState.CONNECTED_WS) {
      // Use WebSocket subscription
      try {
        const unsubscribe = await client.watchPendingTransactions({
          onTransactions: async (hashes) => {
            for (const hash of hashes) {
              try {
                const tx = await client.getTransaction({ hash });
                if (tx && (tx.from === address || tx.to === address)) {
                  callback(tx);
                }
              } catch (error) {
                console.error('Error fetching transaction:', error);
              }
            }
          },
        });

        this.wsUnsubscribes.set(subscriptionKey, unsubscribe);
        return () => this.unsubscribeByKey(subscriptionKey);
      } catch (error) {
        console.error('WebSocket transaction subscription failed, falling back to polling:', error);
        await this.fallbackToPolling(chainId);
      }
    }

    // For HTTP/polling, we can only poll recent blocks
    this.setupTransactionPolling(subscriptionKey, client, address, callback, options);
    return () => this.unsubscribeByKey(subscriptionKey);
  }

  private setupTransactionPolling(
    key: string,
    client: PublicClient,
    address: Address,
    callback: (tx: any) => void,
    options: SubscriptionOptions
  ): void {
    const pollInterval = options.pollInterval || this.options.pollInterval;
    let lastBlockNumber: bigint | null = null;

    const checkNewTransactions = async () => {
      try {
        const currentBlock = await client.getBlockNumber();
        
        if (lastBlockNumber === null) {
          lastBlockNumber = currentBlock;
          return;
        }

        // Check new blocks for transactions
        for (let blockNum = lastBlockNumber + 1n; blockNum <= currentBlock; blockNum++) {
          const block = await client.getBlock({
            blockNumber: blockNum,
            includeTransactions: true
          });

          if (block.transactions) {
            for (const tx of block.transactions) {
              if (typeof tx === 'object' && (tx.from === address || tx.to === address)) {
                callback(tx);
              }
            }
          }
        }

        lastBlockNumber = currentBlock;
      } catch (error) {
        console.error('Error polling transactions:', error);
      }
    };

    // Set up polling
    const interval = setInterval(checkNewTransactions, pollInterval);
    this.pollingIntervals.set(key, interval);

    // Initial check
    checkNewTransactions();
  }

  private async fallbackToPolling(chainId: number): Promise<void> {
    const chainConfig = this.chainConfigs.find(c => c.chainId === chainId);
    if (!chainConfig) return;

    console.log(`Falling back to HTTP polling for ${chainConfig.name}`);
    
    try {
      const httpClient = await this.createHttpClient(chainConfig);
      this.clients.set(chainId, httpClient);
      this.connectionStates.set(chainId, ConnectionState.CONNECTED_HTTP);
    } catch (error) {
      console.error('Failed to create HTTP client:', error);
      this.connectionStates.set(chainId, ConnectionState.ERROR);
    }
  }

  private unsubscribeByKey(key: string): void {
    // Clean up WebSocket subscription
    const wsUnsubscribe = this.wsUnsubscribes.get(key);
    if (wsUnsubscribe) {
      wsUnsubscribe();
      this.wsUnsubscribes.delete(key);
    }

    // Clean up polling interval
    const interval = this.pollingIntervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(key);
    }
  }

  public disconnect(chainId: number): void {
    // Clean up all subscriptions for this chain
    const keysToRemove: string[] = [];
    
    for (const key of this.wsUnsubscribes.keys()) {
      if (key.includes(`-${chainId}-`)) {
        keysToRemove.push(key);
      }
    }
    
    for (const key of this.pollingIntervals.keys()) {
      if (key.includes(`-${chainId}-`)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => this.unsubscribeByKey(key));

    // Remove client
    this.clients.delete(chainId);
    this.connectionStates.set(chainId, ConnectionState.DISCONNECTED);
    this.reconnectAttempts.delete(chainId);
  }

  public getConnectionState(chainId: number): ConnectionState {
    return this.connectionStates.get(chainId) || ConnectionState.DISCONNECTED;
  }

  public isWebSocketConnected(chainId: number): boolean {
    return this.connectionStates.get(chainId) === ConnectionState.CONNECTED_WS;
  }

  public getConnectedChains(): number[] {
    return Array.from(this.clients.keys());
  }

  public async cleanup(): Promise<void> {
    // Clean up all subscriptions
    for (const key of this.wsUnsubscribes.keys()) {
      this.unsubscribeByKey(key);
    }
    
    for (const key of this.pollingIntervals.keys()) {
      this.unsubscribeByKey(key);
    }

    // Disconnect all chains
    for (const chainId of this.clients.keys()) {
      this.disconnect(chainId);
    }

    this.connectionStates.clear();
    this.reconnectAttempts.clear();
  }
}