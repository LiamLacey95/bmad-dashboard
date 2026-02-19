import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CostAnalyticsRepository, DeliveryRepository, WorkflowRepository } from '../interfaces.js';
import { createSqliteContext } from './database.js';
import { applySqliteMigrations } from './migrations.js';
import { seedSqliteDemoData } from './seed.js';
import { SqliteCostAnalyticsRepository } from './sqliteCostAnalyticsRepository.js';
import { SqliteDeliveryRepository } from './sqliteDeliveryRepository.js';
import { SqliteWorkflowRepository } from './sqliteWorkflowRepository.js';

export interface SqliteRepositoryBundle {
  workflowRepository: WorkflowRepository;
  deliveryRepository: DeliveryRepository;
  costAnalyticsRepository: CostAnalyticsRepository;
  close: () => void;
}

export function createSqliteRepositoryBundle(filePath: string, kanbanEditable: boolean): SqliteRepositoryBundle {
  mkdirSync(dirname(filePath), { recursive: true });

  const context = createSqliteContext(filePath);
  applySqliteMigrations(context.db);
  seedSqliteDemoData(context.db);

  const workflowRepository = new SqliteWorkflowRepository(context.db);
  const deliveryRepository = new SqliteDeliveryRepository(context.db, workflowRepository, kanbanEditable);
  const costAnalyticsRepository = new SqliteCostAnalyticsRepository(context.db);

  return {
    workflowRepository,
    deliveryRepository,
    costAnalyticsRepository,
    close: context.close
  };
}
