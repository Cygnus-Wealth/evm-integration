import { IChainAdapter, ChainInfo } from '../types/IChainAdapter';
import { ChainConfig } from '../types/ChainConfig';
import { EvmChainAdapter } from '../adapters/EvmChainAdapter';

// Import default configurations
import ethereumConfig from './configs/ethereum.json';
import polygonConfig from './configs/polygon.json';
import arbitrumConfig from './configs/arbitrum.json';
import optimismConfig from './configs/optimism.json';
import baseConfig from './configs/base.json';

export class ChainRegistry {
  private chains: Map<number, ChainConfig> = new Map();
  private adapters: Map<number, IChainAdapter> = new Map();
  private defaultConfigs: Map<number, ChainConfig> = new Map([
    [1, ethereumConfig as ChainConfig],
    [137, polygonConfig as ChainConfig],
    [42161, arbitrumConfig as ChainConfig],
    [10, optimismConfig as ChainConfig],
    [8453, baseConfig as ChainConfig],
  ]);

  constructor(configs?: ChainConfig[]) {
    // Load default configurations
    this.defaultConfigs.forEach((config, chainId) => {
      this.registerChain(config);
    });

    // Override with custom configs if provided
    if (configs) {
      configs.forEach(config => this.registerChain(config));
    }
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