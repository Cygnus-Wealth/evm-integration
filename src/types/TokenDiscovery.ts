import { Address } from 'viem';

export interface DiscoveredToken {
  contractAddress: Address;
  balance: string;
  symbol?: string;
  name?: string;
  decimals?: number;
}

export interface TokenDiscoveryError {
  contractAddress?: Address;
  chainId: number;
  message: string;
  code?: string;
}

export interface TokenDiscoveryResult {
  address: Address;
  chainId: number;
  tokens: DiscoveredToken[];
  errors: TokenDiscoveryError[];
}

export interface MultiChainTokenDiscoveryResult {
  results: TokenDiscoveryResult[];
  chainErrors: TokenDiscoveryError[];
}
