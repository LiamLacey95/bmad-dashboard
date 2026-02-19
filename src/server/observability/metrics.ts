import type { RequestMetrics } from '../types.js';

class MetricsRegistry {
  private requestDurations: RequestMetrics[] = [];

  recordApiRequestDuration(metric: RequestMetrics): void {
    this.requestDurations.push(metric);
  }

  getRequestDurations(): RequestMetrics[] {
    return [...this.requestDurations];
  }

  reset(): void {
    this.requestDurations = [];
  }
}

export const metricsRegistry = new MetricsRegistry();
