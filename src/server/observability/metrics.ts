import type { RequestMetrics } from '../types.js';

interface CounterMetric {
  module: string;
  value: number;
}

class MetricsRegistry {
  private requestDurations: RequestMetrics[] = [];
  private consistencyFailures = new Map<string, number>();

  recordApiRequestDuration(metric: RequestMetrics): void {
    this.requestDurations.push(metric);
  }

  incrementCrossViewConsistencyFailure(module: string): void {
    const current = this.consistencyFailures.get(module) ?? 0;
    this.consistencyFailures.set(module, current + 1);
  }

  getCrossViewConsistencyFailures(): CounterMetric[] {
    return [...this.consistencyFailures.entries()].map(([module, value]) => ({ module, value }));
  }

  getRequestDurations(): RequestMetrics[] {
    return [...this.requestDurations];
  }

  reset(): void {
    this.requestDurations = [];
    this.consistencyFailures = new Map();
  }
}

export const metricsRegistry = new MetricsRegistry();
