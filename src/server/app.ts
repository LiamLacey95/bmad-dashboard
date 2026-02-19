import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { InMemoryStatusModelRepository } from './dal/inMemoryStatusModelRepository.js';
import { InMemoryWorkflowRepository } from './dal/inMemoryWorkflowRepository.js';
import type { WorkflowRepository } from './dal/interfaces.js';
import { authMiddlewarePlaceholder } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { observabilityMiddleware } from './middleware/observability.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { createHealthRouter } from './routes/healthRoutes.js';
import { createMetaRouter } from './routes/metaRoutes.js';
import { createWorkflowRouter } from './routes/workflowRoutes.js';

export interface CreateAppDependencies {
  workflowRepository?: WorkflowRepository;
}

export function createApp(dependencies: CreateAppDependencies = {}) {
  const app = express();
  const statusModelRepository = new InMemoryStatusModelRepository();
  const workflowRepository = dependencies.workflowRepository ?? new InMemoryWorkflowRepository();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use(requestIdMiddleware);
  app.use(observabilityMiddleware);
  app.use(authMiddlewarePlaceholder);

  app.use('/api/v1/health', createHealthRouter());
  app.use('/api/v1/meta', createMetaRouter(statusModelRepository));
  app.use('/api/v1/workflows', createWorkflowRouter(workflowRepository));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
