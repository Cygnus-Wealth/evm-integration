/**
 * RPC Circuit Breaker Manager
 *
 * Manages circuit breakers keyed by (chainId, provider).
 * Accepts CircuitBreakerConfig from @cygnus-wealth/rpc-infrastructure.
 *
 * Default: 5 failures/60s → OPEN, 30s timeout, 3 successes to close.
 *
 * @module rpc/RpcCircuitBreakerManager
 */

import { CircuitBreaker, CircuitBreakerConfig as InternalCBConfig, CircuitStats } from '../resilience/CircuitBreaker.js';
import type { CircuitBreakerConfig } from '@cygnus-wealth/rpc-infrastructure';

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  openDurationMs: 30_000,
  halfOpenMaxAttempts: 3,
  monitorWindowMs: 60_000,
};

export class RpcCircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private urlToKey: Map<string, string> = new Map();
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Gets (or creates) a circuit breaker for a (chainId, provider) pair
   */
  getBreaker(chainId: number, provider: string): CircuitBreaker {
    const key = this.makeKey(chainId, provider);
    let breaker = this.breakers.get(key);

    if (!breaker) {
      breaker = new CircuitBreaker({
        name: `rpc:${key}`,
        failureThreshold: this.config.failureThreshold,
        successThreshold: this.config.halfOpenMaxAttempts,
        timeout: this.config.openDurationMs,
        rollingWindow: this.config.monitorWindowMs,
        volumeThreshold: 1,
      });
      this.breakers.set(key, breaker);
    }

    return breaker;
  }

  /**
   * Registers a URL mapping so isOpenForUrl can resolve URL → (chainId, provider)
   */
  registerEndpointUrl(chainId: number, provider: string, url: string): void {
    this.urlToKey.set(url, this.makeKey(chainId, provider));
  }

  /**
   * Checks if the circuit for a (chainId, provider) is open
   */
  isOpen(chainId: number, provider: string): boolean {
    const breaker = this.breakers.get(this.makeKey(chainId, provider));
    if (!breaker) return false;
    return breaker.getState() === 'OPEN';
  }

  /**
   * Checks if the circuit for a URL is open
   */
  isOpenForUrl(url: string): boolean {
    const key = this.urlToKey.get(url);
    if (!key) return false;
    const breaker = this.breakers.get(key);
    if (!breaker) return false;
    return breaker.getState() === 'OPEN';
  }

  /**
   * Resets all managed circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Returns stats for all managed breakers keyed by "chainId:provider"
   */
  getAllStats(): Map<string, CircuitStats> {
    const stats = new Map<string, CircuitStats>();
    for (const [key, breaker] of this.breakers) {
      stats.set(key, breaker.getStats());
    }
    return stats;
  }

  private makeKey(chainId: number, provider: string): string {
    return `${chainId}:${provider}`;
  }
}
