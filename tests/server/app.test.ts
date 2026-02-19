// @vitest-environment node
import type { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryStatusModelRepository } from '../../src/server/dal/inMemoryStatusModelRepository.js';
import { errorHandler, notFoundHandler } from '../../src/server/middleware/errorHandler.js';
import { observabilityMiddleware } from '../../src/server/middleware/observability.js';
import { requestIdMiddleware } from '../../src/server/middleware/requestId.js';
import { validateRequest } from '../../src/server/middleware/validation.js';
import { metricsRegistry } from '../../src/server/observability/metrics.js';
import { createHealthRouter } from '../../src/server/routes/healthRoutes.js';
import { createMetaRouter } from '../../src/server/routes/metaRoutes.js';
import { CANONICAL_STATUSES } from '../../src/shared/statusModel.js';

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

describe('API foundation (unit)', () => {
  it('returns health payload at /api/v1/health', async () => {
    const healthRouter = createHealthRouter();
    const handler = getRouteHandler(healthRouter, '/', 'get', -1);

    const req = {} as Request;
    const res = createMockResponse() as unknown as Response;
    const next = vi.fn() as NextFunction;

    await handler(req, res, next);

    const body = (res as unknown as { body: { data: { status: string; checks: Record<string, string> } } }).body;
    expect(body.data.status).toBe('ok');
    expect(body.data.checks).toEqual({
      api: 'up',
      db: 'not_configured',
      websocket: 'not_configured'
    });
  });

  it('returns canonical status model from metadata route handler', async () => {
    const metaRouter = createMetaRouter(new InMemoryStatusModelRepository());
    const handler = getRouteHandler(metaRouter, '/status-model', 'get', -1);

    const req = { query: {} } as Request;
    const res = createMockResponse() as unknown as Response;
    const next = vi.fn() as NextFunction;

    await handler(req, res, next);

    const body = (res as unknown as {
      body: { data: { statuses: string[]; allowedTransitions: Record<string, string[]> } };
    }).body;

    expect(body.data.statuses).toEqual(CANONICAL_STATUSES);
    expect(body.data.allowedTransitions.queued).toContain('in_progress');
  });

  it('omits transitions when includeTransitions=false', async () => {
    const metaRouter = createMetaRouter(new InMemoryStatusModelRepository());
    const handler = getRouteHandler(metaRouter, '/status-model', 'get', -1);

    const req = { query: { includeTransitions: 'false' } } as unknown as Request;
    const res = createMockResponse() as unknown as Response;
    const next = vi.fn() as NextFunction;

    await handler(req, res, next);

    const body = (res as unknown as { body: { data: { statuses: string[]; allowedTransitions?: unknown } } }).body;
    expect(body.data.statuses).toEqual(CANONICAL_STATUSES);
    expect(body.data.allowedTransitions).toBeUndefined();
  });

  it('returns validation error shape for invalid request data', () => {
    const middleware = validateRequest({
      query: z.object({
        includeTransitions: z.enum(['true', 'false']).optional()
      })
    });

    const req = { query: { includeTransitions: 'invalid' } } as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    const err = next.mock.calls[0]?.[0] as { statusCode: number; code: string; details: unknown[] };
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(err.details)).toBe(true);
  });

  it('sets or propagates correlation id on requests', () => {
    const req = {
      header: vi.fn((name: string) => (name === 'x-correlation-id' ? 'req-from-header' : undefined))
    } as unknown as Request;
    const setHeader = vi.fn();
    const res = { setHeader } as unknown as Response;
    const next = vi.fn() as NextFunction;

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe('req-from-header');
    expect(setHeader).toHaveBeenCalledWith('x-correlation-id', 'req-from-header');
    expect(next).toHaveBeenCalledOnce();
  });

  it('records api request duration metrics from middleware hook', () => {
    metricsRegistry.reset();

    let finishHandler: (() => void) | undefined;
    const req = {
      method: 'GET',
      path: '/api/v1/health',
      originalUrl: '/api/v1/health',
      requestId: 'req-obs'
    } as unknown as Request;
    const res = {
      statusCode: 200,
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'finish') {
          finishHandler = handler;
        }
      })
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    observabilityMiddleware(req, res, next);
    finishHandler?.();

    const metrics = metricsRegistry.getRequestDurations();
    expect(next).toHaveBeenCalledOnce();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].method).toBe('GET');
    expect(metrics[0].status).toBe(200);
    expect(metrics[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns standardized not found envelope via handlers', () => {
    const next = vi.fn() as NextFunction;
    const req = {
      method: 'GET',
      originalUrl: '/api/v1/unknown',
      requestId: 'req-123'
    } as Request;

    notFoundHandler(req, {} as Response, next);

    const captured = next.mock.calls[0]?.[0] as Error & { statusCode?: number; code?: string };
    const res = createMockResponse() as unknown as Response;
    errorHandler(captured, req, res, vi.fn() as NextFunction);

    const result = (res as unknown as {
      statusCode: number;
      body: { error: { code: string; message: string; requestId: string } };
    });

    expect(result.statusCode).toBe(404);
    expect(result.body.error.code).toBe('NOT_FOUND');
    expect(result.body.error.message).toContain('Route not found');
    expect(result.body.error.requestId).toBe('req-123');
  });
});
