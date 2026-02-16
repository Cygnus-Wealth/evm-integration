/**
 * Health monitor implementation
 *
 * @module observability/HealthMonitor
 * @see interfaces.ts for IHealthMonitor contract
 */

import {
  IHealthMonitor,
  HealthStatus,
  HealthCheckResult,
  SystemHealth,
  HealthCheckConfig,
} from './interfaces.js';

/**
 * Health monitor implementation
 * Continuously assesses system health through registered checks
 */
export class HealthMonitor implements IHealthMonitor {
  private checks: Map<string, HealthCheckConfig>;
  private results: Map<string, HealthCheckResult>;
  private intervals: Map<string, NodeJS.Timeout>;
  private startTime: number;
  private isRunning: boolean;

  constructor() {
    this.checks = new Map();
    this.results = new Map();
    this.intervals = new Map();
    this.startTime = Date.now();
    this.isRunning = false;
  }

  /**
   * Registers a new health check
   *
   * @param config - Health check configuration
   */
  registerCheck(config: HealthCheckConfig): void {
    this.checks.set(config.component, config);

    // If monitor is running, start periodic checks for this component
    if (this.isRunning) {
      this.startPeriodicCheck(config);
    }
  }

  /**
   * Unregisters a health check
   *
   * @param component - Component name to unregister
   * @returns True if check was unregistered
   */
  unregisterCheck(component: string): boolean {
    const existed = this.checks.delete(component);

    if (existed) {
      // Stop periodic checks
      const interval = this.intervals.get(component);
      if (interval) {
        clearInterval(interval);
        this.intervals.delete(component);
      }

      // Clear cached result
      this.results.delete(component);
    }

    return existed;
  }

  /**
   * Executes all health checks immediately
   *
   * @returns Promise resolving to system health summary
   */
  async runHealthChecks(): Promise<SystemHealth> {
    const checkPromises = Array.from(this.checks.values()).map((config) =>
      this.runSingleCheck(config)
    );

    const componentResults = await Promise.all(checkPromises);

    // Update cached results
    for (const result of componentResults) {
      this.results.set(result.component, result);
    }

    return this.buildSystemHealth(componentResults);
  }

  /**
   * Gets cached status for a specific component
   *
   * @param component - Component name
   * @returns Latest health check result or undefined
   */
  getStatus(component: string): HealthCheckResult | undefined {
    return this.results.get(component);
  }

  /**
   * Gets overall system health from cached results
   *
   * @returns Current system health
   */
  getSystemHealth(): SystemHealth {
    const componentResults = Array.from(this.results.values());
    return this.buildSystemHealth(componentResults);
  }

  /**
   * Starts periodic health checks
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Start periodic checks for all registered checks
    for (const config of this.checks.values()) {
      this.startPeriodicCheck(config);
    }
  }

  /**
   * Stops all periodic health checks
   */
  stop(): void {
    this.isRunning = false;

    // Clear all intervals
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }

    this.intervals.clear();
  }

  /**
   * Runs a single health check with timeout
   *
   * @param config - Health check configuration
   * @returns Promise resolving to health check result
   * @private
   */
  private async runSingleCheck(config: HealthCheckConfig): Promise<HealthCheckResult> {
    const startTime = performance.now();
    const timeout = config.timeout || 5000;

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Health check timeout: ${config.component}`)), timeout);
      });

      // Race between check and timeout
      const result = await Promise.race([config.check(), timeoutPromise]);

      const responseTime = performance.now() - startTime;

      return {
        ...result,
        responseTime,
      };
    } catch (error) {
      const responseTime = performance.now() - startTime;

      return {
        component: config.component,
        status: HealthStatus.UNHEALTHY,
        timestamp: new Date(),
        responseTime,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Starts periodic checks for a single component
   *
   * @param config - Health check configuration
   * @private
   */
  private startPeriodicCheck(config: HealthCheckConfig): void {
    const interval = config.interval || 60000;

    // Run initial check
    this.runSingleCheck(config).then((result) => {
      this.results.set(config.component, result);
    });

    // Start periodic checks
    const intervalId = setInterval(async () => {
      const result = await this.runSingleCheck(config);
      this.results.set(config.component, result);
    }, interval);

    this.intervals.set(config.component, intervalId);
  }

  /**
   * Builds system health summary from component results
   *
   * @param componentResults - Array of component health check results
   * @returns System health summary
   * @private
   */
  private buildSystemHealth(componentResults: HealthCheckResult[]): SystemHealth {
    const overallStatus = this.determineOverallStatus(componentResults);
    const uptime = Date.now() - this.startTime;

    return {
      status: overallStatus,
      components: componentResults,
      timestamp: new Date(),
      uptime,
    };
  }

  /**
   * Determines overall system status from component statuses
   *
   * @param results - Component health check results
   * @returns Aggregated system status
   * @private
   */
  private determineOverallStatus(results: HealthCheckResult[]): HealthStatus {
    if (results.length === 0) {
      return HealthStatus.HEALTHY;
    }

    // Check for critical failures
    for (const result of results) {
      const config = this.checks.get(result.component);
      if (config?.critical && result.status === HealthStatus.UNHEALTHY) {
        return HealthStatus.UNHEALTHY;
      }
    }

    // Check for any unhealthy components
    const hasUnhealthy = results.some((r) => r.status === HealthStatus.UNHEALTHY);
    if (hasUnhealthy) {
      return HealthStatus.DEGRADED;
    }

    // Check for degraded components
    const hasDegraded = results.some((r) => r.status === HealthStatus.DEGRADED);
    if (hasDegraded) {
      return HealthStatus.DEGRADED;
    }

    return HealthStatus.HEALTHY;
  }
}
