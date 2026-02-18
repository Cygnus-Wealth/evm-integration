/**
 * Provider Metrics
 *
 * Tracks P50/P95/P99 latency and rolling 5-minute error rate per (chainId, provider).
 *
 * @module rpc/ProviderMetrics
 */

import {
  LatencyPercentiles,
  ProviderMetricsSnapshot,
  METRICS_ROLLING_WINDOW_MS,
} from './types.js';

interface MetricEntry {
  timestamp: number;
  latencyMs: number;
  isError: boolean;
}

export class ProviderMetrics {
  private entries: Map<string, MetricEntry[]> = new Map();
  private windowMs: number;

  constructor(windowMs: number = METRICS_ROLLING_WINDOW_MS) {
    this.windowMs = windowMs;
  }

  recordSuccess(chainId: number, provider: string, latencyMs: number): void {
    this.addEntry(chainId, provider, { timestamp: Date.now(), latencyMs, isError: false });
  }

  recordError(chainId: number, provider: string, latencyMs: number): void {
    this.addEntry(chainId, provider, { timestamp: Date.now(), latencyMs, isError: true });
  }

  getSnapshot(chainId: number, provider: string): ProviderMetricsSnapshot | undefined {
    const key = this.makeKey(chainId, provider);
    const raw = this.entries.get(key);
    if (!raw) return undefined;

    const now = Date.now();
    const active = raw.filter(e => now - e.timestamp <= this.windowMs);

    // Update stored entries to pruned set
    if (active.length === 0) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.set(key, active);

    const totalRequests = active.length;
    const totalErrors = active.filter(e => e.isError).length;
    const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;

    const latencies = active.map(e => e.latencyMs).sort((a, b) => a - b);
    const latency = this.computePercentiles(latencies);

    return {
      chainId,
      provider,
      latency,
      errorRate,
      totalRequests,
      totalErrors,
      windowStart: new Date(now - this.windowMs),
      windowEnd: new Date(now),
    };
  }

  getAllSnapshots(): ProviderMetricsSnapshot[] {
    const snapshots: ProviderMetricsSnapshot[] = [];
    for (const key of this.entries.keys()) {
      const [chainIdStr, provider] = key.split(':');
      const snap = this.getSnapshot(Number(chainIdStr), provider);
      if (snap) snapshots.push(snap);
    }
    return snapshots;
  }

  reset(): void {
    this.entries.clear();
  }

  private addEntry(chainId: number, provider: string, entry: MetricEntry): void {
    const key = this.makeKey(chainId, provider);
    const list = this.entries.get(key) ?? [];
    list.push(entry);
    this.entries.set(key, list);
  }

  private computePercentiles(sorted: number[]): LatencyPercentiles {
    if (sorted.length === 0) return { p50: 0, p95: 0, p99: 0 };

    return {
      p50: this.percentile(sorted, 0.50),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
    };
  }

  private percentile(sorted: number[], q: number): number {
    const idx = Math.ceil(sorted.length * q) - 1;
    return sorted[Math.max(0, idx)];
  }

  private makeKey(chainId: number, provider: string): string {
    return `${chainId}:${provider}`;
  }
}
