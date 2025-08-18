import { isAddress, type Address as ViemAddress } from 'viem';

/**
 * Value object representing an Ethereum wallet address
 * Ensures address validity and provides domain-specific behavior
 */
export class WalletAddress {
  private constructor(private readonly value: ViemAddress) {}

  /**
   * Creates a WalletAddress from a string
   * @throws {InvalidAddressError} if the address is invalid
   */
  static from(address: string): WalletAddress {
    if (!isAddress(address)) {
      throw new InvalidAddressError(address);
    }
    return new WalletAddress(address as ViemAddress);
  }

  /**
   * Checks equality with another address (case-insensitive)
   */
  equals(other: WalletAddress): boolean {
    return this.value.toLowerCase() === other.value.toLowerCase();
  }

  /**
   * Returns the checksummed address string
   */
  toString(): string {
    return this.value;
  }

  /**
   * Returns the underlying viem Address type
   * Used only in infrastructure layer
   */
  toViemAddress(): ViemAddress {
    return this.value;
  }
}

export class InvalidAddressError extends Error {
  constructor(address: string) {
    super(`Invalid Ethereum address: ${address}`);
    this.name = 'InvalidAddressError';
  }
}