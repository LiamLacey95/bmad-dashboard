// @vitest-environment node
import type { NextFunction, Request, Response, Router } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryDeliveryRepository } from '../../src/server/dal/inMemoryDeliveryRepository.js';
import { InMemoryWorkflowRepository } from '../../src/server/dal/inMemoryWorkflowRepository.js';
import { createDocumentRouter } from '../../src/server/routes/documentRoutes.js';

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

describe('document routes', () => {
  const workflowRepository = new InMemoryWorkflowRepository();
  const deliveryRepository = new InMemoryDeliveryRepository(workflowRepository, false);

  it('lists documents and supports project filtering', async () => {
    const router = createDocumentRouter(deliveryRepository);
    const handler = getRouteHandler(router, '/', 'get', -1);

    const req = { query: { projectId: 'project-core' } } as unknown as Request;
    const res = createMockResponse() as unknown as Response;
    const next = vi.fn() as NextFunction;

    await handler(req, res, next);

    const payload = (res as unknown as { body: { data: { items: Array<{ projectId: string }>; total: number } } }).body;
    expect(payload.data.total).toBeGreaterThan(0);
    expect(payload.data.items.every((item) => item.projectId === 'project-core')).toBe(true);
  });

  it('returns document metadata by id', async () => {
    const router = createDocumentRouter(deliveryRepository);
    const handler = getRouteHandler(router, '/:id', 'get', -1);

    const req = { params: { id: 'doc-101' } } as unknown as Request;
    const res = createMockResponse() as unknown as Response;
    const next = vi.fn() as NextFunction;

    await handler(req, res, next);

    const payload = (res as unknown as { body: { data: { id: string; mimeType: string; checksum: string } } }).body;
    expect(payload.data.id).toBe('doc-101');
    expect(payload.data.mimeType).toBe('text/markdown');
    expect(payload.data.checksum).toContain('sha256:');
  });

  it('returns supported content payload for allowlisted MIME types', async () => {
    const router = createDocumentRouter(deliveryRepository);
    const handler = getRouteHandler(router, '/:id/content', 'get', -1);

    const req = { params: { id: 'doc-200' } } as unknown as Request;
    const res = createMockResponse() as unknown as Response;
    const next = vi.fn() as NextFunction;

    await handler(req, res, next);

    const payload = (res as unknown as {
      body: { data: { renderMode: string; safeToRenderInline: boolean; content: string | null } };
    }).body;

    expect(payload.data.renderMode).toBe('json');
    expect(payload.data.safeToRenderInline).toBe(true);
    expect(payload.data.content).toContain('migrationId');
  });

  it('returns fallback payloads for unsupported or missing content', async () => {
    const router = createDocumentRouter(deliveryRepository);
    const handler = getRouteHandler(router, '/:id/content', 'get', -1);

    const unsupportedReq = { params: { id: 'doc-300' } } as unknown as Request;
    const missingReq = { params: { id: 'doc-301' } } as unknown as Request;
    const unsupportedRes = createMockResponse() as unknown as Response;
    const missingRes = createMockResponse() as unknown as Response;
    const next = vi.fn() as NextFunction;

    await handler(unsupportedReq, unsupportedRes, next);
    await handler(missingReq, missingRes, next);

    const unsupportedPayload = (unsupportedRes as unknown as { body: { data: { renderMode: string; guidance: string } } }).body;
    const missingPayload = (missingRes as unknown as { body: { data: { renderMode: string; guidance: string } } }).body;

    expect(unsupportedPayload.data.renderMode).toBe('unsupported');
    expect(unsupportedPayload.data.guidance).toContain('allowlist');
    expect(missingPayload.data.renderMode).toBe('missing');
    expect(missingPayload.data.guidance).toContain('Re-sync');
  });
});
