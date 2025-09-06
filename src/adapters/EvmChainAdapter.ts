import { 
  createPublicClient, 
  http, 
  webSocket, 
  PublicClient, 
  Address,
  formatUnits,
  parseAbi,
  fallback
} from 'viem';
import { 
  mainnet, 
  polygon, 
  arbitrum, 
  optimism, 
  base,
  Chain as ViemChain 
} from 'viem/chains';
import {
  IChainAdapter,
  TokenConfig,
  TransactionOptions,
  ChainInfo,
  Unsubscribe
} from '../types/IChainAdapter';
import { ChainConfig } from '../types/ChainConfig';
import { Balance, Transaction, AssetType, Chain as DataModelChain } from '@cygnus-wealth/data-models';
import { mapChainIdToChain, mapEvmBalanceToBalance, mapTokenToAsset } from '../utils/mappers';

// ERC20 ABI for balance queries
const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
]);

export class EvmChainAdapter implements IChainAdapter {
  private client: PublicClient | null = null;
  private wsClient: PublicClient | null = null;
  private config: ChainConfig;
  private viemChain: ViemChain;

  constructor(config: ChainConfig) {
    this.config = config;
    this.viemChain = this.getViemChain(config.id);
  }

  private getViemChain(chainId: number): ViemChain {
    switch (chainId) {
      case 1: return mainnet;
      case 137: return polygon;
      case 42161: return arbitrum;
      case 10: return optimism;
      case 8453: return base;
      default: 
        // Create custom chain for unsupported chains
        return {
          id: chainId,
          name: this.config.name,
          nativeCurrency: {
            name: this.config.symbol,
            symbol: this.config.symbol,
            decimals: this.config.decimals,
          },
          rpcUrls: {
            default: { http: this.config.endpoints.http },
            public: { http: this.config.endpoints.http },
          },
          blockExplorers: {
            default: { name: 'Explorer', url: this.config.explorer },
          },
        } as ViemChain;
    }
  }

  async connect(): Promise<void> {
    // Create HTTP client with fallback
    const httpTransports = this.config.endpoints.http.map(url => http(url));
    this.client = createPublicClient({
      chain: this.viemChain,
      transport: fallback(httpTransports),
    });

    // Create WebSocket client if available
    if (this.config.endpoints.ws && this.config.endpoints.ws.length > 0) {
      try {
        const wsTransports = this.config.endpoints.ws.map(url => webSocket(url));
        this.wsClient = createPublicClient({
          chain: this.viemChain,
          transport: fallback(wsTransports),
        });
      } catch (error) {
        console.warn(`WebSocket connection failed for chain ${this.config.id}:`, error);
        // Continue without WebSocket
      }
    }
  }

  disconnect(): void {
    // Viem clients don't need explicit disconnection
    this.client = null;
    this.wsClient = null;
  }

  private async ensureConnected(): Promise<PublicClient> {
    if (!this.client) {
      await this.connect();
    }
    return this.client!;
  }

  async getBalance(address: Address): Promise<Balance> {
    const client = await this.ensureConnected();
    const value = await client.getBalance({ address });
    
    // Use the mapper to create data-models compatible Balance
    const balanceData = {
      value,
      formatted: formatUnits(value, this.config.decimals),
      symbol: this.config.symbol,
      decimals: this.config.decimals,
    };
    
    return mapEvmBalanceToBalance(balanceData, address, this.config.id);
  }

  async getTokenBalances(address: Address, tokens?: TokenConfig[]): Promise<Balance[]> {
    const client = await this.ensureConnected();
    
    // Use provided tokens or default to popular tokens from config
    const tokensToCheck = tokens || this.config.tokens?.popular?.map(t => ({
      address: t.address as Address,
      symbol: t.symbol,
      decimals: t.decimals,
      name: t.name,
    })) || [];

    const balances: Balance[] = [];

    for (const token of tokensToCheck) {
      try {
        const balance = await client.readContract({
          address: token.address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        }) as bigint;

        // Get token metadata if not provided
        let decimals = token.decimals;
        let symbol = token.symbol;
        let name = token.name;

        if (!decimals) {
          decimals = await client.readContract({
            address: token.address,
            abi: ERC20_ABI,
            functionName: 'decimals',
          }) as number;
        }

        if (!symbol) {
          symbol = await client.readContract({
            address: token.address,
            abi: ERC20_ABI,
            functionName: 'symbol',
          }) as string;
        }

        if (!name) {
          name = await client.readContract({
            address: token.address,
            abi: ERC20_ABI,
            functionName: 'name',
          }) as string;
        }

        // Create Asset for this token
        const asset = mapTokenToAsset(
          token.address,
          symbol || 'UNKNOWN',
          name || 'Unknown Token',
          decimals || 18,
          this.config.id
        );

        // Create Balance object
        const tokenBalance: Balance = {
          assetId: asset.id,
          asset: asset,
          amount: balance.toString(),
          value: {
            amount: parseFloat(formatUnits(balance, decimals || 18)),
            currency: 'USD',
            timestamp: new Date()
          }
        };

        balances.push(tokenBalance);
      } catch (error) {
        console.warn(`Failed to get balance for token ${token.address}:`, error);
      }
    }

    return balances;
  }

  async getTransactions(address: Address, options?: TransactionOptions): Promise<Transaction[]> {
    const client = await this.ensureConnected();
    
    // Note: Getting transaction history requires an archive node or external service
    // For now, return empty array - would need Etherscan API or similar
    console.warn('Transaction history requires archive node or external API');
    return [];
  }

  async subscribeToBalance(
    address: Address,
    callback: (balance: Balance) => void
  ): Promise<Unsubscribe> {
    const client = this.wsClient || await this.ensureConnected();
    
    // Watch for new blocks and check balance
    const unwatch = client.watchBlockNumber({
      onBlockNumber: async () => {
        const balance = await this.getBalance(address);
        callback(balance);
      },
    });

    return () => unwatch();
  }

  async subscribeToTransactions(
    address: Address,
    callback: (transaction: Transaction) => void
  ): Promise<Unsubscribe> {
    const client = this.wsClient || await this.ensureConnected();
    
    // Watch for pending transactions involving this address
    const unwatch = client.watchPendingTransactions({
      onTransactions: async (hashes) => {
        for (const hash of hashes) {
          try {
            const tx = await client.getTransaction({ hash });
            if (tx.from === address || tx.to === address) {
              // Create data-models compatible Transaction
              const chain = mapChainIdToChain(this.config.id);
              const transaction: Transaction = {
                id: tx.hash,
                hash: tx.hash,
                chain: chain,
                from: tx.from,
                to: tx.to || '',
                value: tx.value.toString(),
                fee: {
                  amount: '0', // Would need to calculate from gasPrice * gasUsed
                  currency: 'USD',
                  timestamp: new Date()
                },
                timestamp: new Date(),
                status: 'pending',
                type: 'transfer' as any, // Would need to determine actual type
                blockNumber: tx.blockNumber?.toString(),
              };
              callback(transaction);
            }
          } catch (error) {
            // Transaction might not be available yet
          }
        }
      },
    });

    return () => unwatch();
  }

  getChainInfo(): ChainInfo {
    return {
      id: this.config.id,
      name: this.config.name,
      symbol: this.config.symbol,
      decimals: this.config.decimals,
      explorer: this.config.explorer,
    };
  }

  async isHealthy(): Promise<boolean> {
    try {
      const client = await this.ensureConnected();
      const blockNumber = await client.getBlockNumber();
      return blockNumber > 0n;
    } catch (error) {
      return false;
    }
  }
}