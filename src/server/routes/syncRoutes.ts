import { Router } from 'express';
import type { ConsistencyMonitor } from '../dal/interfaces.js';

export function createSyncRouter(consistencyMonitor: ConsistencyMonitor): Router {
  const router = Router();

  router.get('/status', async (_req, res, next) => {
    try {
      const payload = await consistencyMonitor.checkConsistency();
      res.json({ data: payload });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
