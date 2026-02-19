import { Router } from 'express';
import { z } from 'zod';
import type { CostWindowType } from '../../shared/costAnalytics.js';
import type { CostAnalyticsRepository } from '../dal/interfaces.js';
import { validateRequest } from '../middleware/validation.js';

const costWindowSchema = z.enum(['24h', '7d', '30d', 'custom']);

const costSummaryQuerySchema = z
  .object({
    window: costWindowSchema.optional().default('24h'),
    start: z.string().datetime({ offset: true }).optional(),
    end: z.string().datetime({ offset: true }).optional(),
    projectId: z.string().trim().min(1).optional()
  })
  .superRefine((value, ctx) => {
    if (value.window === 'custom') {
      if (!value.start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['start'],
          message: 'start is required when window=custom'
        });
      }
      if (!value.end) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['end'],
          message: 'end is required when window=custom'
        });
      }

      if (value.start && value.end && new Date(value.start).getTime() >= new Date(value.end).getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['end'],
          message: 'end must be after start'
        });
      }
    }
  });

const costTimeseriesQuerySchema = z
  .object({
    bucket: z.enum(['hour', 'day']).optional().default('day'),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    projectId: z.string().trim().min(1).optional()
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

function resolveWindow(window: CostWindowType, start?: string, end?: string): { start: string; end: string } {
  if (window === 'custom') {
    return {
      start: String(start),
      end: String(end)
    };
  }

  const endDate = new Date();
  const durationMsByWindow: Record<Exclude<CostWindowType, 'custom'>, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  };

  const durationMs = durationMsByWindow[window as Exclude<CostWindowType, 'custom'>];
  const startDate = new Date(endDate.getTime() - durationMs);

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString()
  };
}

export function createCostRouter(costAnalyticsRepository: CostAnalyticsRepository): Router {
  const router = Router();

  router.get('/summary', validateRequest({ query: costSummaryQuerySchema }), async (req, res, next) => {
    try {
      const query = req.query as unknown as z.infer<typeof costSummaryQuerySchema>;
      const windowBounds = resolveWindow(query.window, query.start, query.end);

      const data = await costAnalyticsRepository.getCostSummary({
        window: query.window,
        start: windowBounds.start,
        end: windowBounds.end,
        projectId: query.projectId
      });

      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.get('/timeseries', validateRequest({ query: costTimeseriesQuerySchema }), async (req, res, next) => {
    try {
      const query = req.query as unknown as z.infer<typeof costTimeseriesQuerySchema>;
      const data = await costAnalyticsRepository.getCostTimeseries({
        bucket: query.bucket,
        start: query.start,
        end: query.end,
        projectId: query.projectId
      });

      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
