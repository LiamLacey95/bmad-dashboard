import { Router } from 'express';
import { z } from 'zod';
import type { DeliveryRepository } from '../dal/interfaces.js';
import { validateRequest } from '../middleware/validation.js';

const kanbanQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional()
});

export function createKanbanRouter(deliveryRepository: DeliveryRepository): Router {
  const router = Router();

  router.get('/board', validateRequest({ query: kanbanQuerySchema }), async (req, res, next) => {
    try {
      const query = req.query as unknown as z.infer<typeof kanbanQuerySchema>;
      const board = await deliveryRepository.getKanbanBoard(query.projectId);
      res.json({ data: board });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
