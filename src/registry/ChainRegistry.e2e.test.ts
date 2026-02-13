/**
 * E2E Tests: Sepolia Testnet Integration
 *
 * Tests the ChainRegistry and EvmChainAdapter against Sepolia testnet
 * using well-known test addresses. These tests make real network calls.
 *
 * Known Sepolia addresses used:
 * - Vitalik's address (0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045) — always has ETH
 * - Sepolia faucet deployer (0xaa36a7) — known funded address
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { Address } from 'viem';
import { ChainRegistry } from './ChainRegistry';
import { CacheManager } from '../performance/CacheManager';

// Well-known Sepolia test address (Vitalik — has SepoliaETH on all testnets)
const KNOWN_SEPOLIA_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Address;

describe('E2E: Sepolia Testnet', () => {
  let registry: ChainRegistry;

  beforeAll(() => {
    registry = new ChainRegistry('testnet');
  });

  afterAll(() => {
    registry.clearCache();
  });

  describe('ChainRegistry with testnet environment', () => {
    it('should create a testnet registry with Sepolia', () => {
      const chains = registry.getSupportedChains();
      expect(chains.some(c => c.id === 11155111)).toBe(true);
      expect(chains.some(c => c.name === 'Sepolia')).toBe(true);
    });

    it('should not include mainnet chains in testnet mode', () => {
      const chains = registry.getSupportedChains();
      expect(chains.some(c => c.id === 1)).toBe(false);
      expect(chains.some(c => c.id === 137)).toBe(false);
    });

    it('should get a Sepolia adapter', () => {
      const adapter = registry.getAdapter(11155111);
      expect(adapter).toBeDefined();
      const info = adapter.getChainInfo();
      expect(info.id).toBe(11155111);
      expect(info.name).toBe('Sepolia');
      expect(info.symbol).toBe('SepoliaETH');
    });

    it('should get Sepolia adapter by name', () => {
      const adapter = registry.getAdapterByName('Sepolia');
      expect(adapter).toBeDefined();
      expect(adapter.getChainInfo().id).toBe(11155111);
    });
  });

  describe('Sepolia RPC connectivity', () => {
    it('should connect to Sepolia and check health', async () => {
      const adapter = registry.getAdapter(11155111);
      await adapter.connect();
      const healthy = await adapter.isHealthy();
      expect(healthy).toBe(true);
    }, 15000);

    it('should fetch native balance from a known address', async () => {
      const adapter = registry.getAdapter(11155111);
      await adapter.connect();
      const balance = await adapter.getBalance(KNOWN_SEPOLIA_ADDRESS);
      expect(balance).toBeDefined();
    }, 15000);
  });

  describe('CacheManager with environment prefix', () => {
    it('should isolate testnet and production cache keys', async () => {
      const testnetCache = new CacheManager<string>({}, 'testnet');
      const productionCache = new CacheManager<string>({}, 'production');

      await testnetCache.set('balance:11155111:0xabc', 'testnet-value');
      await productionCache.set('balance:11155111:0xabc', 'production-value');

      const testnetVal = await testnetCache.get('balance:11155111:0xabc');
      const productionVal = await productionCache.get('balance:11155111:0xabc');

      expect(testnetVal).toBe('testnet-value');
      expect(productionVal).toBe('production-value');

      testnetCache.destroy();
      productionCache.destroy();
    });

    it('should prefix keys with environment', async () => {
      const cache = new CacheManager<string>({}, 'testnet');
      expect(cache.getKeyPrefix()).toBe('testnet:');
      cache.destroy();
    });

    it('should work with no prefix (backward compatible)', async () => {
      const cache = new CacheManager<string>();
      expect(cache.getKeyPrefix()).toBe('');

      await cache.set('key1', 'value1');
      expect(await cache.get('key1')).toBe('value1');
      cache.destroy();
    });
  });

  describe('Local mode loads all chains', () => {
    it('should load both mainnet and testnet chains in local mode', () => {
      const localRegistry = new ChainRegistry('local');
      const chains = localRegistry.getSupportedChains();
      const chainIds = chains.map(c => c.id);

      // Mainnet chains
      expect(chainIds).toContain(1);
      expect(chainIds).toContain(137);
      // Testnet chains
      expect(chainIds).toContain(11155111);

      localRegistry.clearCache();
    });
  });
});
