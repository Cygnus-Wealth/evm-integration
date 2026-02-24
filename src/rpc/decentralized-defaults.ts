/**
 * Decentralized-first RPC endpoint defaults
 *
 * Provides default RPC configurations using @cygnus-wealth/rpc-infrastructure types.
 * POKT Network (via Nodies) is the primary default for all supported chains.
 * Public community endpoints serve as fallback.
 *
 * No API keys are bundled. All defaults are free, keyless public endpoints.
 *
 * @module rpc/decentralized-defaults
 */

import type {
  RpcProviderConfig,
  ChainRpcConfig,
  RpcEndpointConfig,
} from '@cygnus-wealth/rpc-infrastructure';
import {
  RpcProviderRole,
  RpcProviderType,
} from '@cygnus-wealth/rpc-infrastructure';

/** Chains with decentralized-first config */
export const SUPPORTED_CHAIN_IDS = [1, 137, 42161, 10, 8453] as const;

/** POKT (Nodies) public endpoints — keyless, ~15-25 RPS */
export const POKT_ENDPOINTS: Record<number, string> = {
  1: 'https://eth-pokt.nodies.app',
  137: 'https://polygon-pokt.nodies.app',
  42161: 'https://arb-pokt.nodies.app',
  10: 'https://op-pokt.nodies.app',
};

/** Patterns that indicate an API key was baked into a URL */
export const API_KEY_PATTERNS: RegExp[] = [
  /alchemy\.com\/v2\/[a-zA-Z0-9_-]{10,}/,
  /alchemyapi\.io\/v2\/[a-zA-Z0-9_-]{10,}/,
  /infura\.io\/v3\/[a-f0-9]{20,}/,
  /CYGNUS_RPC_/,
  /\/v[23]\/[a-zA-Z0-9_-]{32,}/, // Generic long key after /v2/ or /v3/
];

function makeEndpoint(
  url: string,
  provider: string,
  role: RpcProviderRole,
  type: RpcProviderType,
  rateLimitRps: number,
  timeoutMs = 5000,
  wsUrl?: string,
): RpcEndpointConfig {
  return { url, wsUrl, provider, role, type, rateLimitRps, timeoutMs };
}

function ethereumEndpoints(): RpcEndpointConfig[] {
  return [
    // PRIMARY — decentralized
    makeEndpoint(
      POKT_ENDPOINTS[1],
      'POKT (Nodies)',
      RpcProviderRole.PRIMARY,
      RpcProviderType.DECENTRALIZED,
      20,
    ),
    // SECONDARY — public community
    makeEndpoint(
      'https://ethereum-rpc.publicnode.com',
      'PublicNode',
      RpcProviderRole.SECONDARY,
      RpcProviderType.PUBLIC,
      50,
      5000,
      'wss://ethereum-rpc.publicnode.com',
    ),
    makeEndpoint(
      'https://eth.llamarpc.com',
      'LlamaRPC',
      RpcProviderRole.SECONDARY,
      RpcProviderType.COMMUNITY,
      50,
    ),
    // TERTIARY — additional public
    makeEndpoint(
      'https://1rpc.io/eth',
      '1RPC (Automata)',
      RpcProviderRole.TERTIARY,
      RpcProviderType.COMMUNITY,
      50,
    ),
    makeEndpoint(
      'https://cloudflare-eth.com',
      'Cloudflare',
      RpcProviderRole.TERTIARY,
      RpcProviderType.PUBLIC,
      50,
    ),
  ];
}

function polygonEndpoints(): RpcEndpointConfig[] {
  return [
    makeEndpoint(
      POKT_ENDPOINTS[137],
      'POKT (Nodies)',
      RpcProviderRole.PRIMARY,
      RpcProviderType.DECENTRALIZED,
      20,
    ),
    makeEndpoint(
      'https://polygon.llamarpc.com',
      'LlamaRPC',
      RpcProviderRole.SECONDARY,
      RpcProviderType.COMMUNITY,
      50,
    ),
    makeEndpoint(
      'https://polygon-bor-rpc.publicnode.com',
      'PublicNode',
      RpcProviderRole.SECONDARY,
      RpcProviderType.PUBLIC,
      50,
      5000,
      'wss://polygon-bor-rpc.publicnode.com',
    ),
    makeEndpoint(
      'https://1rpc.io/matic',
      '1RPC (Automata)',
      RpcProviderRole.TERTIARY,
      RpcProviderType.COMMUNITY,
      50,
    ),
    makeEndpoint(
      'https://polygon.drpc.org',
      'dRPC',
      RpcProviderRole.TERTIARY,
      RpcProviderType.COMMUNITY,
      50,
    ),
  ];
}

function arbitrumEndpoints(): RpcEndpointConfig[] {
  return [
    makeEndpoint(
      POKT_ENDPOINTS[42161],
      'POKT (Nodies)',
      RpcProviderRole.PRIMARY,
      RpcProviderType.DECENTRALIZED,
      20,
    ),
    makeEndpoint(
      'https://arb1.arbitrum.io/rpc',
      'Arbitrum Official',
      RpcProviderRole.SECONDARY,
      RpcProviderType.PUBLIC,
      100,
    ),
    makeEndpoint(
      'https://arbitrum-one-rpc.publicnode.com',
      'PublicNode',
      RpcProviderRole.SECONDARY,
      RpcProviderType.PUBLIC,
      50,
    ),
    makeEndpoint(
      'https://1rpc.io/arb',
      '1RPC (Automata)',
      RpcProviderRole.TERTIARY,
      RpcProviderType.COMMUNITY,
      50,
    ),
  ];
}

