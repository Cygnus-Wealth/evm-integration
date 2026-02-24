import { describe, it, expect } from 'vitest';
import { ChainRegistry } from '../ChainRegistry';

describe('Avalanche chain config', () => {
  it('should be registered in production mode', () => {
    const registry = new ChainRegistry('production');
    expect(registry.isChainSupported(43114)).toBe(true);
    registry.clearCache();
  });

  it('should have correct chain metadata', () => {
    const registry = new ChainRegistry('production');
    const config = registry.getChainConfig(43114);

    expect(config).toBeDefined();
    expect(config!.id).toBe(43114);
    expect(config!.name).toBe('Avalanche');
    expect(config!.symbol).toBe('AVAX');
    expect(config!.decimals).toBe(18);
    expect(config!.explorer).toBe('https://snowtrace.io');
    registry.clearCache();
  });

  it('should have at least 3 HTTP fallback endpoints', () => {
    const registry = new ChainRegistry('production');
    const config = registry.getChainConfig(43114);

    expect(config!.endpoints.http.length).toBeGreaterThanOrEqual(3);
    registry.clearCache();
  });

  it('should have POKT (Nodies) as the first HTTP endpoint', () => {
    const registry = new ChainRegistry('production');
    const config = registry.getChainConfig(43114);

    expect(config!.endpoints.http[0]).toContain('avax-pokt.nodies.app');
    registry.clearCache();
  });

  it('should not have Alchemy or Infura endpoints', () => {
    const registry = new ChainRegistry('production');
    const config = registry.getChainConfig(43114);

    for (const url of config!.endpoints.http) {
      expect(url).not.toContain('alchemy');
      expect(url).not.toContain('infura');
    }
    registry.clearCache();
  });

  it('should not contain API keys in any endpoint URL', () => {
    const registry = new ChainRegistry('production');
    const config = registry.getChainConfig(43114);

    for (const url of config!.endpoints.http) {
      expect(url).not.toMatch(/\/v[23]\/[a-zA-Z0-9]{20,}/);
    }
    if (config!.endpoints.ws) {
      for (const url of config!.endpoints.ws) {
        expect(url).not.toMatch(/\/v[23]\/[a-zA-Z0-9]{20,}/);
      }
    }
    registry.clearCache();
  });

  it('should have WAVAX as wrapped native token', () => {
    const registry = new ChainRegistry('production');
    const config = registry.getChainConfig(43114);

    expect(config!.tokens?.native).toBeDefined();
    expect(config!.tokens!.native!.symbol).toBe('WAVAX');
    registry.clearCache();
  });

  it('should have popular tokens including USDC and USDT', () => {
    const registry = new ChainRegistry('production');
    const config = registry.getChainConfig(43114);

    const symbols = config!.tokens!.popular!.map(t => t.symbol);
    expect(symbols).toContain('USDC');
    expect(symbols).toContain('USDT');
    registry.clearCache();
  });

  it('should create an adapter via getAdapter', () => {
    const registry = new ChainRegistry('production');
    const adapter = registry.getAdapter(43114);

    expect(adapter).toBeDefined();
    const info = adapter.getChainInfo();
    expect(info.id).toBe(43114);
    expect(info.name).toBe('Avalanche');
    expect(info.symbol).toBe('AVAX');
    registry.clearCache();
  });

  it('should create an adapter via getAdapterByName', () => {
    const registry = new ChainRegistry('production');
    const adapter = registry.getAdapterByName('Avalanche');

    expect(adapter).toBeDefined();
    expect(adapter.getChainInfo().id).toBe(43114);
    registry.clearCache();
  });
});
