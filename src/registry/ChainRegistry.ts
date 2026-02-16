import { IChainAdapter, ChainInfo } from '../types/IChainAdapter.js';
import { ChainConfig } from '../types/ChainConfig.js';
import { EvmChainAdapter } from '../adapters/EvmChainAdapter.js';

// Import default configurations
import ethereumConfig from './configs/ethereum.json' with { type: 'json' };
import polygonConfig from './configs/polygon.json' with { type: 'json' };
import arbitrumConfig from './configs/arbitrum.json' with { type: 'json' };
import optimismConfig from './configs/optimism.json' with { type: 'json' };
import baseConfig from './configs/base.json' with { type: 'json' };
import sepoliaConfig from './configs/sepolia.json' with { type: 'json' };

export type NetworkEnvironment = 'production' | 'testnet' | 'local';

export class ChainRegistry {
  private chains: Map<number, ChainConfig> = new Map();
  private adapters: Map<number, IChainAdapter> = new Map();
  private environment: NetworkEnvironment;

  private static mainnetConfigs: Map<number, ChainConfig> = new Map([
    [1, ethereumConfig as ChainConfig],
    [137, polygonConfig as ChainConfig],
    [42161, arbitrumConfig as ChainConfig],
    [10, optimismConfig as ChainConfig],
    [8453, baseConfig as ChainConfig],
  ]);

  private static testnetConfigs: Map<number, ChainConfig> = new Map([
    [11155111, sepoliaConfig as ChainConfig],
  ]);

  constructor(environment: NetworkEnvironment = 'production', configs?: ChainConfig[]) {
    this.environment = environment;

    // Load configs based on environment
    if (environment === 'production' || environment === 'local') {
      ChainRegistry.mainnetConfigs.forEach((config) => {
        this.registerChain(config);
      });
    }

    if (environment === 'testnet' || environment === 'local') {
      ChainRegistry.testnetConfigs.forEach((config) => {
        this.registerChain(config);
      });
    }

    // Override with custom configs if provided
    if (configs) {
      configs.forEach(config => this.registerChain(config));
    }
  }

  getEnvironment(): NetworkEnvironment {
    return this.environment;
  }

  /**
   * Register a new chain configuration
   */
  registerChain(config: ChainConfig): void {
    this.chains.set(config.id, config);
    // Clear cached adapter to force recreation with new config
    this.adapters.delete(config.id);
  }

  /**
   * Get adapter for a specific chain
   */
  getAdapter(chainId: number): IChainAdapter {
    // Return cached adapter if available
    if (this.adapters.has(chainId)) {
      return this.adapters.get(chainId)!;
    }

    // Get chain configuration
    const config = this.chains.get(chainId);
    if (!config) {
      throw new Error(`Chain ${chainId} is not registered. Available chains: ${Array.from(this.chains.keys()).join(', ')}`);
    }

    // Create new adapter
    const adapter = new EvmChainAdapter(config);
    this.adapters.set(chainId, adapter);
    return adapter;
  }

  /**
   * Get adapter by chain name
   */
  getAdapterByName(name: string): IChainAdapter {
    const config = Array.from(this.chains.values()).find(
      c => c.name.toLowerCase() === name.toLowerCase()
    );

    if (!config) {
      throw new Error(`Chain "${name}" not found`);
    }

    return this.getAdapter(config.id);
  }

  /**
   * Get all supported chains
   */
  getSupportedChains(): ChainInfo[] {
    return Array.from(this.chains.values()).map(config => ({
      id: config.id,
      name: config.name,
      symbol: config.symbol,
      decimals: config.decimals,
      explorer: config.explorer,
    }));
  }

  /**
   * Check if a chain is supported
   */
  isChainSupported(chainId: number): boolean {
    return this.chains.has(chainId);
  }

  /**
   * Update chain configuration
   */
  updateChainConfig(chainId: number, updates: Partial<ChainConfig>): void {
    const existing = this.chains.get(chainId);
    if (!existing) {
      throw new Error(`Cannot update non-existent chain ${chainId}`);
    }

    const updated = { ...existing, ...updates };
    this.registerChain(updated);
  }

  /**
   * Add custom RPC endpoint to a chain
   */
  addEndpoint(chainId: number, endpoint: string, type: 'http' | 'ws' = 'http'): void {
    const config = this.chains.get(chainId);
    if (!config) {
      throw new Error(`Chain ${chainId} not found`);
    }

    if (type === 'http') {
      config.endpoints.http.unshift(endpoint);
    } else if (config.endpoints.ws) {
      config.endpoints.ws.unshift(endpoint);
    } else {
      config.endpoints.ws = [endpoint];
    }

    this.registerChain(config);
  }

  /**
   * Get chain configuration
   */
  getChainConfig(chainId: number): ChainConfig | undefined {
    return this.chains.get(chainId);
  }

  /**
   * Clear all cached adapters
   */
  clearCache(): void {
    this.adapters.forEach(adapter => adapter.disconnect());
    this.adapters.clear();
  }
}

// Export singleton instance with default configurations
export const defaultRegistry = new ChainRegistry();
