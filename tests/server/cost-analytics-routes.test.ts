// @vitest-environment node
import type { NextFunction, Request, Response, Router } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryCostAnalyticsRepository } from '../../src/server/dal/inMemoryCostAnalyticsRepository.js';
import { createAnalyticsRouter } from '../../src/server/routes/analyticsRoutes.js';
import { createCostRouter } from '../../src/server/routes/costRoutes.js';
import { createMetaRouter } from '../../src/server/routes/metaRoutes.js';
import { InMemoryStatusModelRepository } from '../../src/server/dal/inMemoryStatusModelRepository.js';

function getRouteHandler(
  router: Router,
  path: string,
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  handlerIndex = -1
): (req: Request, res: Response, next: NextFunction) => void | Promise<void> {
  const stack = (router as unknown as { stack: unknown[] }).stack as Array<{
    route?: {
      path: string;
      methods: Record<string, boolean>;
      stack: Array<{ handle: (req: Request, res: Response, next: NextFunction) => unknown }>;
    };
  }>;

  const layer = stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
  if (!layer?.route) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }

  const resolvedIndex = handlerIndex < 0 ? layer.route.stack.length + handlerIndex : handlerIndex;
  const selected = layer.route.stack[resolvedIndex];
  if (!selected) {
    throw new Error(`Handler index ${handlerIndex} not found for ${method.toUpperCase()} ${path}`);
  }

  return selected.handle;
}

function createMockResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    }
  };

  return res;
}

