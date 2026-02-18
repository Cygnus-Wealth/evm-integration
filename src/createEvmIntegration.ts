import { IChainAdapter } from './types/IChainAdapter.js';
import { EvmChainAdapter } from './adapters/EvmChainAdapter.js';
import { ChainConfig } from './types/ChainConfig.js';
import { BalanceService, BalanceServiceConfig } from './services/BalanceService.js';
import { TransactionService, TransactionServiceConfig } from './services/TransactionService.js';
import { TrackingService, TrackingEventHandlers } from './services/TrackingService.js';
import { DeFiService } from './defi/DeFiService.js';
import { DeFiServiceConfig, IDeFiProtocol } from './defi/types.js';
import { RpcFallbackChain, RpcEndpoint, RpcFallbackConfig } from './resilience/RpcFallbackChain.js';
import { ChainRegistry } from './registry/ChainRegistry.js';

/**
 * Per-chain RPC endpoint configuration
 */
export interface ChainRpcConfig {
  endpoints: RpcEndpoint[];
  /** Override chain config properties (name, symbol, etc.) */
  chainConfigOverrides?: Partial<ChainConfig>;
}

/**
 * Configuration for creating an EvmIntegration instance
 */
export interface RpcProviderConfig {
  /** Per-chain endpoint configuration. Key is chain ID. */
  chains: Record<number, ChainRpcConfig>;

  /** Circuit breaker settings applied to all chains */
  circuitBreaker?: {
    enabled?: boolean;
    failureThreshold?: number;
    timeout?: number;
  };

  /** Enable cached fallback when all endpoints fail */
  enableCachedFallback?: boolean;

  /** BalanceService configuration overrides */
  balanceServiceConfig?: Partial<BalanceServiceConfig>;

  /** TransactionService configuration overrides */
  transactionServiceConfig?: Partial<TransactionServiceConfig>;

  /** DeFi protocol adapters to use */
  defiProtocols?: IDeFiProtocol[];

  /** DeFiService configuration overrides */
  defiServiceConfig?: Partial<DeFiServiceConfig>;

  /** Tracking service event handlers */
  trackingHandlers?: TrackingEventHandlers;
}

/**
 * Fully wired EvmIntegration instance
 */
export class EvmIntegration {
  readonly balanceService: BalanceService;
  readonly transactionService: TransactionService;
  readonly trackingService: TrackingService;
  readonly defiService: DeFiService;

  private adapters: Map<number, IChainAdapter>;
  private fallbackChains: Map<number, RpcFallbackChain>;
  private providerCreated: Set<number>;

  constructor(
    adapters: Map<number, IChainAdapter>,
    fallbackChains: Map<number, RpcFallbackChain>,
    balanceService: BalanceService,
    transactionService: TransactionService,
    trackingService: TrackingService,
    defiService: DeFiService,
  ) {
    this.adapters = adapters;
    this.fallbackChains = fallbackChains;
    this.providerCreated = new Set();
    this.balanceService = balanceService;
    this.transactionService = transactionService;
    this.trackingService = trackingService;
    this.defiService = defiService;
  }

  getSupportedChainIds(): number[] {
    return Array.from(this.adapters.keys());
  }

  getAdapter(chainId: number): IChainAdapter {
    const adapter = this.adapters.get(chainId);
    if (!adapter) {
      throw new Error(`Chain ${chainId} is not configured`);
    }
    this.providerCreated.add(chainId);
    return adapter;
  }

  getFallbackChain(chainId: number): RpcFallbackChain | undefined {
    return this.fallbackChains.get(chainId);
  }

  getActiveProviderCount(): number {
    return this.providerCreated.size;
  }

  async destroy(): Promise<void> {
    await this.balanceService.destroy();
    await this.transactionService.destroy();
    this.trackingService.destroy();
    await this.defiService.destroy();

    for (const adapter of this.adapters.values()) {
      adapter.disconnect();
    }

    this.providerCreated.clear();
  }
}

/**
 * Factory function that creates a fully wired EvmIntegration instance.
 * All RPC calls are routed through per-chain RpcFallbackChain instances.
 * No hardcoded RPC URLs are used — only the endpoints from config.
 */
export function createEvmIntegration(config: RpcProviderConfig): EvmIntegration {
  const chainIds = Object.keys(config.chains).map(Number);

  if (chainIds.length === 0) {
    throw new Error('At least one chain must be configured');
  }

  const adapters = new Map<number, IChainAdapter>();
  const fallbackChains = new Map<number, RpcFallbackChain>();

  // Build fallback config from global settings
  const fallbackConfig: RpcFallbackConfig = {
    circuitBreakerEnabled: config.circuitBreaker?.enabled ?? false,
    failureThreshold: config.circuitBreaker?.failureThreshold ?? 5,
    circuitTimeout: config.circuitBreaker?.timeout ?? 30000,
    enableCachedFallback: config.enableCachedFallback ?? false,
  };

  for (const chainId of chainIds) {
    const chainRpcConfig = config.chains[chainId];

    if (!chainRpcConfig.endpoints || chainRpcConfig.endpoints.length === 0) {
      throw new Error(`Chain ${chainId} must have at least one endpoint`);
    }

    // Create RPC fallback chain for this chain
    const fallbackChain = new RpcFallbackChain(
      chainId,
      chainRpcConfig.endpoints,
      fallbackConfig,
    );
    fallbackChains.set(chainId, fallbackChain);

    // Build ChainConfig from endpoints — use registry defaults if available,
    // but override endpoints with the ones from config (no hardcoded URLs)
    const registry = new ChainRegistry('production');
    const registryConfig = registry.getChainConfig(chainId);

    const httpEndpoints = chainRpcConfig.endpoints
      .sort((a, b) => a.priority - b.priority)
      .map((e) => e.url);

    const chainConfig: ChainConfig = {
      id: chainId,
      name: registryConfig?.name ?? chainRpcConfig.chainConfigOverrides?.name ?? `Chain ${chainId}`,
      symbol: registryConfig?.symbol ?? chainRpcConfig.chainConfigOverrides?.symbol ?? 'ETH',
      decimals: registryConfig?.decimals ?? chainRpcConfig.chainConfigOverrides?.decimals ?? 18,
      endpoints: {
        http: httpEndpoints,
      },
      explorer: registryConfig?.explorer ?? chainRpcConfig.chainConfigOverrides?.explorer ?? '',
      ...(chainRpcConfig.chainConfigOverrides || {}),
      // Always override endpoints with config-provided ones
    };
    // Ensure endpoints from config take precedence
    chainConfig.endpoints = { http: httpEndpoints };

    const adapter = new EvmChainAdapter(chainConfig);
    adapters.set(chainId, adapter);
  }

  // Wire services
  const balanceService = new BalanceService(adapters, config.balanceServiceConfig);
  const transactionService = new TransactionService(adapters, config.transactionServiceConfig);
  const trackingService = new TrackingService(
    balanceService,
    transactionService,
    config.trackingHandlers ?? {},
  );
  const defiService = new DeFiService(
    config.defiProtocols ?? [],
    config.defiServiceConfig,
  );

  return new EvmIntegration(
    adapters,
    fallbackChains,
    balanceService,
    transactionService,
    trackingService,
    defiService,
  );
}
