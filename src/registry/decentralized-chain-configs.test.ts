import { describe, it, expect } from 'vitest';
import ethereumConfig from './configs/ethereum.json';
import polygonConfig from './configs/polygon.json';
import arbitrumConfig from './configs/arbitrum.json';
import optimismConfig from './configs/optimism.json';
import baseConfig from './configs/base.json';

describe('chain configs: decentralized-first endpoints', () => {
  const configs = [
    { name: 'Ethereum', config: ethereumConfig, poktDomain: 'eth-pokt.nodies.app' },
    { name: 'Polygon', config: polygonConfig, poktDomain: 'polygon-pokt.nodies.app' },
    { name: 'Arbitrum', config: arbitrumConfig, poktDomain: 'arb-pokt.nodies.app' },
    { name: 'Optimism', config: optimismConfig, poktDomain: 'op-pokt.nodies.app' },
  ];

  for (const { name, config, poktDomain } of configs) {
    describe(name, () => {
      it('should have POKT (Nodies) as the first HTTP endpoint', () => {
        expect(config.endpoints.http[0]).toContain(poktDomain);
      });

      it('should not have Alchemy or Infura endpoints', () => {
        for (const url of config.endpoints.http) {
          expect(url).not.toContain('alchemy');
          expect(url).not.toContain('infura');
        }
      });

      it('should not contain API keys in any endpoint URL', () => {
        for (const url of config.endpoints.http) {
          // No /v2/<key> or /v3/<key> patterns
          expect(url).not.toMatch(/\/v[23]\/[a-zA-Z0-9]{20,}/);
        }
        if (config.endpoints.ws) {
          for (const url of config.endpoints.ws) {
            expect(url).not.toMatch(/\/v[23]\/[a-zA-Z0-9]{20,}/);
          }
        }
      });

      it('should have at least 3 HTTP fallback endpoints', () => {
        expect(config.endpoints.http.length).toBeGreaterThanOrEqual(3);
      });
    });
  }

  describe('Base (no POKT available)', () => {
    it('should have public endpoints as primary', () => {
      expect(baseConfig.endpoints.http.length).toBeGreaterThanOrEqual(3);
    });

    it('should not have Alchemy or Infura endpoints', () => {
      for (const url of baseConfig.endpoints.http) {
        expect(url).not.toContain('alchemy');
        expect(url).not.toContain('infura');
      }
    });
  });
});
