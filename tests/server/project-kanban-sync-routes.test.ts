// @vitest-environment node
import type { NextFunction, Request, Response, Router } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryDeliveryRepository } from '../../src/server/dal/inMemoryDeliveryRepository.js';
import { InMemoryWorkflowRepository } from '../../src/server/dal/inMemoryWorkflowRepository.js';
import { createKanbanRouter } from '../../src/server/routes/kanbanRoutes.js';
import { createProjectRouter } from '../../src/server/routes/projectRoutes.js';
import { createStoryRouter } from '../../src/server/routes/storyRoutes.js';
import { createSyncRouter } from '../../src/server/routes/syncRoutes.js';
import { DeliveryConsistencyMonitor } from '../../src/server/services/consistencyMonitor.js';

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

describe('project, kanban, and sync routes', () => {
  const workflowRepository = new InMemoryWorkflowRepository();
  const deliveryRepository = new InMemoryDeliveryRepository(workflowRepository, false);

  it('lists projects with overdue and risk indicators', async () => {
    const router = createProjectRouter(deliveryRepository);
    const handler = getRouteHandler(router, '/', 'get', -1);

    const req = { query: {} } as unknown as Request;
    const res = createMockResponse() as unknown as Response;
    const next = vi.fn() as NextFunction;

    await handler(req, res, next);

    const payload = (res as unknown as {
      body: { data: { items: Array<{ riskFlag: boolean; isOverdue: boolean; ownerId: string; progressPct: number }> } };
    }).body;

    expect(payload.data.items.length).toBeGreaterThan(0);
    expect(payload.data.items.every((project) => typeof project.ownerId === 'string')).toBe(true);
    expect(payload.data.items.every((project) => typeof project.progressPct === 'number')).toBe(true);
    expect(payload.data.items.some((project) => project.riskFlag)).toBe(true);
    expect(payload.data.items.some((project) => project.isOverdue)).toBe(true);
  });

  it('returns project context links to stories, workflows, and documents', async () => {
    const router = createProjectRouter(deliveryRepository);
    const handler = getRouteHandler(router, '/:id/context', 'get', -1);

    const req = { params: { id: 'project-core' } } as unknown as Request;
    const res = createMockResponse() as unknown as Response;
    const next = vi.fn() as NextFunction;

    await handler(req, res, next);

    const payload = (res as unknown as {
      body: {
        data: {
          stories: unknown[];
          workflows: unknown[];
          documents: unknown[];
        };
      };
    }).body;

    expect(payload.data.stories.length).toBeGreaterThan(0);
    expect(payload.data.workflows.length).toBeGreaterThan(0);
    expect(payload.data.documents.length).toBeGreaterThan(0);
  });

  it('returns kanban board columns and read-only mode by default', async () => {
    const router = createKanbanRouter(deliveryRepository);
    const handler = getRouteHandler(router, '/board', 'get', -1);

    const req = { query: {} } as unknown as Request;
    const res = createMockResponse() as unknown as Response;
    const next = vi.fn() as NextFunction;

    await handler(req, res, next);

    const payload = (res as unknown as {
      body: {
        data: {
          readOnly: boolean;
          editable: boolean;
          columns: Array<{ id: string; cards: Array<{ storyId: string; ownerId: string; status: string }> }>;
        };
      };
    }).body;

    expect(payload.data.readOnly).toBe(true);
    expect(payload.data.editable).toBe(false);
    expect(payload.data.columns.length).toBeGreaterThan(0);
    expect(payload.data.columns.some((column) => column.cards.length > 0)).toBe(true);
  });

  it('returns consistency warning with module and last successful sync time', async () => {
    const monitor = new DeliveryConsistencyMonitor(deliveryRepository);
    const router = createSyncRouter(monitor);
    const handler = getRouteHandler(router, '/status', 'get', -1);

    const req = {} as Request;
    const res = createMockResponse() as unknown as Response;
    const next = vi.fn() as NextFunction;

    await handler(req, res, next);

    const payload = (res as unknown as {
      body: {
        data: {
          warnings: Array<{ module: string; lastSuccessfulSyncAtUtc: string | null }>;
        };
      };
    }).body;

    expect(payload.data.warnings.length).toBeGreaterThan(0);
    expect(payload.data.warnings[0].module).toBeTruthy();
    expect(payload.data.warnings[0]).toHaveProperty('lastSuccessfulSyncAtUtc');
  });

  it('keeps patch story status disabled while editable mode flag is off', async () => {
    const router = createStoryRouter(
      deliveryRepository,
      {
        getSnapshotMessage: vi.fn(),
        getMessagesAfter: vi.fn(),
        onMessage: vi.fn(),
        publishTransition: vi.fn(),
        publishStoryStatusChange: vi.fn()
      },
      false
    );
    const handler = getRouteHandler(router, '/:id/status', 'patch', -1);

    const req = {
      params: { id: 'story-301' },
      body: { status: 'done', reason: 'manual override' }
    } as unknown as Request;
    const res = createMockResponse() as unknown as Response;
    const next = vi.fn() as NextFunction;

    await handler(req, res, next);

    const captured = next.mock.calls[0]?.[0] as Error & { statusCode?: number };
    expect(captured.statusCode).toBe(403);
    expect(captured.message).toContain('read-only');
  });
});
