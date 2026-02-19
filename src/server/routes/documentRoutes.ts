import { Router } from 'express';
import { z } from 'zod';
import type { DeliveryRepository } from '../dal/interfaces.js';
import { validateRequest } from '../middleware/validation.js';

const DEFAULT_INLINE_MIME_ALLOWLIST = ['text/markdown', 'application/pdf', 'application/json'];

const documentQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  storyId: z.string().trim().min(1).optional()
});

const documentParamsSchema = z.object({
  id: z.string().trim().min(1)
});

function getInlineMimeAllowlist(): string[] {
  const fromEnv = process.env.DOCUMENT_INLINE_MIME_ALLOWLIST;
  if (!fromEnv) {
    return DEFAULT_INLINE_MIME_ALLOWLIST;
  }

  const parsed = fromEnv
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);

  return parsed.length ? parsed : DEFAULT_INLINE_MIME_ALLOWLIST;
}

export function createDocumentRouter(deliveryRepository: DeliveryRepository): Router {
  const router = Router();

  router.get('/', validateRequest({ query: documentQuerySchema }), async (req, res, next) => {
    try {
      const query = req.query as unknown as z.infer<typeof documentQuerySchema>;
      const documents = await deliveryRepository.getDocuments({
        projectId: query.projectId,
        storyId: query.storyId
      });

      res.json({
        data: {
          items: documents.items,
          total: documents.total
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', validateRequest({ params: documentParamsSchema }), async (req, res, next) => {
    try {
      const documentId = String(req.params.id);
      const document = await deliveryRepository.getDocumentById(documentId);
      if (!document) {
        throw Object.assign(new Error(`Document ${documentId} not found`), {
          statusCode: 404,
          code: 'NOT_FOUND'
        });
      }

      res.json({ data: document });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id/content', validateRequest({ params: documentParamsSchema }), async (req, res, next) => {
    try {
      const documentId = String(req.params.id);
      const payload = await deliveryRepository.getDocumentContentById(documentId, getInlineMimeAllowlist());
      if (!payload) {
        throw Object.assign(new Error(`Document ${documentId} not found`), {
          statusCode: 404,
          code: 'NOT_FOUND'
        });
      }

      res.json({ data: payload });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
