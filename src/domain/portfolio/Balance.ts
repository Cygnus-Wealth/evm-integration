import type { Asset } from '@cygnus-wealth/data-models';

/**
 * Value object representing an asset balance
 * Encapsulates amount and asset information
 */
export class Balance {
  private constructor(
    public readonly asset: Asset,
    public readonly amount: bigint,
    public readonly formattedAmount: string
  ) {}

  /**
   * Creates a new Balance
   */
  static create(asset: Asset, amount: bigint): Balance {
    const decimals = asset.decimals || 18;
    const divisor = BigInt(10 ** decimals);
    const wholePart = amount / divisor;
    const fractionalPart = amount % divisor;
    
    const formatted = fractionalPart === 0n
      ? wholePart.toString()
      : `${wholePart}.${fractionalPart.toString().padStart(decimals, '0').replace(/0+$/, '')}`;

    return new Balance(asset, amount, formatted);
  }

  /**
   * Creates an empty balance for an asset
   */
  static zero(asset: Asset): Balance {
    return Balance.create(asset, 0n);
  }

  /**
   * Adds another balance (must be same asset)
   */
  add(other: Balance): Balance {
    if (this.asset.address !== other.asset.address) {
      throw new Error('Cannot add balances of different assets');
    }
    return Balance.create(this.asset, this.amount + other.amount);
  }

  /**
   * Checks if balance is zero
   */
  isZero(): boolean {
    return this.amount === 0n;
  }

  /**
   * Checks if balance is positive
   */
  isPositive(): boolean {
    return this.amount > 0n;
  }

  equals(other: Balance): boolean {
    return this.asset.address === other.asset.address && 
           this.amount === other.amount;
  }

  toString(): string {
    return `${this.formattedAmount} ${this.asset.symbol}`;
  }
}