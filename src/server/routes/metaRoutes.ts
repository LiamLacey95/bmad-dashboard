import { Router } from 'express';
import { z } from 'zod';
import type { CostAnalyticsRepository, StatusModelRepository } from '../dal/interfaces.js';
import { validateRequest } from '../middleware/validation.js';

const querySchema = z.object({
  includeTransitions: z.enum(['true', 'false']).optional()
});

export function createMetaRouter(
  statusRepository: StatusModelRepository,
  costAnalyticsRepository?: Pick<CostAnalyticsRepository, 'getKpis'>
): Router {
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

  router.get('/kpis', validateRequest({}), async (_req, res, next) => {
    try {
      const data = costAnalyticsRepository ? await costAnalyticsRepository.getKpis() : [];
      res.json({ data: { items: data, total: data.length } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
