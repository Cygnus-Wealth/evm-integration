import { WalletAddress } from '../blockchain/Address';
import { EvmChain } from '../blockchain/Chain';
import { Balance } from './Balance';
import type { Asset } from '@cygnus-wealth/data-models';

/**
 * Portfolio Aggregate Root
 * Represents a wallet's portfolio on a specific chain
 */
export class Portfolio {
  private balances: Map<string, Balance>;

  private constructor(
    public readonly address: WalletAddress,
    public readonly chain: EvmChain,
    balances?: Map<string, Balance>
  ) {
    this.balances = balances || new Map();
  }

  /**
   * Creates a new Portfolio
   */
  static create(address: string, chainId: number): Portfolio {
    return new Portfolio(
      WalletAddress.from(address),
      EvmChain.fromId(chainId)
    );
  }

  /**
   * Updates the balance for a specific asset
   */
  updateBalance(asset: Asset, amount: bigint): void {
    const balance = Balance.create(asset, amount);
    this.balances.set(asset.address || 'native', balance);
  }

  /**
   * Gets the balance for a specific asset
   */
  getBalance(asset: Asset): Balance {
    const key = asset.address || 'native';
    return this.balances.get(key) || Balance.zero(asset);
  }

  /**
   * Gets all non-zero balances
   */
  getAllBalances(): Balance[] {
    return Array.from(this.balances.values())
      .filter(balance => balance.isPositive());
  }

  /**
   * Gets the native token balance
   */
  getNativeBalance(): Balance | undefined {
    return this.balances.get('native');
  }

  /**
   * Gets all token balances (excluding native)
   */
  getTokenBalances(): Balance[] {
    return Array.from(this.balances.entries())
      .filter(([key]) => key !== 'native')
      .map(([_, balance]) => balance)
      .filter(balance => balance.isPositive());
  }

  /**
   * Checks if portfolio has any assets
   */
  isEmpty(): boolean {
    return this.getAllBalances().length === 0;
  }

  /**
   * Creates a snapshot of the portfolio
   */
  snapshot(): PortfolioSnapshot {
    return {
      address: this.address.toString(),
      chainId: this.chain.id,
      chainName: this.chain.name,
      balances: this.getAllBalances().map(b => ({
        asset: b.asset,
        amount: b.amount.toString(),
        formatted: b.formattedAmount
      })),
      timestamp: Date.now()
    };
  }
}

export interface PortfolioSnapshot {
  address: string;
  chainId: number;
  chainName: string;
  balances: Array<{
    asset: Asset;
    amount: string;
    formatted: string;
  }>;
  timestamp: number;
}