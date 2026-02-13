import { describe, it, expect, afterEach } from 'vitest';
import { ChainRegistry, NetworkEnvironment } from './ChainRegistry';

describe('ChainRegistry', () => {
  let registry: ChainRegistry;

  afterEach(() => {
    if (registry) {
      registry.clearCache();
    }
  });

  describe('NetworkEnvironment filtering', () => {
    it('should load only mainnet configs in production mode', () => {
      registry = new ChainRegistry('production');
      const chains = registry.getSupportedChains();
      const chainIds = chains.map(c => c.id);

      expect(chainIds).toContain(1);       // Ethereum
      expect(chainIds).toContain(137);     // Polygon
      expect(chainIds).toContain(42161);   // Arbitrum
      expect(chainIds).toContain(10);      // Optimism
      expect(chainIds).toContain(8453);    // Base
      expect(chainIds).not.toContain(11155111); // Sepolia excluded
    });

    it('should load only testnet configs in testnet mode', () => {
      registry = new ChainRegistry('testnet');
      const chains = registry.getSupportedChains();
      const chainIds = chains.map(c => c.id);

      expect(chainIds).toContain(11155111); // Sepolia
      expect(chainIds).not.toContain(1);    // Ethereum excluded
      expect(chainIds).not.toContain(137);  // Polygon excluded
    });

    it('should load all configs in local mode', () => {
      registry = new ChainRegistry('local');
      const chains = registry.getSupportedChains();
      const chainIds = chains.map(c => c.id);

      expect(chainIds).toContain(1);         // Ethereum
      expect(chainIds).toContain(137);       // Polygon
      expect(chainIds).toContain(11155111);  // Sepolia
    });

    it('should default to production mode', () => {
      registry = new ChainRegistry();
      const chains = registry.getSupportedChains();
      const chainIds = chains.map(c => c.id);

      expect(chainIds).not.toContain(11155111);
      expect(chainIds).toContain(1);
    });

    it('should expose the environment via getEnvironment()', () => {
      registry = new ChainRegistry('testnet');
      expect(registry.getEnvironment()).toBe('testnet');
    });
  });

  describe('Sepolia config', () => {
    it('should have correct Sepolia chain config', () => {
      registry = new ChainRegistry('testnet');
      const config = registry.getChainConfig(11155111);

      expect(config).toBeDefined();
      expect(config!.name).toBe('Sepolia');
      expect(config!.symbol).toBe('SepoliaETH');
      expect(config!.decimals).toBe(18);
      expect(config!.explorer).toBe('https://sepolia.etherscan.io');
      expect(config!.isTestnet).toBe(true);
    });

    it('should support getting adapter by name for Sepolia', () => {
      registry = new ChainRegistry('testnet');
      expect(registry.isChainSupported(11155111)).toBe(true);
    });
  });

  describe('Custom configs override', () => {
    it('should accept custom configs alongside environment defaults', () => {
      registry = new ChainRegistry('production', [
        {
          id: 999,
          name: 'Custom Chain',
          symbol: 'CUST',
          decimals: 18,
          explorer: 'https://custom.explorer',
          endpoints: { http: ['https://custom-rpc.example.com'] },
        },
      ]);

      expect(registry.isChainSupported(999)).toBe(true);
      expect(registry.isChainSupported(1)).toBe(true); // mainnet still loaded
    });
  });

  describe('Backward compatibility', () => {
    it('should work with no arguments (same as old behavior)', () => {
      registry = new ChainRegistry();
      const chains = registry.getSupportedChains();

      expect(chains.length).toBe(5); // 5 mainnet chains
      expect(chains.map(c => c.id).sort((a, b) => a - b)).toEqual([1, 10, 137, 8453, 42161]);
    });
  });
});
