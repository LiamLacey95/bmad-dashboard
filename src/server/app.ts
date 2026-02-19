import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { InMemoryCostAnalyticsRepository } from './dal/inMemoryCostAnalyticsRepository.js';
import { InMemoryDeliveryRepository } from './dal/inMemoryDeliveryRepository.js';
import { InMemoryStatusModelRepository } from './dal/inMemoryStatusModelRepository.js';
import { InMemoryWorkflowRepository } from './dal/inMemoryWorkflowRepository.js';
import type { CostAnalyticsRepository, DeliveryRepository, WorkflowRepository } from './dal/interfaces.js';
import { authMiddlewarePlaceholder } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { observabilityMiddleware } from './middleware/observability.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { InMemoryWorkflowRealtimeHub } from './realtime/workflowRealtimeHub.js';
import { createAnalyticsRouter } from './routes/analyticsRoutes.js';
import { createCostRouter } from './routes/costRoutes.js';
import { createHealthRouter } from './routes/healthRoutes.js';
import { createKanbanRouter } from './routes/kanbanRoutes.js';
import { createMetaRouter } from './routes/metaRoutes.js';
import { createProjectRouter } from './routes/projectRoutes.js';
import { createStoryRouter } from './routes/storyRoutes.js';
import { createSyncRouter } from './routes/syncRoutes.js';
import { createWorkflowRouter } from './routes/workflowRoutes.js';
import { DeliveryConsistencyMonitor } from './services/consistencyMonitor.js';

export interface CreateAppDependencies {
  workflowRepository?: WorkflowRepository;
  deliveryRepository?: DeliveryRepository;
  costAnalyticsRepository?: CostAnalyticsRepository;
  workflowRealtimeHub?: InMemoryWorkflowRealtimeHub;
}

export function createApp(dependencies: CreateAppDependencies = {}) {
  const app = express();
  const statusModelRepository = new InMemoryStatusModelRepository();
  const workflowRepository = dependencies.workflowRepository ?? new InMemoryWorkflowRepository();
  const kanbanEditable = process.env.KANBAN_EDITABLE === 'true';
  const deliveryRepository =
    dependencies.deliveryRepository ?? new InMemoryDeliveryRepository(workflowRepository, kanbanEditable);
  const costAnalyticsRepository = dependencies.costAnalyticsRepository ?? new InMemoryCostAnalyticsRepository();
  const consistencyMonitor = new DeliveryConsistencyMonitor(deliveryRepository);
  const workflowRealtimeHub =
    dependencies.workflowRealtimeHub ?? new InMemoryWorkflowRealtimeHub(workflowRepository, consistencyMonitor);

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use(requestIdMiddleware);
  app.use(observabilityMiddleware);
  app.use(authMiddlewarePlaceholder);

  app.use('/api/v1/health', createHealthRouter());
  app.use('/api/v1/meta', createMetaRouter(statusModelRepository, costAnalyticsRepository));
  app.use('/api/v1/workflows', createWorkflowRouter(workflowRepository));
  app.use('/api/v1/projects', createProjectRouter(deliveryRepository));
  app.use('/api/v1/costs', createCostRouter(costAnalyticsRepository));
  app.use('/api/v1/analytics', createAnalyticsRouter(costAnalyticsRepository));
  app.use('/api/v1/kanban', createKanbanRouter(deliveryRepository));
  app.use('/api/v1/sync', createSyncRouter(consistencyMonitor));
  app.use('/api/v1/stories', createStoryRouter(deliveryRepository, workflowRealtimeHub, kanbanEditable));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
