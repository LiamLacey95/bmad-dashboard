import { createServer } from 'node:http';
import { createApp } from './app.js';
import { InMemoryDeliveryRepository } from './dal/inMemoryDeliveryRepository.js';
import { InMemoryWorkflowRepository } from './dal/inMemoryWorkflowRepository.js';
import { createSqliteRepositoryBundle } from './dal/sqlite/createSqliteRepositories.js';
import { InMemoryWorkflowRealtimeHub } from './realtime/workflowRealtimeHub.js';
import { startWorkflowTransitionSimulator } from './realtime/workflowTransitionSimulator.js';
import { createWorkflowWebSocketGateway } from './realtime/workflowWebSocketGateway.js';
import { DeliveryConsistencyMonitor } from './services/consistencyMonitor.js';
import { createSqliteContext } from './dal/sqlite/database.js';
import { ProjectionJobs } from './services/projectionJobs.js';
import { applySqliteMigrations } from './dal/sqlite/migrations.js';
import { seedSqliteDemoData } from './dal/sqlite/seed.js';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';
const kanbanEditable = process.env.KANBAN_EDITABLE === 'true';
const persistenceBackend = process.env.PERSISTENCE_BACKEND ?? 'memory';
const sqlitePath = process.env.SQLITE_PATH ?? '/tmp/bmad-dashboard.sqlite';

const sqliteBundle =
  persistenceBackend === 'sqlite' ? createSqliteRepositoryBundle(sqlitePath, kanbanEditable) : null;
const workflowRepository = sqliteBundle?.workflowRepository ?? new InMemoryWorkflowRepository();
const deliveryRepository = sqliteBundle?.deliveryRepository ?? new InMemoryDeliveryRepository(workflowRepository, kanbanEditable);
const costAnalyticsRepository = sqliteBundle?.costAnalyticsRepository;
const consistencyMonitor = new DeliveryConsistencyMonitor(deliveryRepository);
const workflowHub = new InMemoryWorkflowRealtimeHub(workflowRepository, consistencyMonitor);
const app = createApp({
  workflowRepository,
  deliveryRepository,
  costAnalyticsRepository,
  workflowRealtimeHub: workflowHub
});
const server = createServer(app);
const websocketGateway = createWorkflowWebSocketGateway(server, workflowHub);
const stopSimulation = startWorkflowTransitionSimulator(workflowHub, deliveryRepository);

const projectionContext = persistenceBackend === 'sqlite' ? createSqliteContext(sqlitePath) : null;
if (projectionContext) {
  applySqliteMigrations(projectionContext.db);
  seedSqliteDemoData(projectionContext.db);
}
const projectionJobs = projectionContext ? new ProjectionJobs(projectionContext.db) : null;
projectionJobs?.runAll();
const projectionInterval = projectionJobs
  ? setInterval(() => {
      try {
        projectionJobs.runAll();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown projection job error';
        projectionJobs.markSyncFailure('sync', message);
      }
    }, 15_000)
  : null;

server.listen(port, host, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: `API listening on http://${host}:${port}`,
      ws: '/ws',
      persistenceBackend
    })
  );
});

process.on('SIGTERM', async () => {
  if (projectionInterval) {
    clearInterval(projectionInterval);
  }
  stopSimulation();
  await websocketGateway.close();
  projectionContext?.close();
  sqliteBundle?.close();
  server.close();
});
