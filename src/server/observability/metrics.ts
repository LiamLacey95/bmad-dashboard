import type { RequestMetrics } from '../types.js';

interface CounterMetric {
  module: string;
  value: number;
}

class MetricsRegistry {
  private requestDurations: RequestMetrics[] = [];
  private consistencyFailures = new Map<string, number>();
  private syncFailures = new Map<string, number>();
  private sqliteWriteLockWaitMs: number[] = [];
  private eventToUiLatencyMs: number[] = [];
  private websocketReconnectAttemptsTotal = 0;
  private staleStateActiveSessionsRatio = 0;

  recordApiRequestDuration(metric: RequestMetrics): void {
    this.requestDurations.push(metric);
  }

  incrementCrossViewConsistencyFailure(module: string): void {
    const current = this.consistencyFailures.get(module) ?? 0;
    this.consistencyFailures.set(module, current + 1);
  }

  incrementSyncFailure(module: string): void {
    const current = this.syncFailures.get(module) ?? 0;
    this.syncFailures.set(module, current + 1);
  }

  observeSqliteWriteLockWait(waitMs: number): void {
    this.sqliteWriteLockWaitMs.push(waitMs);
  }

  observeEventToUiLatency(latencyMs: number): void {
    this.eventToUiLatencyMs.push(latencyMs);
  }

  incrementWebsocketReconnectAttempts(count = 1): void {
    this.websocketReconnectAttemptsTotal += count;
  }

  setStaleStateActiveSessionsRatio(ratio: number): void {
    this.staleStateActiveSessionsRatio = ratio;
  }

  getCrossViewConsistencyFailures(): CounterMetric[] {
    return [...this.consistencyFailures.entries()].map(([module, value]) => ({ module, value }));
  }

  getSyncFailures(): CounterMetric[] {
    return [...this.syncFailures.entries()].map(([module, value]) => ({ module, value }));
  }

  getSqliteWriteLockWaitMs(): number[] {
    return [...this.sqliteWriteLockWaitMs];
  }

  getEventToUiLatencyMs(): number[] {
    return [...this.eventToUiLatencyMs];
  }

  getWebsocketReconnectAttemptsTotal(): number {
    return this.websocketReconnectAttemptsTotal;
  }

  getStaleStateActiveSessionsRatio(): number {
    return this.staleStateActiveSessionsRatio;
  }

  getRequestDurations(): RequestMetrics[] {
    return [...this.requestDurations];
  }

  reset(): void {
    this.requestDurations = [];
    this.consistencyFailures = new Map();
    this.syncFailures = new Map();
    this.sqliteWriteLockWaitMs = [];
    this.eventToUiLatencyMs = [];
    this.websocketReconnectAttemptsTotal = 0;
    this.staleStateActiveSessionsRatio = 0;
  }
}

export const metricsRegistry = new MetricsRegistry();
