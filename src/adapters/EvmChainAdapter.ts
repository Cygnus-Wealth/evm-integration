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
  bsc,
  sepolia,
  Chain as ViemChain
} from 'viem/chains';
import {
  IChainAdapter,
  TokenConfig,
  TransactionOptions,
  ChainInfo,
  Unsubscribe
} from '../types/IChainAdapter.js';
import { ChainConfig } from '../types/ChainConfig.js';
import { Balance, Transaction, AssetType, Chain as DataModelChain } from '@cygnus-wealth/data-models';
import { mapChainIdToChain, mapEvmBalanceToBalance, mapTokenToAsset } from '../utils/mappers.js';
import type { TokenDiscoveryResult, TokenDiscoveryError, DiscoveredToken } from '../types/TokenDiscovery.js';

// ERC20 ABI for balance queries
const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
]);

const SPAM_PATTERNS = [
  /https?:\/\//i,         // URLs in name/symbol
  /\.com|\.io|\.live|\.xyz|\.finance/i, // Domain patterns
  /claim|reward|airdrop/i, // Airdrop scam keywords
  /visit|redeem/i,         // Call-to-action scam keywords
];

/**
 * Detects likely spam/scam tokens by name or symbol patterns
 */
export function isSpamToken(symbol: string, name: string): boolean {
  const combined = `${symbol} ${name}`;
  return SPAM_PATTERNS.some(pattern => pattern.test(combined));
}

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
      case 56: return bsc;
      case 11155111: return sepolia;
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
    const seenAssetIds = new Set<string>();

    for (const token of tokensToCheck) {
      try {
        const balance = await client.readContract({
          address: token.address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        }) as bigint;

        // Skip zero-balance tokens
        if (balance === 0n) continue;

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

        // Filter spam/scam tokens by name patterns
        if (isSpamToken(symbol || '', name || '')) continue;

        // Create Asset for this token
        const asset = mapTokenToAsset(
          token.address,
          symbol || 'UNKNOWN',
          name || 'Unknown Token',
          decimals || 18,
          this.config.id
        );

        // Deduplicate by assetId
        if (seenAssetIds.has(asset.id)) continue;
        seenAssetIds.add(asset.id);

        // Create Balance object with human-readable amount
        const tokenBalance: Balance = {
          assetId: asset.id,
          asset: asset,
          amount: formatUnits(balance, decimals || 18),
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
              // Create native asset for the chain
              const nativeAsset = mapTokenToAsset(
                '0x0000000000000000000000000000000000000000',
                this.config.symbol,
                this.config.name,
                this.config.decimals,
                this.config.id
              );

              const transaction: Transaction = {
                id: tx.hash,
                accountId: address,
                hash: tx.hash,
                chain: chain,
                from: tx.from,
                to: tx.to || '',
                timestamp: new Date(),
                status: 'PENDING',
                type: 'TRANSFER_OUT' as any,
                blockNumber: Number(tx.blockNumber || 0),
                assetsOut: tx.value > 0n ? [{
                  asset: nativeAsset,
                  amount: tx.value.toString(),
                }] : undefined,
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

  async discoverTokens(address: Address): Promise<TokenDiscoveryResult> {
    const client = await this.ensureConnected();
    const result: TokenDiscoveryResult = {
      address,
      chainId: this.config.id,
      tokens: [],
      errors: [],
    };

    let alchemyResponse: {
      address: string;
      tokenBalances: Array<{
        contractAddress: Address;
        tokenBalance: string | null;
        error: string | null;
      }>;
    };

    try {
      alchemyResponse = await (client as any).request({
        method: 'alchemy_getTokenBalances',
        params: [address, 'DEFAULT_TOKENS'],
      });
    } catch (err: any) {
      result.errors.push({
        chainId: this.config.id,
        message: err.message || 'Token discovery API unavailable',
        code: 'DISCOVERY_API_UNAVAILABLE',
      });
      return result;
    }

    for (const entry of alchemyResponse.tokenBalances) {
      // Report Alchemy-level errors
      if (entry.error) {
        result.errors.push({
          contractAddress: entry.contractAddress,
          chainId: this.config.id,
          message: entry.error,
          code: 'TOKEN_BALANCE_ERROR',
        });
        continue;
      }

      // Skip zero-balance tokens
      const rawBalance = BigInt(entry.tokenBalance || '0');
      if (rawBalance === 0n) continue;

      // Fetch token metadata
      try {
        const decimals = await client.readContract({
          address: entry.contractAddress,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }) as number;

        const symbol = await client.readContract({
          address: entry.contractAddress,
          abi: ERC20_ABI,
          functionName: 'symbol',
        }) as string;

        const name = await client.readContract({
          address: entry.contractAddress,
          abi: ERC20_ABI,
          functionName: 'name',
        }) as string;

        // Filter spam tokens
        if (isSpamToken(symbol || '', name || '')) continue;

        result.tokens.push({
          contractAddress: entry.contractAddress,
          balance: rawBalance.toString(),
          symbol,
          name,
          decimals,
        });
      } catch (err: any) {
        result.errors.push({
          contractAddress: entry.contractAddress,
          chainId: this.config.id,
          message: err.message || 'Failed to fetch token metadata',
          code: 'METADATA_FETCH_FAILED',
        });
      }
    }

    return result;
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