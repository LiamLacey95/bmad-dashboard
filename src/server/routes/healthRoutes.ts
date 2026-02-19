import { Router } from 'express';
import { validateRequest } from '../middleware/validation.js';

export function createHealthRouter(): Router {
  const router = Router();

  router.get('/', validateRequest({}), (_req, res) => {
    res.json({
      data: {
        service: 'bmad-dashboard-api',
        status: 'ok',
        checks: {
          api: 'up',
          db: 'not_configured',
          websocket: 'not_configured'
        },
        timestamp: new Date().toISOString()
      }
    });
  });

  return router;
}
