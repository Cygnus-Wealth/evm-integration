import { CircuitBreaker, CircuitState } from './CircuitBreaker.js';

/**
 * RPC endpoint configuration
 */
export interface RpcEndpoint {
  url: string;
  priority: number;
}

/**
 * Configuration for RPC fallback chain
 */
export interface RpcFallbackConfig {
  circuitBreakerEnabled?: boolean;
  failureThreshold?: number;
  circuitTimeout?: number;
  enableCachedFallback?: boolean;
}

/**
 * Result of an RPC call through the fallback chain
 */
export interface RpcFallbackResult<T> {
  value?: T;
  success: boolean;
  endpointUrl: string;
  errors: Error[];
  duration: number;
  fromCache?: boolean;
}

/**
 * Per-endpoint statistics
 */
export interface EndpointStats {
  url: string;
  successes: number;
  failures: number;
  circuitState: CircuitState;
  avgResponseTime: number;
}

interface EndpointState {
  endpoint: RpcEndpoint;
  successes: number;
  failures: number;
  totalResponseTime: number;
  circuitBreaker?: CircuitBreaker;
}

/**
 * Per-chain RPC fallback chain that routes calls through prioritized endpoints
 * with circuit breaker protection per endpoint.
 */
export class RpcFallbackChain {
  private chainId: number;
  private endpointStates: EndpointState[];
  private config: Required<RpcFallbackConfig>;
  private lastSuccessfulValue: unknown | undefined;

  constructor(
    chainId: number,
    endpoints: RpcEndpoint[],
    config?: RpcFallbackConfig,
  ) {
    if (!endpoints || endpoints.length === 0) {
      throw new Error(`At least one RPC endpoint is required for chain ${chainId}`);
    }

    this.chainId = chainId;
    this.config = {
      circuitBreakerEnabled: config?.circuitBreakerEnabled ?? false,
      failureThreshold: config?.failureThreshold ?? 5,
      circuitTimeout: config?.circuitTimeout ?? 30000,
      enableCachedFallback: config?.enableCachedFallback ?? false,
    };

    // Sort by priority (lower number = higher priority)
    const sorted = [...endpoints].sort((a, b) => a.priority - b.priority);

    this.endpointStates = sorted.map((endpoint) => {
      const state: EndpointState = {
        endpoint,
        successes: 0,
        failures: 0,
        totalResponseTime: 0,
      };

      if (this.config.circuitBreakerEnabled) {
        state.circuitBreaker = new CircuitBreaker({
          name: `rpc-${chainId}-${endpoint.url}`,
          failureThreshold: this.config.failureThreshold,
          timeout: this.config.circuitTimeout,
          volumeThreshold: 1,
          successThreshold: 1,
        });
      }

      return state;
    });
  }

  getChainId(): number {
    return this.chainId;
  }

  getEndpointUrls(): string[] {
    return this.endpointStates.map((s) => s.endpoint.url);
  }

  /**
   * Execute an RPC operation through the fallback chain.
   * The operation is called once per endpoint attempt — the caller
   * does NOT need to know which endpoint is being used because
   * the adapter already has the transport configured.
   */
  async execute<T>(operation: () => Promise<T>): Promise<RpcFallbackResult<T>> {
    const startTime = Date.now();
    const errors: Error[] = [];

    for (const state of this.endpointStates) {
      // Skip endpoints with open circuit breakers
      if (state.circuitBreaker) {
        const cbState = state.circuitBreaker.getState();
        if (cbState === 'OPEN') {
          // Check if should transition to half-open
          try {
            // Attempt through circuit breaker — it will throw if still open
            const opStart = Date.now();
            const value = await state.circuitBreaker.execute(operation);
            const opDuration = Date.now() - opStart;

            state.successes++;
            state.totalResponseTime += opDuration;
            this.lastSuccessfulValue = value;

            return {
              value,
              success: true,
              endpointUrl: state.endpoint.url,
              errors,
              duration: Date.now() - startTime,
            };
          } catch (error) {
            // Circuit breaker rejected or operation failed
            errors.push(error as Error);
            state.failures++;
            continue;
          }
        }
      }

      try {
        const opStart = Date.now();
        let value: T;

        if (state.circuitBreaker) {
          value = await state.circuitBreaker.execute(operation);
        } else {
          value = await operation();
        }

        const opDuration = Date.now() - opStart;
        state.successes++;
        state.totalResponseTime += opDuration;
        this.lastSuccessfulValue = value;

        return {
          value,
          success: true,
          endpointUrl: state.endpoint.url,
          errors,
          duration: Date.now() - startTime,
        };
      } catch (error) {
        errors.push(error as Error);
        state.failures++;
        continue;
      }
    }

    // All endpoints failed — try cached fallback
    if (this.config.enableCachedFallback && this.lastSuccessfulValue !== undefined) {
      return {
        value: this.lastSuccessfulValue as T,
        success: true,
        endpointUrl: 'cache',
        errors,
        duration: Date.now() - startTime,
        fromCache: true,
      };
    }

    throw new Error(
      `All RPC endpoints failed for chain ${this.chainId}. Errors: ${errors.map((e) => e.message).join(', ')}`
    );
  }

  getEndpointStats(): EndpointStats[] {
    return this.endpointStates.map((state) => {
      const totalCalls = state.successes + state.failures;
      return {
        url: state.endpoint.url,
        successes: state.successes,
        failures: state.failures,
        circuitState: state.circuitBreaker?.getState() ?? 'CLOSED',
        avgResponseTime: totalCalls > 0
          ? state.totalResponseTime / state.successes || 0
          : 0,
      };
    });
  }
}
