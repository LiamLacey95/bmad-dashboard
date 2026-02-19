import { Router } from 'express';
import { z } from 'zod';
import { CANONICAL_STATUSES } from '../../shared/statusModel.js';
import type { DeliveryRepository } from '../dal/interfaces.js';
import { validateRequest } from '../middleware/validation.js';

const statusSchema = z.enum(CANONICAL_STATUSES);

const projectListQuerySchema = z.object({
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
  riskFlag: z.coerce.boolean().optional(),
  overdue: z.coerce.boolean().optional()
});

const projectParamsSchema = z.object({
  id: z.string().trim().min(1)
});

export function createProjectRouter(deliveryRepository: DeliveryRepository): Router {
  const router = Router();

  router.get('/', validateRequest({ query: projectListQuerySchema }), async (req, res, next) => {
    try {
      const query = req.query as unknown as z.infer<typeof projectListQuerySchema>;
      const projects = await deliveryRepository.getProjects({
        statuses: query.status,
        ownerId: query.ownerId,
        riskFlag: query.riskFlag,
        overdue: query.overdue
      });

      res.json({
        data: {
          items: projects.items,
          total: projects.total
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', validateRequest({ params: projectParamsSchema }), async (req, res, next) => {
    try {
      const projectId = String(req.params.id);
      const project = await deliveryRepository.getProjectById(projectId);
      if (!project) {
        throw Object.assign(new Error(`Project ${projectId} not found`), {
          statusCode: 404,
          code: 'NOT_FOUND'
        });
      }

      res.json({ data: project });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id/context', validateRequest({ params: projectParamsSchema }), async (req, res, next) => {
    try {
      const projectId = String(req.params.id);
      const context = await deliveryRepository.getProjectContext(projectId);
      if (!context) {
        throw Object.assign(new Error(`Project ${projectId} not found`), {
          statusCode: 404,
          code: 'NOT_FOUND'
        });
      }

      res.json({ data: context });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
