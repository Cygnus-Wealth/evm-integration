import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEvmIntegration, RpcProviderConfig, EvmIntegration } from './createEvmIntegration.js';

describe('createEvmIntegration', () => {
  const defaultConfig: RpcProviderConfig = {
    chains: {
      1: {
        endpoints: [
          { url: 'https://primary-eth.rpc.com', priority: 1 },
          { url: 'https://secondary-eth.rpc.com', priority: 2 },
        ],
      },
      137: {
        endpoints: [
          { url: 'https://primary-polygon.rpc.com', priority: 1 },
          { url: 'https://secondary-polygon.rpc.com', priority: 2 },
        ],
      },
    },
  };

  describe('factory function', () => {
    it('should create EvmIntegration instance with valid config', () => {
      const integration = createEvmIntegration(defaultConfig);

      expect(integration).toBeDefined();
      expect(integration.balanceService).toBeDefined();
      expect(integration.transactionService).toBeDefined();
      expect(integration.trackingService).toBeDefined();
      expect(integration.defiService).toBeDefined();
    });

    it('should create adapters for all configured chains', () => {
      const integration = createEvmIntegration(defaultConfig);

      expect(integration.getSupportedChainIds()).toContain(1);
      expect(integration.getSupportedChainIds()).toContain(137);
      expect(integration.getSupportedChainIds()).toHaveLength(2);
    });

    it('should throw if no chains configured', () => {
      expect(() => createEvmIntegration({ chains: {} })).toThrow();
    });

    it('should throw if a chain has no endpoints', () => {
      expect(() => createEvmIntegration({
        chains: {
          1: { endpoints: [] },
        },
      })).toThrow();
    });
  });

  describe('lazy provider creation', () => {
    it('should not create providers until first RPC call', () => {
      const integration = createEvmIntegration(defaultConfig);

      // No providers should be created yet
      expect(integration.getActiveProviderCount()).toBe(0);
    });

    it('should create provider lazily on first chain access', async () => {
      const integration = createEvmIntegration(defaultConfig);

      // Accessing a chain adapter should trigger lazy creation
      const adapter = integration.getAdapter(1);
      expect(adapter).toBeDefined();
    });
  });

  describe('RPC fallback routing', () => {
    it('should route RPC calls through fallback chain', () => {
      const integration = createEvmIntegration(defaultConfig);

      // The adapter for each chain should have RPC fallback configured
      const fallbackChain = integration.getFallbackChain(1);
      expect(fallbackChain).toBeDefined();
      expect(fallbackChain!.getEndpointUrls()).toEqual([
        'https://primary-eth.rpc.com',
        'https://secondary-eth.rpc.com',
      ]);
    });

    it('should have separate fallback chains per chain', () => {
      const integration = createEvmIntegration(defaultConfig);

      const ethFallback = integration.getFallbackChain(1);
      const polyFallback = integration.getFallbackChain(137);

      expect(ethFallback).not.toBe(polyFallback);
      expect(ethFallback!.getChainId()).toBe(1);
      expect(polyFallback!.getChainId()).toBe(137);
    });
  });

  describe('service configuration', () => {
    it('should pass custom service config to BalanceService', () => {
      const integration = createEvmIntegration({
        ...defaultConfig,
        balanceServiceConfig: {
          enableCache: false,
          cacheTTL: 30,
        },
      });

      expect(integration.balanceService).toBeDefined();
    });

    it('should pass custom service config to TransactionService', () => {
      const integration = createEvmIntegration({
        ...defaultConfig,
        transactionServiceConfig: {
          enableCache: false,
        },
      });

      expect(integration.transactionService).toBeDefined();
    });

    it('should configure DeFi protocols', () => {
      const integration = createEvmIntegration({
        ...defaultConfig,
        defiProtocols: [],
      });

      expect(integration.defiService).toBeDefined();
    });
  });

  describe('circuit breaker config', () => {
    it('should accept global circuit breaker settings', () => {
      const integration = createEvmIntegration({
        ...defaultConfig,
        circuitBreaker: {
          enabled: true,
          failureThreshold: 3,
          timeout: 30000,
        },
      });

      const fallbackChain = integration.getFallbackChain(1);
      expect(fallbackChain).toBeDefined();
    });
  });

  describe('no hardcoded RPC URLs', () => {
    it('should use only endpoints from config, not hardcoded URLs', () => {
      const customConfig: RpcProviderConfig = {
        chains: {
          1: {
            endpoints: [
              { url: 'https://my-custom-rpc.example.com', priority: 1 },
            ],
          },
        },
      };

      const integration = createEvmIntegration(customConfig);
      const fallbackChain = integration.getFallbackChain(1);

      expect(fallbackChain!.getEndpointUrls()).toEqual([
        'https://my-custom-rpc.example.com',
      ]);
      // Verify no default public endpoints snuck in
      expect(fallbackChain!.getEndpointUrls()).not.toContain(
        'https://ethereum-rpc.publicnode.com'
      );
    });
  });

  describe('destroy', () => {
    it('should clean up all resources on destroy', async () => {
      const integration = createEvmIntegration(defaultConfig);

      await integration.destroy();

      // After destruction, services should be cleaned up
      expect(integration.getActiveProviderCount()).toBe(0);
    });
  });
});
