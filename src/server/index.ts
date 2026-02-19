import { createServer } from 'node:http';
import { createApp } from './app.js';
import { InMemoryDeliveryRepository } from './dal/inMemoryDeliveryRepository.js';
import { InMemoryWorkflowRepository } from './dal/inMemoryWorkflowRepository.js';
import { InMemoryWorkflowRealtimeHub } from './realtime/workflowRealtimeHub.js';
import { startWorkflowTransitionSimulator } from './realtime/workflowTransitionSimulator.js';
import { createWorkflowWebSocketGateway } from './realtime/workflowWebSocketGateway.js';
import { DeliveryConsistencyMonitor } from './services/consistencyMonitor.js';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';
const kanbanEditable = process.env.KANBAN_EDITABLE === 'true';
const workflowRepository = new InMemoryWorkflowRepository();
const deliveryRepository = new InMemoryDeliveryRepository(workflowRepository, kanbanEditable);
const consistencyMonitor = new DeliveryConsistencyMonitor(deliveryRepository);
const workflowHub = new InMemoryWorkflowRealtimeHub(workflowRepository, consistencyMonitor);
const app = createApp({ workflowRepository, deliveryRepository, workflowRealtimeHub: workflowHub });
const server = createServer(app);
const websocketGateway = createWorkflowWebSocketGateway(server, workflowHub);
const stopSimulation = startWorkflowTransitionSimulator(workflowHub, deliveryRepository);

server.listen(port, host, () => {
  console.log(JSON.stringify({ level: 'info', message: `API listening on http://${host}:${port}`, ws: '/ws' }));
});

process.on('SIGTERM', async () => {
  stopSimulation();
  await websocketGateway.close();
  server.close();
});
