// @vitest-environment node
import type { NextFunction, Request, Response, Router } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryWorkflowRepository } from '../../src/server/dal/inMemoryWorkflowRepository.js';
import { createWorkflowRouter } from '../../src/server/routes/workflowRoutes.js';

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

describe('workflow routes', () => {
  const workflowRouter = createWorkflowRouter(new InMemoryWorkflowRepository());

  it('lists workflows and supports blocked/failed filter', async () => {
    const handler = getRouteHandler(workflowRouter, '/', 'get', -1);

    const req = { query: { status: ['blocked', 'failed'], page: 1, pageSize: 50 } } as unknown as Request;
    const res = createMockResponse() as unknown as Response;
    const next = vi.fn() as NextFunction;

    await handler(req, res, next);

    const payload = (res as unknown as {
      body: { data: { items: Array<{ status: string; lastTransitionAt: string }> } };
    }).body;

    expect(payload.data.items.length).toBeGreaterThan(0);
    expect(payload.data.items.every((item) => item.status === 'blocked' || item.status === 'failed')).toBe(true);

    for (let index = 1; index < payload.data.items.length; index += 1) {
      const current = new Date(payload.data.items[index].lastTransitionAt).getTime();
      const previous = new Date(payload.data.items[index - 1].lastTransitionAt).getTime();
      expect(previous).toBeGreaterThanOrEqual(current);
    }
  });

  it('returns transition timeline in ascending occurred order', async () => {
    const handler = getRouteHandler(workflowRouter, '/:id/transitions', 'get', -1);

    const req = {
      params: { id: 'wf-1002' },
      query: { limit: 10 }
    } as unknown as Request;
    const res = createMockResponse() as unknown as Response;
    const next = vi.fn() as NextFunction;

    await handler(req, res, next);

    const payload = (res as unknown as {
      body: { data: { items: Array<{ toStatus: string; occurredAtUtc: string }> } };
    }).body;

    expect(payload.data.items).toHaveLength(2);
    expect(payload.data.items[0].toStatus).toBe('in_progress');
    expect(payload.data.items[1].toStatus).toBe('blocked');
    expect(new Date(payload.data.items[0].occurredAtUtc).getTime()).toBeLessThan(
      new Date(payload.data.items[1].occurredAtUtc).getTime()
    );
  });

  it('returns explicit timeline error for corrupt transition data', async () => {
    const handler = getRouteHandler(workflowRouter, '/:id/transitions', 'get', -1);

    const req = {
      params: { id: 'wf-corrupt' },
      query: { limit: 100 }
    } as unknown as Request;
    const res = createMockResponse() as unknown as Response;
    const next = vi.fn() as NextFunction;

    await handler(req, res, next);

    const captured = next.mock.calls[0]?.[0] as Error;
    expect(captured.message).toContain('timeline is unavailable');
  });
});
