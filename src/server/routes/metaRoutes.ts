import { Router } from 'express';
import { z } from 'zod';
import type { StatusModelRepository } from '../dal/interfaces.js';
import { validateRequest } from '../middleware/validation.js';

const querySchema = z.object({
  includeTransitions: z.enum(['true', 'false']).optional()
});

export function createMetaRouter(statusRepository: StatusModelRepository): Router {
  const router = Router();

  router.get('/status-model', validateRequest({ query: querySchema }), async (req, res, next) => {
    try {
      const model = await statusRepository.getStatusModel();
      const includeTransitions = req.query.includeTransitions !== 'false';

      res.json({
        data: {
          statuses: model.statuses,
          allowedTransitions: includeTransitions ? model.allowedTransitions : undefined
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
