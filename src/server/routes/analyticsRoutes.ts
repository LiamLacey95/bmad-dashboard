import { Router } from 'express';
import { z } from 'zod';
import type { CostAnalyticsRepository } from '../dal/interfaces.js';
import { validateRequest } from '../middleware/validation.js';

function csvListSchema(fieldName: string) {
  return z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean))
    .pipe(z.array(z.string().min(1)).min(1, `${fieldName} requires at least one value`));
}

const trendsQuerySchema = z
  .object({
    agentIds: csvListSchema('agentIds'),
    kpis: csvListSchema('kpis'),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true })
  })
  .superRefine((value, ctx) => {
    if (new Date(value.start).getTime() >= new Date(value.end).getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end'],
        message: 'end must be after start'
      });
    }
  });

const outliersQuerySchema = z
  .object({
    agentIds: csvListSchema('agentIds'),
    kpi: z.string().trim().min(1),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true })
  })
  .superRefine((value, ctx) => {
    if (new Date(value.start).getTime() >= new Date(value.end).getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end'],
        message: 'end must be after start'
      });
    }
  });

const lineageParamsSchema = z.object({
  lineageRef: z.string().trim().min(1)
});

export function createAnalyticsRouter(costAnalyticsRepository: CostAnalyticsRepository): Router {
  const router = Router();

  router.get('/agents/trends', validateRequest({ query: trendsQuerySchema }), async (req, res, next) => {
    try {
      const query = req.query as unknown as z.infer<typeof trendsQuerySchema>;
      const data = await costAnalyticsRepository.getAgentTrends(query);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.get('/agents/outliers', validateRequest({ query: outliersQuerySchema }), async (req, res, next) => {
    try {
      const query = req.query as unknown as z.infer<typeof outliersQuerySchema>;
      const data = await costAnalyticsRepository.getAgentOutliers(query);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.get('/lineage/:lineageRef', validateRequest({ params: lineageParamsSchema }), async (req, res, next) => {
    try {
      const lineageRef = String(req.params.lineageRef);
      const data = await costAnalyticsRepository.getLineageByRef(lineageRef);
      if (!data) {
        throw Object.assign(new Error(`Lineage ${lineageRef} not found`), {
          statusCode: 404,
          code: 'NOT_FOUND'
        });
      }

      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
