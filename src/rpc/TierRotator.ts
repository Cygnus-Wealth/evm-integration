/**
 * Tier-based endpoint rotation for RPC fallback chain
 *
 * Groups endpoints by RpcProviderRole and provides weighted random
 * selection within each tier when rotateWithinTier is enabled.
 *
 * @module rpc/TierRotator
 */

import {
  RpcEndpointConfig,
  RpcProviderRole,
} from '@cygnus-wealth/rpc-infrastructure';

const TIER_ORDER: RpcProviderRole[] = [
  RpcProviderRole.PRIMARY,
  RpcProviderRole.SECONDARY,
  RpcProviderRole.TERTIARY,
  RpcProviderRole.EMERGENCY,
];

const DEFAULT_WEIGHT = 100;

export class TierRotator {
  private tiers: Map<RpcProviderRole, RpcEndpointConfig[]> = new Map();

  constructor(endpoints: RpcEndpointConfig[]) {
    for (const ep of endpoints) {
      const list = this.tiers.get(ep.role) ?? [];
      list.push(ep);
      this.tiers.set(ep.role, list);
    }
  }

  /**
   * Returns the ordered list of tiers that have at least one endpoint.
   */
  getTierOrder(): RpcProviderRole[] {
    return TIER_ORDER.filter(tier => {
      const eps = this.tiers.get(tier);
      return eps !== undefined && eps.length > 0;
    });
  }

  /**
   * Returns all endpoints for a given tier.
   */
  getEndpointsForTier(tier: RpcProviderRole): RpcEndpointConfig[] {
    return this.tiers.get(tier) ?? [];
  }

  /**
   * Selects the next endpoint from a tier.
   *
   * When rotate=false, always returns the first endpoint (deterministic).
   * When rotate=true, performs weighted random selection using endpoint weights.
   *
   * @param tier - The provider role/tier to select from
   * @param rotate - Whether to rotate (weighted random) or use first available
   * @param excludedUrls - URLs to skip (e.g. circuit-broken endpoints)
   * @returns The selected endpoint, or null if none available
   */
  selectNext(
    tier: RpcProviderRole,
    rotate: boolean,
    excludedUrls?: Set<string>,
  ): RpcEndpointConfig | null {
    const candidates = this.getEndpointsForTier(tier);

    const available = excludedUrls
      ? candidates.filter(ep => !excludedUrls.has(ep.url))
      : candidates;

    if (available.length === 0) return null;
    if (available.length === 1) return available[0];

    if (!rotate) {
      return available[0];
    }

    return this.weightedSelect(available);
  }

  private weightedSelect(endpoints: RpcEndpointConfig[]): RpcEndpointConfig {
    const totalWeight = endpoints.reduce(
      (sum, ep) => sum + (ep.weight ?? DEFAULT_WEIGHT),
      0,
    );

    let random = Math.random() * totalWeight;

    for (const ep of endpoints) {
      random -= ep.weight ?? DEFAULT_WEIGHT;
      if (random <= 0) return ep;
    }

    // Fallback (should not reach here)
    return endpoints[endpoints.length - 1];
  }
}
