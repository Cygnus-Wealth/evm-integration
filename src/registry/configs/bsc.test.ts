import { describe, it, expect } from 'vitest';
import { ChainRegistry } from '../ChainRegistry';

describe('BSC chain config', () => {
  it('should be registered in production mode', () => {
    const registry = new ChainRegistry('production');
    expect(registry.isChainSupported(56)).toBe(true);
    registry.clearCache();
  });

  it('should have correct chain metadata', () => {
    const registry = new ChainRegistry('production');
    const config = registry.getChainConfig(56);

    expect(config).toBeDefined();
    expect(config!.id).toBe(56);
    expect(config!.name).toBe('BSC');
    expect(config!.symbol).toBe('BNB');
    expect(config!.decimals).toBe(18);
    expect(config!.explorer).toBe('https://bscscan.com');
    registry.clearCache();
  });

  it('should have at least 3 HTTP fallback endpoints', () => {
    const registry = new ChainRegistry('production');
    const config = registry.getChainConfig(56);

    expect(config!.endpoints.http.length).toBeGreaterThanOrEqual(3);
    registry.clearCache();
  });

  it('should not have Alchemy or Infura endpoints', () => {
    const registry = new ChainRegistry('production');
    const config = registry.getChainConfig(56);

    for (const url of config!.endpoints.http) {
      expect(url).not.toContain('alchemy');
      expect(url).not.toContain('infura');
    }
    registry.clearCache();
  });

  it('should not contain API keys in any endpoint URL', () => {
    const registry = new ChainRegistry('production');
    const config = registry.getChainConfig(56);

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

  it('should have WBNB as wrapped native token', () => {
    const registry = new ChainRegistry('production');
    const config = registry.getChainConfig(56);

    expect(config!.tokens?.native).toBeDefined();
    expect(config!.tokens!.native!.symbol).toBe('WBNB');
    registry.clearCache();
  });

  it('should have popular tokens including USDC and USDT', () => {
    const registry = new ChainRegistry('production');
    const config = registry.getChainConfig(56);

    const symbols = config!.tokens!.popular!.map(t => t.symbol);
    expect(symbols).toContain('USDC');
    expect(symbols).toContain('USDT');
    registry.clearCache();
  });

  it('should create an adapter via getAdapter', () => {
    const registry = new ChainRegistry('production');
    const adapter = registry.getAdapter(56);

    expect(adapter).toBeDefined();
    const info = adapter.getChainInfo();
    expect(info.id).toBe(56);
    expect(info.name).toBe('BSC');
    expect(info.symbol).toBe('BNB');
    registry.clearCache();
  });

  it('should create an adapter via getAdapterByName', () => {
    const registry = new ChainRegistry('production');
    const adapter = registry.getAdapterByName('BSC');

    expect(adapter).toBeDefined();
    expect(adapter.getChainInfo().id).toBe(56);
    registry.clearCache();
  });
});
