import { describe, it, expect, beforeEach } from 'vitest';
import { TierRotator } from './TierRotator';
import {
  RpcEndpointConfig,
  RpcProviderRole,
  RpcProviderType,
} from '@cygnus-wealth/rpc-infrastructure';

function makeEndpoint(
  provider: string,
  role: RpcProviderRole,
  weight = 100,
): RpcEndpointConfig {
  return {
    url: `https://${provider}.example.com`,
    provider,
    role,
    type: RpcProviderType.MANAGED,
    rateLimitRps: 50,
    timeoutMs: 5000,
    weight,
  };
}

describe('TierRotator', () => {
  describe('tier ordering', () => {
    it('should return tiers in order: PRIMARY → SECONDARY → TERTIARY → EMERGENCY', () => {
      const endpoints = [
        makeEndpoint('emergency-node', RpcProviderRole.EMERGENCY),
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
        makeEndpoint('ankr', RpcProviderRole.TERTIARY),
        makeEndpoint('infura', RpcProviderRole.SECONDARY),
      ];

      const rotator = new TierRotator(endpoints);
      const tiers = rotator.getTierOrder();

      expect(tiers).toEqual([
        RpcProviderRole.PRIMARY,
        RpcProviderRole.SECONDARY,
        RpcProviderRole.TERTIARY,
        RpcProviderRole.EMERGENCY,
      ]);
    });

    it('should omit tiers with no endpoints', () => {
      const endpoints = [
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
        makeEndpoint('ankr', RpcProviderRole.TERTIARY),
      ];

      const rotator = new TierRotator(endpoints);
      const tiers = rotator.getTierOrder();

      expect(tiers).toEqual([
        RpcProviderRole.PRIMARY,
        RpcProviderRole.TERTIARY,
      ]);
    });
  });

  describe('getEndpointsForTier', () => {
    it('should return all endpoints for a given tier', () => {
      const endpoints = [
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
        makeEndpoint('infura', RpcProviderRole.PRIMARY),
        makeEndpoint('ankr', RpcProviderRole.SECONDARY),
      ];

      const rotator = new TierRotator(endpoints);
      const primaries = rotator.getEndpointsForTier(RpcProviderRole.PRIMARY);

      expect(primaries).toHaveLength(2);
      expect(primaries.map(e => e.provider)).toContain('alchemy');
      expect(primaries.map(e => e.provider)).toContain('infura');
    });

    it('should return empty array for tier with no endpoints', () => {
      const endpoints = [
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
      ];

      const rotator = new TierRotator(endpoints);
      expect(rotator.getEndpointsForTier(RpcProviderRole.EMERGENCY)).toEqual([]);
    });
  });

  describe('selectNext (rotation disabled)', () => {
    it('should always return the first endpoint when rotation is disabled', () => {
      const endpoints = [
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
        makeEndpoint('infura', RpcProviderRole.PRIMARY),
      ];

      const rotator = new TierRotator(endpoints);
      const results = new Set<string>();

      for (let i = 0; i < 10; i++) {
        const ep = rotator.selectNext(RpcProviderRole.PRIMARY, false);
        results.add(ep.provider);
      }

      expect(results.size).toBe(1);
      expect(results.has('alchemy')).toBe(true);
    });
  });

  describe('selectNext (rotation enabled)', () => {
    it('should rotate among endpoints in the same tier', () => {
      const endpoints = [
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY, 100),
        makeEndpoint('infura', RpcProviderRole.PRIMARY, 100),
      ];

      const rotator = new TierRotator(endpoints);
      const results = new Map<string, number>();

      for (let i = 0; i < 100; i++) {
        const ep = rotator.selectNext(RpcProviderRole.PRIMARY, true);
        results.set(ep.provider, (results.get(ep.provider) ?? 0) + 1);
      }

      // With equal weights, both should be selected
      expect(results.has('alchemy')).toBe(true);
      expect(results.has('infura')).toBe(true);
    });

    it('should respect weight for weighted rotation', () => {
      const endpoints = [
        makeEndpoint('heavy', RpcProviderRole.PRIMARY, 900),
        makeEndpoint('light', RpcProviderRole.PRIMARY, 100),
      ];

      const rotator = new TierRotator(endpoints);
      const results = new Map<string, number>();

      for (let i = 0; i < 1000; i++) {
        const ep = rotator.selectNext(RpcProviderRole.PRIMARY, true);
        results.set(ep.provider, (results.get(ep.provider) ?? 0) + 1);
      }

      const heavyCount = results.get('heavy') ?? 0;
      const lightCount = results.get('light') ?? 0;

      // Heavy should get ~90% of traffic (allow generous margin)
      expect(heavyCount).toBeGreaterThan(lightCount * 3);
    });

    it('should default weight to 100 when not specified', () => {
      const noWeight: RpcEndpointConfig = {
        url: 'https://noweight.example.com',
        provider: 'noweight',
        role: RpcProviderRole.PRIMARY,
        type: RpcProviderType.PUBLIC,
        rateLimitRps: 10,
        timeoutMs: 5000,
        // weight omitted
      };
      const withWeight = makeEndpoint('withweight', RpcProviderRole.PRIMARY, 100);

      const rotator = new TierRotator([noWeight, withWeight]);
      const results = new Map<string, number>();

      for (let i = 0; i < 200; i++) {
        const ep = rotator.selectNext(RpcProviderRole.PRIMARY, true);
        results.set(ep.provider, (results.get(ep.provider) ?? 0) + 1);
      }

      // Both should be roughly equal since both effectively weight=100
      expect(results.has('noweight')).toBe(true);
      expect(results.has('withweight')).toBe(true);
    });
  });

  describe('selectNext with exclusions', () => {
    it('should skip excluded endpoints', () => {
      const endpoints = [
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
        makeEndpoint('infura', RpcProviderRole.PRIMARY),
      ];

      const rotator = new TierRotator(endpoints);
      const excluded = new Set(['https://alchemy.example.com']);
      const ep = rotator.selectNext(RpcProviderRole.PRIMARY, true, excluded);

      expect(ep.provider).toBe('infura');
    });

    it('should return null when all endpoints in tier are excluded', () => {
      const endpoints = [
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
      ];

      const rotator = new TierRotator(endpoints);
      const excluded = new Set(['https://alchemy.example.com']);
      const ep = rotator.selectNext(RpcProviderRole.PRIMARY, true, excluded);

      expect(ep).toBeNull();
    });
  });

  describe('single endpoint in tier', () => {
    it('should return the only endpoint regardless of rotation setting', () => {
      const endpoints = [
        makeEndpoint('alchemy', RpcProviderRole.PRIMARY),
      ];

      const rotator = new TierRotator(endpoints);
      const ep = rotator.selectNext(RpcProviderRole.PRIMARY, true);

      expect(ep!.provider).toBe('alchemy');
    });
  });
});
