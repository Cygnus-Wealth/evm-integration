import { describe, it, expect } from 'vitest';
import {
  RpcProviderRole,
  RpcProviderType,
} from '@cygnus-wealth/rpc-infrastructure';
import {
  getDecentralizedRpcConfig,
  getChainRpcConfig,
  SUPPORTED_CHAIN_IDS,
  POKT_ENDPOINTS,
  API_KEY_PATTERNS,
  assertNoBundledApiKeys,
} from './decentralized-defaults.js';

describe('decentralized-defaults', () => {
  describe('getDecentralizedRpcConfig', () => {
    it('should return config for all supported EVM chains', () => {
      const config = getDecentralizedRpcConfig();
      expect(Object.keys(config.chains).length).toBeGreaterThanOrEqual(5);
      for (const chainId of SUPPORTED_CHAIN_IDS) {
        expect(config.chains[String(chainId)]).toBeDefined();
      }
    });

    it('should include circuit breaker config', () => {
      const config = getDecentralizedRpcConfig();
      expect(config.circuitBreaker).toBeDefined();
      expect(config.circuitBreaker.failureThreshold).toBeGreaterThan(0);
      expect(config.circuitBreaker.openDurationMs).toBeGreaterThan(0);
    });

    it('should include retry config', () => {
      const config = getDecentralizedRpcConfig();
      expect(config.retry).toBeDefined();
      expect(config.retry.maxAttempts).toBeGreaterThan(0);
    });

    it('should include health check config', () => {
      const config = getDecentralizedRpcConfig();
      expect(config.healthCheck).toBeDefined();
      expect(config.healthCheck.method).toBe('eth_blockNumber');
    });

    it('should include privacy config', () => {
      const config = getDecentralizedRpcConfig();
      expect(config.privacy).toBeDefined();
      expect(config.privacy.rotateWithinTier).toBe(true);
    });
  });

  describe('getChainRpcConfig', () => {
    it('should return config for Ethereum (chainId 1)', () => {
      const config = getChainRpcConfig(1);
      expect(config).toBeDefined();
      expect(config!.chainId).toBe(1);
      expect(config!.chainName).toBe('Ethereum Mainnet');
    });

    it('should return undefined for unsupported chain', () => {
      const config = getChainRpcConfig(999999);
      expect(config).toBeUndefined();
    });
  });

  describe('POKT as primary default', () => {
    it('should have POKT as the first endpoint for Ethereum', () => {
      const config = getChainRpcConfig(1);
      const primaryEndpoints = config!.endpoints.filter(
        e => e.role === RpcProviderRole.PRIMARY
      );
      expect(primaryEndpoints.length).toBeGreaterThan(0);
      const poktPrimary = primaryEndpoints.find(
        e => e.type === RpcProviderType.DECENTRALIZED && e.provider.includes('POKT')
      );
      expect(poktPrimary).toBeDefined();
    });

    it('should have POKT as the first endpoint for Polygon', () => {
      const config = getChainRpcConfig(137);
      const primaryEndpoints = config!.endpoints.filter(
        e => e.role === RpcProviderRole.PRIMARY
      );
      const poktPrimary = primaryEndpoints.find(
        e => e.type === RpcProviderType.DECENTRALIZED && e.provider.includes('POKT')
      );
      expect(poktPrimary).toBeDefined();
    });

    it('should have POKT as the first endpoint for Arbitrum', () => {
      const config = getChainRpcConfig(42161);
      const primaryEndpoints = config!.endpoints.filter(
        e => e.role === RpcProviderRole.PRIMARY
      );
      const poktPrimary = primaryEndpoints.find(
        e => e.type === RpcProviderType.DECENTRALIZED && e.provider.includes('POKT')
      );
      expect(poktPrimary).toBeDefined();
    });

    it('should have POKT as the first endpoint for Optimism', () => {
      const config = getChainRpcConfig(10);
      const primaryEndpoints = config!.endpoints.filter(
        e => e.role === RpcProviderRole.PRIMARY
      );
      const poktPrimary = primaryEndpoints.find(
        e => e.type === RpcProviderType.DECENTRALIZED && e.provider.includes('POKT')
      );
      expect(poktPrimary).toBeDefined();
    });

    it('should have POKT endpoint appear first in the endpoints array for each chain that supports it', () => {
      for (const chainId of [1, 137, 42161, 10]) {
        const config = getChainRpcConfig(chainId);
        expect(config!.endpoints[0].provider).toContain('POKT');
        expect(config!.endpoints[0].type).toBe(RpcProviderType.DECENTRALIZED);
      }
    });
  });

  describe('endpoint role hierarchy', () => {
    it('should order endpoints: decentralized PRIMARY -> public SECONDARY -> community TERTIARY', () => {
      const config = getChainRpcConfig(1);
      const endpoints = config!.endpoints;

      // Find first of each role
      const firstPrimary = endpoints.findIndex(e => e.role === RpcProviderRole.PRIMARY);
      const firstSecondary = endpoints.findIndex(e => e.role === RpcProviderRole.SECONDARY);
      const firstTertiary = endpoints.findIndex(e => e.role === RpcProviderRole.TERTIARY);

      expect(firstPrimary).toBeLessThan(firstSecondary);
      if (firstTertiary >= 0) {
        expect(firstSecondary).toBeLessThan(firstTertiary);
      }
    });

    it('should have at least 2 endpoints per supported chain', () => {
      for (const chainId of SUPPORTED_CHAIN_IDS) {
        const config = getChainRpcConfig(chainId);
        expect(config!.endpoints.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('no bundled API keys', () => {
    it('should not contain any API key patterns in endpoint URLs', () => {
      const config = getDecentralizedRpcConfig();
      for (const [, chainConfig] of Object.entries(config.chains)) {
        for (const endpoint of chainConfig.endpoints) {
          for (const pattern of API_KEY_PATTERNS) {
            expect(pattern.test(endpoint.url)).toBe(false);
          }
          if (endpoint.wsUrl) {
            for (const pattern of API_KEY_PATTERNS) {
              expect(pattern.test(endpoint.wsUrl)).toBe(false);
            }
          }
        }
      }
    });

    it('should not contain Alchemy endpoint URLs', () => {
      const config = getDecentralizedRpcConfig();
      for (const [, chainConfig] of Object.entries(config.chains)) {
        for (const endpoint of chainConfig.endpoints) {
          expect(endpoint.url).not.toContain('alchemy.com');
          expect(endpoint.url).not.toContain('alchemyapi.io');
        }
      }
    });

    it('should not contain Infura endpoint URLs', () => {
      const config = getDecentralizedRpcConfig();
      for (const [, chainConfig] of Object.entries(config.chains)) {
        for (const endpoint of chainConfig.endpoints) {
          expect(endpoint.url).not.toContain('infura.io');
        }
      }
    });
  });

  describe('POKT_ENDPOINTS', () => {
    it('should have entries for supported chains', () => {
      expect(POKT_ENDPOINTS[1]).toBeDefined();
      expect(POKT_ENDPOINTS[137]).toBeDefined();
      expect(POKT_ENDPOINTS[42161]).toBeDefined();
      expect(POKT_ENDPOINTS[10]).toBeDefined();
    });

    it('should use nodies.app domain for POKT', () => {
      for (const url of Object.values(POKT_ENDPOINTS)) {
        expect(url).toContain('nodies.app');
      }
    });
  });

  describe('assertNoBundledApiKeys', () => {
    it('should pass for clean config', () => {
      expect(() => assertNoBundledApiKeys(getDecentralizedRpcConfig())).not.toThrow();
    });

    it('should throw if config contains Alchemy URL', () => {
      const config = getDecentralizedRpcConfig();
      const chainId = Object.keys(config.chains)[0];
      config.chains[chainId].endpoints.push({
        url: 'https://eth-mainnet.g.alchemy.com/v2/a1b2c3d4e5f6g7h8i9j0',
        provider: 'Alchemy',
        role: RpcProviderRole.PRIMARY,
        type: RpcProviderType.MANAGED,
        rateLimitRps: 100,
        timeoutMs: 5000,
      });
      expect(() => assertNoBundledApiKeys(config)).toThrow(/API key pattern/i);
    });

    it('should throw if config contains Infura URL', () => {
      const config = getDecentralizedRpcConfig();
      const chainId = Object.keys(config.chains)[0];
      config.chains[chainId].endpoints.push({
        url: 'https://mainnet.infura.io/v3/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
        provider: 'Infura',
        role: RpcProviderRole.PRIMARY,
        type: RpcProviderType.MANAGED,
        rateLimitRps: 50,
        timeoutMs: 5000,
      });
      expect(() => assertNoBundledApiKeys(config)).toThrow(/API key pattern/i);
    });

    it('should throw if CYGNUS_RPC_ env var pattern found in URL', () => {
      const config = getDecentralizedRpcConfig();
      const chainId = Object.keys(config.chains)[0];
      config.chains[chainId].endpoints.push({
        url: 'https://example.com/CYGNUS_RPC_KEY_VALUE',
        provider: 'test',
        role: RpcProviderRole.PRIMARY,
        type: RpcProviderType.MANAGED,
        rateLimitRps: 50,
        timeoutMs: 5000,
      });
      expect(() => assertNoBundledApiKeys(config)).toThrow(/API key pattern/i);
    });
  });

  describe('chain config completeness', () => {
    it('should configure totalOperationTimeoutMs for each chain', () => {
      for (const chainId of SUPPORTED_CHAIN_IDS) {
        const config = getChainRpcConfig(chainId);
        expect(config!.totalOperationTimeoutMs).toBeGreaterThan(0);
      }
    });

    it('should configure cacheStaleAcceptanceMs for each chain', () => {
      for (const chainId of SUPPORTED_CHAIN_IDS) {
        const config = getChainRpcConfig(chainId);
        expect(config!.cacheStaleAcceptanceMs).toBeGreaterThan(0);
      }
    });

    it('should set rateLimitRps on all endpoints', () => {
      const config = getDecentralizedRpcConfig();
      for (const [, chainConfig] of Object.entries(config.chains)) {
        for (const endpoint of chainConfig.endpoints) {
          expect(endpoint.rateLimitRps).toBeGreaterThan(0);
        }
      }
    });

    it('should set timeoutMs on all endpoints', () => {
      const config = getDecentralizedRpcConfig();
      for (const [, chainConfig] of Object.entries(config.chains)) {
        for (const endpoint of chainConfig.endpoints) {
          expect(endpoint.timeoutMs).toBeGreaterThan(0);
        }
      }
    });
  });
});
