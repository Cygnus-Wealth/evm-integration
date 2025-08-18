import { createPublicClient, http, type PublicClient, type Address } from 'viem';
import { mainnet, polygon, arbitrum, optimism, bsc, avalanche } from 'viem/chains';
import type { Asset, Transaction } from '@cygnus-wealth/data-models';
import { IEvmRepository, RpcUnavailableError } from '../../domain/IEvmRepository';
import { WalletAddress } from '../../domain/blockchain/Address';
import { EvmChain } from '../../domain/blockchain/Chain';
import { Portfolio } from '../../domain/portfolio/Portfolio';
import { Balance } from '../../domain/portfolio/Balance';
import { ConfigurationService } from '../config/ConfigurationService';

/**
 * Infrastructure implementation of IEvmRepository
 * Uses viem for blockchain interactions
 */
export class EvmRepository implements IEvmRepository {
  private clients: Map<number, PublicClient> = new Map();
  private config: ConfigurationService;

  constructor(config?: ConfigurationService) {
    this.config = config || ConfigurationService.getInstance();
    this.initializeClients();
  }

  private initializeClients(): void {
    const chainConfigs = [
      { chain: mainnet, chainId: 1 },
      { chain: polygon, chainId: 137 },
      { chain: arbitrum, chainId: 42161 },
      { chain: optimism, chainId: 10 },
      { chain: bsc, chainId: 56 },
      { chain: avalanche, chainId: 43114 },
    ];

    for (const { chain, chainId } of chainConfigs) {
      try {
        const rpcUrl = this.config.getRpcUrl(chainId);
        const transport = http(rpcUrl, {
          timeout: this.config.getRequestTimeout(),
        });

        this.clients.set(chainId, createPublicClient({
          chain,
          transport,
        }) as PublicClient);
      } catch (error) {
        // Chain not configured, skip
        console.warn(`Chain ${chainId} not configured, skipping initialization`);
      }
    }
  }

  private getClient(chain: EvmChain): PublicClient {
    const client = this.clients.get(chain.id);
    if (!client) {
      throw new RpcUnavailableError(chain);
    }
    return client;
  }

  async getPortfolio(address: WalletAddress, chain: EvmChain): Promise<Portfolio> {
    const portfolio = Portfolio.create(address.toString(), chain.id);
    
    try {
      // Get native balance
      const nativeBalance = await this.getNativeBalance(address, chain);
      const nativeAsset: Asset = {
        symbol: chain.nativeCurrency,
        name: chain.nativeCurrency,
        decimals: 18,
        chainId: chain.id,
      };
      portfolio.updateBalance(nativeAsset, nativeBalance);

      // Note: Token balances would be fetched here if we had a token list
      // This would typically involve multicall or individual balance queries
      
      return portfolio;
    } catch (error) {
      if (error instanceof Error) {
        throw new RpcUnavailableError(chain, error);
      }
      throw error;
    }
  }

  async getNativeBalance(address: WalletAddress, chain: EvmChain): Promise<bigint> {
    const client = this.getClient(chain);
    
    try {
      const balance = await client.getBalance({
        address: address.toViemAddress(),
      });
      return balance;
    } catch (error) {
      if (error instanceof Error) {
        throw new RpcUnavailableError(chain, error);
      }
      throw error;
    }
  }

  async getTokenBalances(
    address: WalletAddress,
    chain: EvmChain,
    tokens: Asset[]
  ): Promise<Map<string, bigint>> {
    const client = this.getClient(chain);
    const balances = new Map<string, bigint>();

    // Implementation would use multicall for efficiency
    // For now, returning empty map as placeholder
    for (const token of tokens) {
      if (token.address) {
        // Would call ERC20 balanceOf here
        balances.set(token.address, 0n);
      }
    }

    return balances;
  }

  async getTransactions(
    address: WalletAddress,
    chain: EvmChain,
    limit: number = 100
  ): Promise<Transaction[]> {
    // This would typically use an indexer service like Etherscan API
    // or a subgraph for transaction history
    // Returning empty array as this requires external services
    return [];
  }

  subscribeToBalances(
    address: WalletAddress,
    chain: EvmChain,
    callback: (portfolio: Portfolio) => void
  ): () => void {
    const client = this.getClient(chain);
    let isSubscribed = true;

    // Poll for updates based on configuration
    const pollInterval = setInterval(async () => {
      if (!isSubscribed) return;
      
      try {
        const portfolio = await this.getPortfolio(address, chain);
        callback(portfolio);
      } catch (error) {
        console.error('Error polling portfolio:', error);
      }
    }, this.config.getPollingInterval());

    // Initial fetch
    this.getPortfolio(address, chain).then(callback).catch(console.error);

    // Return unsubscribe function
    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
    };
  }
}