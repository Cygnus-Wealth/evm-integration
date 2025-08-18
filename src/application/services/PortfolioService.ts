import { IEvmRepository } from '../../domain/IEvmRepository';
import { WalletAddress } from '../../domain/blockchain/Address';
import { EvmChain } from '../../domain/blockchain/Chain';
import { Portfolio } from '../../domain/portfolio/Portfolio';
import type { Asset, Transaction } from '@cygnus-wealth/data-models';

/**
 * Application service for portfolio operations
 * Orchestrates domain logic and repository calls
 */
export class PortfolioService {
  constructor(private readonly repository: IEvmRepository) {}

  /**
   * Gets a complete portfolio for an address and chain
   */
  async getPortfolio(address: string, chainId: number): Promise<Portfolio> {
    const walletAddress = WalletAddress.from(address);
    const chain = EvmChain.fromId(chainId);
    
    return this.repository.getPortfolio(walletAddress, chain);
  }

  /**
   * Gets only the native balance
   */
  async getNativeBalance(address: string, chainId: number): Promise<bigint> {
    const walletAddress = WalletAddress.from(address);
    const chain = EvmChain.fromId(chainId);
    
    return this.repository.getNativeBalance(walletAddress, chain);
  }

  /**
   * Gets balances for specific tokens
   */
  async getTokenBalances(
    address: string,
    chainId: number,
    tokens: Asset[]
  ): Promise<Map<string, bigint>> {
    const walletAddress = WalletAddress.from(address);
    const chain = EvmChain.fromId(chainId);
    
    return this.repository.getTokenBalances(walletAddress, chain, tokens);
  }

  /**
   * Gets transaction history
   */
  async getTransactions(
    address: string,
    chainId: number,
    limit?: number
  ): Promise<Transaction[]> {
    const walletAddress = WalletAddress.from(address);
    const chain = EvmChain.fromId(chainId);
    
    return this.repository.getTransactions(walletAddress, chain, limit);
  }

  /**
   * Subscribes to portfolio updates
   */
  subscribeToPortfolio(
    address: string,
    chainId: number,
    callback: (portfolio: Portfolio) => void
  ): () => void {
    const walletAddress = WalletAddress.from(address);
    const chain = EvmChain.fromId(chainId);
    
    return this.repository.subscribeToBalances(walletAddress, chain, callback);
  }

  /**
   * Validates if an address is valid
   */
  isValidAddress(address: string): boolean {
    try {
      WalletAddress.from(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks if a chain is supported
   */
  isChainSupported(chainId: number): boolean {
    return EvmChain.isSupported(chainId);
  }

  /**
   * Gets all supported chains
   */
  getSupportedChains(): Array<{ id: number; name: string; nativeCurrency: string }> {
    return EvmChain.getAllSupported().map(chain => ({
      id: chain.id,
      name: chain.name,
      nativeCurrency: chain.nativeCurrency,
    }));
  }
}