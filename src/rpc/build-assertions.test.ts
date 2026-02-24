import { describe, it, expect } from 'vitest';
import { assertNoBundledSecrets } from './build-assertions.js';

describe('build-assertions', () => {
  describe('assertNoBundledSecrets', () => {
    it('should pass for clean content', () => {
      const clean = `
        const url = "https://eth-pokt.nodies.app";
        const rpc = "https://polygon-bor-rpc.publicnode.com";
      `;
      expect(() => assertNoBundledSecrets(clean)).not.toThrow();
    });

    it('should fail if CYGNUS_RPC_ env var value is embedded', () => {
      const dirty = `const url = "CYGNUS_RPC_ETHEREUM_KEY_abc123";`;
      expect(() => assertNoBundledSecrets(dirty)).toThrow(/CYGNUS_RPC_/);
    });

    it('should fail if Alchemy API key pattern is found', () => {
      const dirty = `const url = "https://eth-mainnet.g.alchemy.com/v2/a1b2c3d4e5f6g7h8i9j0";`;
      expect(() => assertNoBundledSecrets(dirty)).toThrow(/alchemy/i);
    });

    it('should fail if Infura project ID pattern is found', () => {
      const dirty = `const url = "https://mainnet.infura.io/v3/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";`;
      expect(() => assertNoBundledSecrets(dirty)).toThrow(/infura/i);
    });

    it('should fail if generic long hex key pattern is found after /v2/ or /v3/', () => {
      const dirty = `const url = "https://rpc.example.com/v2/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8";`;
      expect(() => assertNoBundledSecrets(dirty)).toThrow(/API key/i);
    });

    it('should not false-positive on known public endpoints', () => {
      const safe = `
        "https://eth-pokt.nodies.app"
        "https://polygon-bor-rpc.publicnode.com"
        "https://arb1.arbitrum.io/rpc"
        "https://ethereum-rpc.publicnode.com"
        "https://eth.llamarpc.com"
        "https://1rpc.io/eth"
        "https://cloudflare-eth.com"
        "wss://eth-mainnet.public.blastapi.io"
        "https://ethereum-sepolia.blockpi.network/v1/rpc/public"
      `;
      expect(() => assertNoBundledSecrets(safe)).not.toThrow();
    });

    it('should detect multiple violations and report all', () => {
      const dirty = `
        const a = "https://eth-mainnet.g.alchemy.com/v2/abc123";
        const b = "CYGNUS_RPC_KEY_xyz";
      `;
      expect(() => assertNoBundledSecrets(dirty)).toThrow();
    });
  });
});
