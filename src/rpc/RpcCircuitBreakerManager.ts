/**
 * RPC Circuit Breaker Manager
 *
 * Manages circuit breakers keyed by (chainId, provider).
 * Default config per directive: 5 failures/60s → OPEN, 30s timeout, 3 successes to close.
 *
 * @module rpc/RpcCircuitBreakerManager
 */

import { CircuitBreaker, CircuitBreakerConfig, CircuitStats } from '../resilience/CircuitBreaker.js';
import {
  RpcCircuitBreakerConfig,
  DEFAULT_RPC_CIRCUIT_BREAKER_CONFIG,
} from './types.js';

export class RpcCircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private config: RpcCircuitBreakerConfig;

  constructor(config?: Partial<RpcCircuitBreakerConfig>) {
    this.config = { ...DEFAULT_RPC_CIRCUIT_BREAKER_CONFIG, ...config };
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
        successThreshold: this.config.successThreshold,
        timeout: this.config.openTimeoutMs,
        rollingWindow: this.config.rollingWindowMs,
        volumeThreshold: 1, // No minimum volume for RPC — any 5 failures triggers
      });
      this.breakers.set(key, breaker);
    }

    return breaker;
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
