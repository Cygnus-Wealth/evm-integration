import { createPublicClient, webSocket, PublicClient, Address } from 'viem';
import { mainnet, polygon, arbitrum, optimism, base } from 'viem/chains';

export interface ChainConfig {
  chainId: number;
  name: string;
  wsUrl: string;
}

export interface WebSocketProviderOptions {
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class WebSocketProvider {
  private clients: Map<number, PublicClient> = new Map();
  private connections: Map<number, WebSocket> = new Map();
  private eventListeners: Map<string, Set<(data: any) => void>> = new Map();
  private options: Required<WebSocketProviderOptions>;

  private readonly chainConfigs: ChainConfig[] = [
    { chainId: 1, name: 'mainnet', wsUrl: 'wss://eth-mainnet.public.blastapi.io' },
    { chainId: 137, name: 'polygon', wsUrl: 'wss://polygon-mainnet.public.blastapi.io' },
    { chainId: 42161, name: 'arbitrum', wsUrl: 'wss://arbitrum-one.public.blastapi.io' },
    { chainId: 10, name: 'optimism', wsUrl: 'wss://optimism-mainnet.public.blastapi.io' },
    { chainId: 8453, name: 'base', wsUrl: 'wss://base.publicnode.com' }, // Note: May not actually support WebSocket
  ];

  constructor(options: WebSocketProviderOptions = {}) {
    this.options = {
      autoReconnect: options.autoReconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 5000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
    };
  }

  public async connect(chainId: number): Promise<PublicClient> {
    const chainConfig = this.chainConfigs.find(c => c.chainId === chainId);
    if (!chainConfig) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    if (this.clients.has(chainId)) {
      return this.clients.get(chainId)!;
    }

    const chain = this.getChain(chainId);
    const client = createPublicClient({
      chain,
      transport: webSocket(chainConfig.wsUrl),
    }) as PublicClient;

    this.clients.set(chainId, client);
    return client;
  }

  public disconnect(chainId: number): void {
    const client = this.clients.get(chainId);
    if (client) {
      this.clients.delete(chainId);
    }

    const connection = this.connections.get(chainId);
    if (connection) {
      connection.close();
      this.connections.delete(chainId);
    }
  }

  public async subscribeToBalance(
    address: Address,
    chainId: number,
    callback: (balance: bigint) => void
  ): Promise<() => void> {
    const client = await this.connect(chainId);
    
    const unsubscribe = await client.watchBlockNumber({
      onBlockNumber: async () => {
        try {
          const balance = await client.getBalance({ address });
          callback(balance);
        } catch (error) {
          console.error('Error fetching balance:', error);
        }
      },
    });

    return unsubscribe;
  }

  public async subscribeToTransactions(
    address: Address,
    chainId: number,
    callback: (tx: any) => void
  ): Promise<() => void> {
    const client = await this.connect(chainId);

    const unsubscribe = await client.watchPendingTransactions({
      onTransactions: async (txs) => {
        for (const tx of txs) {
          try {
            const transaction = await client.getTransaction({ hash: tx });
            if (transaction.from === address || transaction.to === address) {
              callback(transaction);
            }
          } catch (error) {
            console.error('Error fetching transaction:', error);
          }
        }
      },
    });

    return unsubscribe;
  }

  public getConnectedChains(): number[] {
    return Array.from(this.clients.keys());
  }

  public isConnected(chainId: number): boolean {
    return this.clients.has(chainId);
  }

  private getChain(chainId: number) {
    switch (chainId) {
      case 1:
        return mainnet;
      case 137:
        return polygon;
      case 42161:
        return arbitrum;
      case 10:
        return optimism;
      case 8453:
        return base;
      default:
        throw new Error(`Unsupported chain ID: ${chainId}`);
    }
  }

  public async cleanup(): Promise<void> {
    for (const chainId of this.clients.keys()) {
      this.disconnect(chainId);
    }
    this.eventListeners.clear();
  }
}