function optimismEndpoints(): RpcEndpointConfig[] {
  return [
    makeEndpoint(
      POKT_ENDPOINTS[10],
      'POKT (Nodies)',
      RpcProviderRole.PRIMARY,
      RpcProviderType.DECENTRALIZED,
      20,
    ),
    makeEndpoint(
      'https://mainnet.optimism.io',
      'Optimism Official',
      RpcProviderRole.SECONDARY,
      RpcProviderType.PUBLIC,
      100,
    ),
    makeEndpoint(
      'https://optimism-rpc.publicnode.com',
      'PublicNode',
      RpcProviderRole.SECONDARY,
      RpcProviderType.PUBLIC,
      50,
      5000,
      'wss://optimism-rpc.publicnode.com',
    ),
    makeEndpoint(
      'https://1rpc.io/op',
      '1RPC (Automata)',
      RpcProviderRole.TERTIARY,
      RpcProviderType.COMMUNITY,
      50,
    ),
  ];
}

function baseEndpoints(): RpcEndpointConfig[] {
  // No POKT endpoint available for Base; use official + public
  return [
    makeEndpoint(
      'https://mainnet.base.org',
      'Base Official',
      RpcProviderRole.PRIMARY,
      RpcProviderType.PUBLIC,
      50,
    ),
    makeEndpoint(
      'https://base-rpc.publicnode.com',
      'PublicNode',
      RpcProviderRole.SECONDARY,
      RpcProviderType.PUBLIC,
      50,
    ),
    makeEndpoint(
      'https://1rpc.io/base',
      '1RPC (Automata)',
      RpcProviderRole.TERTIARY,
      RpcProviderType.COMMUNITY,
      50,
    ),
  ];
}

const CHAIN_ENDPOINT_BUILDERS: Record<number, () => RpcEndpointConfig[]> = {
  1: ethereumEndpoints,
  137: polygonEndpoints,
  42161: arbitrumEndpoints,
  10: optimismEndpoints,
  8453: baseEndpoints,
};

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum Mainnet',
  137: 'Polygon',
  42161: 'Arbitrum One',
  10: 'Optimism',
  8453: 'Base',
};

/**
 * Get the decentralized-first ChainRpcConfig for a single chain.
 */
export function getChainRpcConfig(chainId: number): ChainRpcConfig | undefined {
  const builder = CHAIN_ENDPOINT_BUILDERS[chainId];
  if (!builder) return undefined;

  return {
    chainId,
    chainName: CHAIN_NAMES[chainId] ?? `Chain ${chainId}`,
    endpoints: builder(),
    totalOperationTimeoutMs: 30_000,
    cacheStaleAcceptanceMs: 60_000,
  };
}

/**
 * Get the full multi-chain decentralized-first RPC provider config.
 */
export function getDecentralizedRpcConfig(): RpcProviderConfig {
  const chains: Record<string, ChainRpcConfig> = {};
  for (const chainId of SUPPORTED_CHAIN_IDS) {
    const config = getChainRpcConfig(chainId);
    if (config) {
      chains[String(chainId)] = config;
    }
  }

  return {
    chains,
    circuitBreaker: {
      failureThreshold: 5,
      openDurationMs: 30_000,
      halfOpenMaxAttempts: 2,
      monitorWindowMs: 60_000,
    },
    retry: {
      maxAttempts: 3,
      baseDelayMs: 1_000,
      maxDelayMs: 10_000,
    },
    healthCheck: {
      intervalMs: 30_000,
      timeoutMs: 5_000,
      method: 'eth_blockNumber',
    },
    privacy: {
      rotateWithinTier: true,
      privacyMode: false,
      queryJitterMs: 100,
    },
  };
}

/**
 * Validate that no API keys or env var values are embedded in the config.
 * Call this at build time or on startup to prevent accidental key leaks.
 *
 * @throws Error if any API key pattern is detected
 */
export function assertNoBundledApiKeys(config: RpcProviderConfig): void {
  const violations: string[] = [];

  for (const [chainId, chainConfig] of Object.entries(config.chains)) {
    for (const endpoint of chainConfig.endpoints) {
      for (const pattern of API_KEY_PATTERNS) {
        if (pattern.test(endpoint.url)) {
          violations.push(
            `Chain ${chainId}: API key pattern detected in URL "${endpoint.url}" (provider: ${endpoint.provider})`
          );
        }
        if (endpoint.wsUrl && pattern.test(endpoint.wsUrl)) {
          violations.push(
            `Chain ${chainId}: API key pattern detected in wsUrl "${endpoint.wsUrl}" (provider: ${endpoint.provider})`
          );
        }
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `API key pattern(s) found in RPC config — bundled keys are prohibited:\n` +
      violations.join('\n')
    );
  }
}
