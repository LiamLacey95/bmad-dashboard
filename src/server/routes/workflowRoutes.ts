import { Router } from 'express';
import { z } from 'zod';
import { CANONICAL_STATUSES } from '../../shared/statusModel.js';
import type { WorkflowRepository } from '../dal/interfaces.js';
import { validateRequest } from '../middleware/validation.js';

const statusSchema = z.enum(CANONICAL_STATUSES);

const workflowListQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((segment) => segment.trim())
            .filter(Boolean)
        : []
    )
    .pipe(z.array(statusSchema)),
  ownerId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(50)
});

const workflowParamsSchema = z.object({
  id: z.string().trim().min(1)
});

const transitionQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(250).optional().default(100)
});

export function createWorkflowRouter(workflowRepository: WorkflowRepository): Router {
  const router = Router();

  router.get('/', validateRequest({ query: workflowListQuerySchema }), async (req, res, next) => {
    try {
      const query = req.query as unknown as z.infer<typeof workflowListQuerySchema>;
      const result = await workflowRepository.getWorkflows({
        statuses: query.status,
        ownerId: query.ownerId,
        projectId: query.projectId,
        page: query.page,
        pageSize: query.pageSize
      });

      res.json({
        data: {
          items: result.items,
          total: result.total,
          page: query.page,
          pageSize: query.pageSize
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', validateRequest({ params: workflowParamsSchema }), async (req, res, next) => {
    try {
      const workflowId = String(req.params.id);
      const workflow = await workflowRepository.getWorkflowById(workflowId);
      if (!workflow) {
        const error = new Error(`Workflow ${workflowId} not found`) as Error & {
          statusCode: number;
          code: string;
        };
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        throw error;
      }

      res.json({ data: workflow });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    '/:id/transitions',
    validateRequest({ params: workflowParamsSchema, query: transitionQuerySchema }),
    async (req, res, next) => {
      try {
        const workflowId = String(req.params.id);
        const workflow = await workflowRepository.getWorkflowById(workflowId);
        if (!workflow) {
          const error = new Error(`Workflow ${workflowId} not found`) as Error & {
            statusCode: number;
            code: string;
          };
          error.statusCode = 404;
          error.code = 'NOT_FOUND';
          throw error;
        }

        const query = req.query as unknown as z.infer<typeof transitionQuerySchema>;
        const items = await workflowRepository.getWorkflowTransitions(workflowId, query.limit);

        res.json({ data: { items, workflowId } });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
