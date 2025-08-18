import { EvmChain } from '../../domain/blockchain/Chain';

export interface RpcConfig {
  url: string;
  apiKey?: string;
}

export interface ChainConfig {
  id: number;
  name: string;
  rpc: RpcConfig;
  explorerUrl?: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface EvmIntegrationConfig {
  chains: ChainConfig[];
  defaultChainId: number;
  pollingInterval: number;
  requestTimeout: number;
  maxRetries: number;
}

/**
 * Configuration service for EVM integration
 * Manages environment-specific settings and RPC configurations
 */
export class ConfigurationService {
  private static instance: ConfigurationService;
  private config: EvmIntegrationConfig;

  private constructor(overrides?: Partial<EvmIntegrationConfig>) {
    this.config = this.loadConfiguration(overrides);
  }

  /**
   * Gets the singleton instance
   */
  static getInstance(overrides?: Partial<EvmIntegrationConfig>): ConfigurationService {
    if (!ConfigurationService.instance) {
      ConfigurationService.instance = new ConfigurationService(overrides);
    }
    return ConfigurationService.instance;
  }

  private loadConfiguration(overrides?: Partial<EvmIntegrationConfig>): EvmIntegrationConfig {
    const defaultConfig: EvmIntegrationConfig = {
      chains: this.getDefaultChainConfigs(),
      defaultChainId: 1,
      pollingInterval: 15000, // 15 seconds
      requestTimeout: 30000, // 30 seconds
      maxRetries: 3,
    };

    // Merge with environment variables if available
    const envConfig = this.loadFromEnvironment();
    
    return {
      ...defaultConfig,
      ...envConfig,
      ...overrides,
    };
  }

  private getDefaultChainConfigs(): ChainConfig[] {
    return [
      {
        id: 1,
        name: 'Ethereum',
        rpc: {
          url: process.env.VITE_ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com',
        },
        explorerUrl: 'https://etherscan.io',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      },
      {
        id: 137,
        name: 'Polygon',
        rpc: {
          url: process.env.VITE_POLYGON_RPC_URL || 'https://polygon-bor-rpc.publicnode.com',
        },
        explorerUrl: 'https://polygonscan.com',
        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
      },
      {
        id: 42161,
        name: 'Arbitrum One',
        rpc: {
          url: process.env.VITE_ARBITRUM_RPC_URL || 'https://arbitrum-one-rpc.publicnode.com',
        },
        explorerUrl: 'https://arbiscan.io',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      },
      {
        id: 10,
        name: 'Optimism',
        rpc: {
          url: process.env.VITE_OPTIMISM_RPC_URL || 'https://optimism-rpc.publicnode.com',
        },
        explorerUrl: 'https://optimistic.etherscan.io',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      },
      {
        id: 56,
        name: 'BNB Smart Chain',
        rpc: {
          url: process.env.VITE_BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
        },
        explorerUrl: 'https://bscscan.com',
        nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
      },
      {
        id: 43114,
        name: 'Avalanche',
        rpc: {
          url: process.env.VITE_AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc',
        },
        explorerUrl: 'https://snowtrace.io',
        nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
      },
    ];
  }

  private loadFromEnvironment(): Partial<EvmIntegrationConfig> {
    const config: Partial<EvmIntegrationConfig> = {};

    if (process.env.VITE_DEFAULT_CHAIN_ID) {
      config.defaultChainId = parseInt(process.env.VITE_DEFAULT_CHAIN_ID, 10);
    }

    if (process.env.VITE_POLLING_INTERVAL) {
      config.pollingInterval = parseInt(process.env.VITE_POLLING_INTERVAL, 10);
    }

    if (process.env.VITE_REQUEST_TIMEOUT) {
      config.requestTimeout = parseInt(process.env.VITE_REQUEST_TIMEOUT, 10);
    }

    if (process.env.VITE_MAX_RETRIES) {
      config.maxRetries = parseInt(process.env.VITE_MAX_RETRIES, 10);
    }

    return config;
  }

  /**
   * Gets configuration for a specific chain
   */
  getChainConfig(chainId: number): ChainConfig | undefined {
    return this.config.chains.find(chain => chain.id === chainId);
  }

  /**
   * Gets RPC URL for a specific chain
   */
  getRpcUrl(chainId: number): string {
    const chainConfig = this.getChainConfig(chainId);
    if (!chainConfig) {
      throw new Error(`No configuration found for chain ${chainId}`);
    }
    return chainConfig.rpc.url;
  }

  /**
   * Gets all configured chains
   */
  getAllChains(): ChainConfig[] {
    return this.config.chains;
  }

  /**
   * Gets the default chain ID
   */
  getDefaultChainId(): number {
    return this.config.defaultChainId;
  }

  /**
   * Gets polling interval in milliseconds
   */
  getPollingInterval(): number {
    return this.config.pollingInterval;
  }

  /**
   * Gets request timeout in milliseconds
   */
  getRequestTimeout(): number {
    return this.config.requestTimeout;
  }

  /**
   * Gets maximum retry count
   */
  getMaxRetries(): number {
    return this.config.maxRetries;
  }

  /**
   * Checks if a chain is configured
   */
  isChainConfigured(chainId: number): boolean {
    return this.config.chains.some(chain => chain.id === chainId);
  }

  /**
   * Updates configuration (for testing purposes)
   */
  updateConfig(updates: Partial<EvmIntegrationConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}