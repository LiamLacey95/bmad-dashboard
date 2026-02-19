import { Router } from 'express';
import { z } from 'zod';
import { CANONICAL_STATUSES } from '../../shared/statusModel.js';
import type { DeliveryRepository } from '../dal/interfaces.js';
import { validateRequest } from '../middleware/validation.js';
import type { WorkflowRealtimeHub } from '../realtime/workflowRealtimeHub.js';

const storyParamsSchema = z.object({
  id: z.string().trim().min(1)
});

const patchStatusBodySchema = z.object({
  status: z.enum(CANONICAL_STATUSES),
  reason: z.string().trim().min(1).max(500).optional().nullable()
});

export function createStoryRouter(
  deliveryRepository: DeliveryRepository,
  workflowRealtimeHub: WorkflowRealtimeHub,
  enableKanbanEditing: boolean
): Router {
  const router = Router();

  router.patch(
    '/:id/status',
    validateRequest({ params: storyParamsSchema, body: patchStatusBodySchema }),
    async (req, res, next) => {
      try {
        if (!enableKanbanEditing) {
          throw Object.assign(
            new Error('Kanban editable mode is disabled. Story status transitions are read-only in MVP.'),
            {
              statusCode: 403,
              code: 'UNAUTHORIZED'
            }
          );
        }

        const storyId = String(req.params.id);
        const body = req.body as z.infer<typeof patchStatusBodySchema>;
        const result = await deliveryRepository.updateStoryStatus({
          storyId,
          toStatus: body.status,
          actorId: 'api-user',
          reason: body.reason ?? null,
          occurredAtUtc: new Date().toISOString()
        });

        await workflowRealtimeHub.publishStoryStatusChange(result);

        res.json({ data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
