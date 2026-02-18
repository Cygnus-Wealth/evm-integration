/**
 * RPC Rate Limiter
 *
 * Manages per-endpoint token bucket rate limiters based on rateLimitRps config.
 *
 * @module rpc/RpcRateLimiter
 */

import { RateLimiter } from '../security/RateLimiter.js';

export class RpcRateLimiter {
  private limiters: Map<string, RateLimiter> = new Map();

  /**
   * Gets (or creates) a rate limiter for an endpoint.
   * The limiter uses token bucket with capacity = rps and refill rate = rps/s.
   */
  getLimiter(endpointUrl: string, rateLimitRps: number): RateLimiter {
    let rl = this.limiters.get(endpointUrl);
    if (!rl) {
      rl = new RateLimiter({
        capacity: rateLimitRps,
        refillRate: rateLimitRps,
        maxWait: 5000,
        name: endpointUrl,
      });
      this.limiters.set(endpointUrl, rl);
    }
    return rl;
  }

  /**
   * Checks if an endpoint has available rate limit tokens without consuming one.
   */
  isAllowed(endpointUrl: string, rateLimitRps: number): boolean {
    const rl = this.getLimiter(endpointUrl, rateLimitRps);
    return rl.getAvailableTokens() >= 1;
  }

  /**
   * Clears all managed limiters.
   */
  reset(): void {
    this.limiters.clear();
  }
}