describe('cost and analytics routes', () => {
  const repository = new InMemoryCostAnalyticsRepository();

  it('returns unavailable instead of zero for missing cost data in summary', async () => {
    const router = createCostRouter(repository);
    const handler = getRouteHandler(router, '/summary', 'get', -1);

    const req = {
      query: {
        window: 'custom',
        start: '2025-01-01T00:00:00.000Z',
        end: '2025-01-02T00:00:00.000Z'
      }
    } as unknown as Request;
    const res = createMockResponse() as unknown as Response;
    const next = vi.fn() as NextFunction;

    await handler(req, res, next);

    const payload = (res as unknown as {
      body: {
        data: {
          aggregate: { totalCost: number | null; availability: string };
          projects: Array<{ totalCost: number | null; availability: string }>;
        };
      };
    }).body;

    expect(payload.data.aggregate.totalCost).toBeNull();
    expect(payload.data.aggregate.availability).toBe('unavailable');
    expect(payload.data.projects.every((project) => project.totalCost === null)).toBe(true);
    expect(payload.data.projects.every((project) => project.availability === 'unavailable')).toBe(true);
  });

  it('rejects invalid custom window with validation feedback', () => {
    const router = createCostRouter(repository);
    const validationHandler = getRouteHandler(router, '/summary', 'get', 0);

    const req = {
      query: {
        window: 'custom',
        start: '2026-02-19T10:00:00.000Z',
        end: '2026-02-19T09:00:00.000Z'
      }
    } as unknown as Request;
    const next = vi.fn() as NextFunction;

    validationHandler(req, {} as Response, next);

    const captured = next.mock.calls[0]?.[0] as { statusCode: number; code: string; details: unknown[] };
    expect(captured.statusCode).toBe(422);
    expect(captured.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(captured.details)).toBe(true);
  });

  it('returns timeseries buckets with unavailable gaps', async () => {
    const router = createCostRouter(repository);
    const handler = getRouteHandler(router, '/timeseries', 'get', -1);

    const req = {
      query: {
        bucket: 'hour',
        start: '2026-02-19T00:00:00.000Z',
        end: '2026-02-19T05:00:00.000Z'
      }
    } as unknown as Request;
    const res = createMockResponse() as unknown as Response;
    const next = vi.fn() as NextFunction;

    await handler(req, res, next);

    const payload = (res as unknown as {
      body: {
        data: {
          series: Array<{ scope: string; points: Array<{ availability: string; totalCost: number | null }> }>;
        };
      };
    }).body;

    const aggregate = payload.data.series.find((series) => series.scope === 'aggregate');
    expect(aggregate).toBeTruthy();
    expect(aggregate?.points.some((point) => point.availability === 'unavailable' && point.totalCost === null)).toBe(true);
  });

  it('supports multi-agent KPI trends and includes KPI definitions', async () => {
    const router = createAnalyticsRouter(repository);
    const handler = getRouteHandler(router, '/agents/trends', 'get', -1);

    const req = {
      query: {
        agentIds: ['agent-alpha', 'agent-beta'],
        kpis: ['latency_p95_ms', 'success_rate_pct'],
        start: '2026-02-16T00:00:00.000Z',
        end: '2026-02-19T00:00:00.000Z'
      }
    } as unknown as Request;
    const res = createMockResponse() as unknown as Response;

    await handler(req, res, vi.fn() as NextFunction);

    const payload = (res as unknown as {
      body: {
        data: {
          series: Array<{ agentId: string; kpiKey: string; unit: string; points: unknown[] }>;
          kpis: Array<{ key: string; unit: string; definition: string }>;
        };
      };
    }).body;

    expect(payload.data.series.length).toBeGreaterThan(1);
    expect(payload.data.series.every((series) => series.points.length > 0)).toBe(true);
    expect(payload.data.kpis.every((kpi) => kpi.unit.length > 0 && kpi.definition.length > 0)).toBe(true);
  });

  it('returns outlier flags and insufficient-data reasons', async () => {
    const router = createAnalyticsRouter(repository);
    const handler = getRouteHandler(router, '/agents/outliers', 'get', -1);

    const req = {
      query: {
        agentIds: ['agent-alpha', 'agent-gamma'],
        kpi: 'latency_p95_ms',
        start: '2026-02-16T00:00:00.000Z',
        end: '2026-02-19T00:00:00.000Z'
      }
    } as unknown as Request;
    const res = createMockResponse() as unknown as Response;

    await handler(req, res, vi.fn() as NextFunction);

    const payload = (res as unknown as {
      body: {
        data: {
          items: Array<{ score: number; lineageRef: string }>;
          unavailable: Array<{ agentId: string; reason: string; sampleSize: number; minimumRequired: number }>;
        };
      };
    }).body;

    expect(payload.data.items.some((item) => Math.abs(item.score) >= 1.25 && item.lineageRef.length > 0)).toBe(true);
    expect(payload.data.unavailable.some((row) => row.agentId === 'agent-gamma')).toBe(true);
    expect(payload.data.unavailable[0].reason).toContain('at least 3 data points');
  });

  it('provides lineage drilldown details by lineageRef', async () => {
    const router = createAnalyticsRouter(repository);
    const handler = getRouteHandler(router, '/lineage/:lineageRef', 'get', -1);

    const req = {
      params: {
        lineageRef: 'lineage:outlier:agent-alpha:latency:2026-02-18'
      }
    } as unknown as Request;
    const res = createMockResponse() as unknown as Response;

    await handler(req, res, vi.fn() as NextFunction);

    const payload = (res as unknown as {
      body: {
        data: {
          events: unknown[];
          artifacts: unknown[];
        };
      };
    }).body;

    expect(payload.data.events.length).toBeGreaterThan(0);
    expect(payload.data.artifacts.length).toBeGreaterThan(0);
  });

  it('returns KPI metadata from /meta/kpis', async () => {
    const router = createMetaRouter(new InMemoryStatusModelRepository(), repository);
    const handler = getRouteHandler(router, '/kpis', 'get', -1);

    const res = createMockResponse() as unknown as Response;
    await handler({} as Request, res, vi.fn() as NextFunction);

    const payload = (res as unknown as {
      body: { data: { items: Array<{ key: string; definition: string; unit: string }>; total: number } };
    }).body;

    expect(payload.data.total).toBeGreaterThan(0);
    expect(payload.data.items[0].definition).toBeTruthy();
    expect(payload.data.items[0].unit).toBeTruthy();
  });

  it('exposes SQLite index statements for cost and metrics query paths', () => {
    const statements = repository.getSqliteIndexStatements();

    expect(statements).toContain(
      'CREATE INDEX IF NOT EXISTS idx_cost_events_project_time ON cost_events(project_id, occurred_at_utc DESC);'
    );
    expect(statements).toContain(
      'CREATE INDEX IF NOT EXISTS idx_agent_metrics_agent_kpi_window_end ON agent_metrics(agent_id, kpi_key, window_end_utc DESC);'
    );
  });
});
