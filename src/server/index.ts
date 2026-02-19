import { createServer } from 'node:http';
import { createApp } from './app.js';
import { InMemoryWorkflowRepository } from './dal/inMemoryWorkflowRepository.js';
import { InMemoryWorkflowRealtimeHub } from './realtime/workflowRealtimeHub.js';
import { startWorkflowTransitionSimulator } from './realtime/workflowTransitionSimulator.js';
import { createWorkflowWebSocketGateway } from './realtime/workflowWebSocketGateway.js';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';
const workflowRepository = new InMemoryWorkflowRepository();
const app = createApp({ workflowRepository });
const server = createServer(app);
const workflowHub = new InMemoryWorkflowRealtimeHub(workflowRepository);
const websocketGateway = createWorkflowWebSocketGateway(server, workflowHub);
const stopSimulation = startWorkflowTransitionSimulator(workflowHub);

server.listen(port, host, () => {
  console.log(JSON.stringify({ level: 'info', message: `API listening on http://${host}:${port}`, ws: '/ws' }));
});

process.on('SIGTERM', async () => {
  stopSimulation();
  await websocketGateway.close();
  server.close();
});
