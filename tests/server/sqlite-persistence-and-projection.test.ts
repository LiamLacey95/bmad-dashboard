// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import type { NextFunction, Request, Response, Router } from 'express';
import { describe, expect, it } from 'vitest';
import { createSyncRouter } from '../../src/server/routes/syncRoutes.js';
import { DeliveryConsistencyMonitor } from '../../src/server/services/consistencyMonitor.js';
import { ProjectionJobs } from '../../src/server/services/projectionJobs.js';
import { metricsRegistry } from '../../src/server/observability/metrics.js';
import { createSqliteContext, withSqliteRetry } from '../../src/server/dal/sqlite/database.js';
import { applySqliteMigrations } from '../../src/server/dal/sqlite/migrations.js';
import { seedSqliteDemoData } from '../../src/server/dal/sqlite/seed.js';
import { SqliteDeliveryRepository } from '../../src/server/dal/sqlite/sqliteDeliveryRepository.js';
import { SqliteWorkflowRepository } from '../../src/server/dal/sqlite/sqliteWorkflowRepository.js';

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
  return layer.route.stack[resolvedIndex].handle;
}

function createMockResponse() {
  return {
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
}

describe('sqlite persistence, projection, and sync hardening', () => {
  it('creates schema tables/indexes and projects read models with lineage', async () => {
    const sqlitePath = `/tmp/bmad-${randomUUID()}.sqlite`;
    const context = createSqliteContext(sqlitePath);

    try {
      applySqliteMigrations(context.db);
      seedSqliteDemoData(context.db);

      const requiredTables = [
        'domain_events',
        'workflow_transitions',
        'cost_events',
        'agent_metrics',
        'agent_outliers',
        'documents',
        'sync_state'
      ];
      requiredTables.forEach((tableName) => {
        const row = context.db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
          .get(tableName) as { name?: string } | undefined;
        expect(row?.name).toBe(tableName);
      });

      const index = context.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_domain_events_entity_time'")
        .get() as { name?: string } | undefined;
      expect(index?.name).toBe('idx_domain_events_entity_time');

      const jobs = new ProjectionJobs(context.db);
      jobs.runAll();

      const projectedWorkflow = context.db
        .prepare('SELECT workflow_id, lineage_ref FROM workflow_read_model WHERE workflow_id = ?')
        .get('wf-1002') as { workflow_id: string; lineage_ref: string };
      expect(projectedWorkflow.workflow_id).toBe('wf-1002');
      expect(projectedWorkflow.lineage_ref).toContain('workflow:wf-1002');

      const projectedCost = context.db
        .prepare('SELECT project_id, lineage_ref FROM cost_aggregate_daily WHERE project_id = ? LIMIT 1')
        .get('project-core') as { project_id: string; lineage_ref: string };
      expect(projectedCost.project_id).toBe('project-core');
      expect(projectedCost.lineage_ref).toContain('cost-aggregate:project-core');
    } finally {
      context.close();
      unlinkSync(sqlitePath);
    }
  });

  it('retries transient sqlite busy errors and records lock wait', () => {
    metricsRegistry.reset();
    let callCount = 0;

    const value = withSqliteRetry(() => {
      callCount += 1;
      if (callCount <= 2) {
        throw { code: 'SQLITE_BUSY' };
      }
      return 'ok';
    });

    expect(value).toBe('ok');
    expect(callCount).toBe(3);
    const waits = metricsRegistry.getSqliteWriteLockWaitMs();
    expect(waits.length).toBe(1);
    expect(waits[0]).toBeGreaterThan(0);
  });

  it('sync status endpoint returns module detail with last attempt, errors, and stale reason', async () => {
    const sqlitePath = `/tmp/bmad-${randomUUID()}.sqlite`;
    const context = createSqliteContext(sqlitePath);

    try {
      applySqliteMigrations(context.db);
      seedSqliteDemoData(context.db);

      const workflowRepository = new SqliteWorkflowRepository(context.db);
      const deliveryRepository = new SqliteDeliveryRepository(context.db, workflowRepository, false);
      await deliveryRepository.setSyncStatus({
        module: 'cost',
        status: 'error',
        lastSuccessfulSyncAtUtc: '2026-02-19T21:00:00.000Z',
        lastAttemptAtUtc: '2026-02-19T21:01:00.000Z',
        errorMessage: 'source timeout',
        staleReason: 'upstream_unavailable'
      });

      const monitor = new DeliveryConsistencyMonitor(deliveryRepository);
      const router = createSyncRouter(monitor);
      const handler = getRouteHandler(router, '/status', 'get', -1);

      const req = {} as Request;
      const res = createMockResponse() as unknown as Response;
      await handler(req, res, (() => {}) as NextFunction);

      const payload = (res as unknown as {
        body: {
          data: {
            modules: Array<{
              module: string;
              lastAttemptAtUtc: string | null;
              errorMessage: string | null;
              staleReason: string | null;
            }>;
          };
        };
      }).body;

      const costModule = payload.data.modules.find((module) => module.module === 'cost');
      expect(costModule?.lastAttemptAtUtc).toBe('2026-02-19T21:01:00.000Z');
      expect(costModule?.errorMessage).toBe('source timeout');
      expect(costModule?.staleReason).toBe('upstream_unavailable');
    } finally {
      context.close();
      unlinkSync(sqlitePath);
    }
  });
});
