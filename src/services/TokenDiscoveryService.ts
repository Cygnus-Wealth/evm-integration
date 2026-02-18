import { Address } from 'viem';
import { EvmChainAdapter } from '../adapters/EvmChainAdapter.js';
import type {
  TokenDiscoveryResult,
  TokenDiscoveryError,
  MultiChainTokenDiscoveryResult,
} from '../types/TokenDiscovery.js';

export class TokenDiscoveryService {
  private adapters: Map<number, EvmChainAdapter>;

  constructor(adapters: Map<number, EvmChainAdapter>) {
    this.adapters = adapters;
  }

  async discoverTokens(address: Address, chainId: number): Promise<TokenDiscoveryResult> {
    const adapter = this.adapters.get(chainId);
    if (!adapter) {
      throw new Error(`No adapter registered for chain ${chainId}`);
    }
    return adapter.discoverTokens(address);
  }

  async discoverTokensMultiChain(
    address: Address,
    chainIds: number[],
  ): Promise<MultiChainTokenDiscoveryResult> {
    const results: TokenDiscoveryResult[] = [];
    const chainErrors: TokenDiscoveryError[] = [];

    const settled = await Promise.allSettled(
      chainIds.map(async (chainId) => {
        const adapter = this.adapters.get(chainId);
        if (!adapter) {
          throw new Error(`No adapter registered for chain ${chainId}`);
        }
        return adapter.discoverTokens(address);
      }),
    );

    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i];
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
      } else {
        chainErrors.push({
          chainId: chainIds[i],
          message: outcome.reason?.message || 'Unknown error',
          code: 'CHAIN_DISCOVERY_FAILED',
        });
      }
    }

    return { results, chainErrors };
  }
}
