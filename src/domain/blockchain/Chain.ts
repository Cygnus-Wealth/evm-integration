/**
 * Value object representing an EVM-compatible blockchain
 * Encapsulates chain-specific configuration and behavior
 */
export class EvmChain {
  private static readonly SUPPORTED_CHAINS = new Map<number, EvmChain>();

  public static readonly ETHEREUM = new EvmChain(1, 'Ethereum', 'ETH');
  public static readonly POLYGON = new EvmChain(137, 'Polygon', 'MATIC');
  public static readonly ARBITRUM = new EvmChain(42161, 'Arbitrum One', 'ETH');
  public static readonly OPTIMISM = new EvmChain(10, 'Optimism', 'ETH');
  public static readonly BSC = new EvmChain(56, 'BNB Smart Chain', 'BNB');
  public static readonly AVALANCHE = new EvmChain(43114, 'Avalanche', 'AVAX');

  private constructor(
    public readonly id: number,
    public readonly name: string,
    public readonly nativeCurrency: string
  ) {
    EvmChain.SUPPORTED_CHAINS.set(id, this);
  }

  /**
   * Gets a chain by its ID
   * @throws {UnsupportedChainError} if the chain is not supported
   */
  static fromId(chainId: number): EvmChain {
    const chain = EvmChain.SUPPORTED_CHAINS.get(chainId);
    if (!chain) {
      throw new UnsupportedChainError(chainId);
    }
    return chain;
  }

  /**
   * Checks if a chain ID is supported
   */
  static isSupported(chainId: number): boolean {
    return EvmChain.SUPPORTED_CHAINS.has(chainId);
  }

  /**
   * Gets all supported chains
   */
  static getAllSupported(): EvmChain[] {
    return Array.from(EvmChain.SUPPORTED_CHAINS.values());
  }

  equals(other: EvmChain): boolean {
    return this.id === other.id;
  }

  toString(): string {
    return `${this.name} (${this.id})`;
  }
}

export class UnsupportedChainError extends Error {
  constructor(chainId: number) {
    super(`Unsupported chain ID: ${chainId}`);
    this.name = 'UnsupportedChainError';
  }
}