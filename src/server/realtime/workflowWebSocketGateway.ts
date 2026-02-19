import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { WORKFLOW_MODULE, type ClientToServerMessage, type ServerToClientMessage } from '../../shared/workflows.js';
import type { WorkflowRealtimeHub } from './workflowRealtimeHub.js';

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 2;

interface Session {
  socket: WebSocket;
  subscribedToWorkflow: boolean;
  lastHeartbeatAt: number;
  lastAckEventId: string | null;
  lastSuccessfulUpdateAt: string | null;
}

function safeParseMessage(raw: string): ClientToServerMessage | null {
  try {
    return JSON.parse(raw) as ClientToServerMessage;
  } catch {
    return null;
  }
}

function sendMessage(socket: WebSocket, payload: ServerToClientMessage): void {
  if (socket.readyState !== socket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(payload));
}

export function createWorkflowWebSocketGateway(server: Server, hub: WorkflowRealtimeHub) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const sessions = new Map<WebSocket, Session>();

  const unsubscribeFromHub = hub.onMessage((message) => {
    if (message.type === 'event') {
      sessions.forEach((session) => {
        if (!session.subscribedToWorkflow) {
          return;
        }

        session.lastAckEventId = message.eventId;
        session.lastSuccessfulUpdateAt = message.occurredAt;

        sendMessage(session.socket, message);
        sendMessage(session.socket, {
          type: 'stale_state',
          module: WORKFLOW_MODULE,
          isStale: false,
          lastSuccessfulUpdateAt: message.occurredAt,
          reason: 'fresh_event_received'
        });
      });
    }
  });

  const heartbeatTicker = setInterval(() => {
    const now = Date.now();
    sessions.forEach((session, socket) => {
      if (now - session.lastHeartbeatAt <= HEARTBEAT_TIMEOUT_MS) {
        return;
      }

      sendMessage(socket, {
        type: 'stale_state',
        module: WORKFLOW_MODULE,
        isStale: true,
        lastSuccessfulUpdateAt: session.lastSuccessfulUpdateAt,
        reason: 'heartbeat_timeout'
      });

      socket.close(4000, 'heartbeat_timeout');
      sessions.delete(socket);
    });
  }, 1_000);

  wss.on('connection', (socket) => {
    const session: Session = {
      socket,
      subscribedToWorkflow: false,
      lastHeartbeatAt: Date.now(),
      lastAckEventId: null,
      lastSuccessfulUpdateAt: null
    };
    sessions.set(socket, session);

    sendMessage(socket, {
      type: 'stale_state',
      module: WORKFLOW_MODULE,
      isStale: true,
      lastSuccessfulUpdateAt: null,
      reason: 'awaiting_subscription'
    });

    socket.on('message', async (rawMessage) => {
      const parsed = safeParseMessage(rawMessage.toString());
      if (!parsed) {
        sendMessage(socket, {
          type: 'error',
          code: 'BAD_MESSAGE',
          message: 'Message payload is not valid JSON',
          recoverable: true
        });
        return;
      }

      if (parsed.type === 'heartbeat') {
        session.lastHeartbeatAt = Date.now();
        return;
      }

      if (parsed.type === 'subscribe') {
        session.subscribedToWorkflow = parsed.topics.includes(WORKFLOW_MODULE);
        if (!session.subscribedToWorkflow) {
          return;
        }

        sendMessage(socket, {
          type: 'sync_status',
          module: WORKFLOW_MODULE,
          status: 'syncing',
          lastSuccessfulSyncAt: null,
          error: null
        });

        const snapshot = await hub.getSnapshotMessage();
        sendMessage(socket, snapshot);

        const syncAt = new Date().toISOString();
        sendMessage(socket, {
          type: 'sync_status',
          module: WORKFLOW_MODULE,
          status: 'ok',
          lastSuccessfulSyncAt: syncAt,
          error: null
        });

        return;
      }

      if (parsed.type === 'resync_request') {
        session.lastAckEventId = parsed.lastAckEventId;

        sendMessage(socket, {
          type: 'sync_status',
          module: WORKFLOW_MODULE,
          status: 'syncing',
          lastSuccessfulSyncAt: null,
          error: null
        });

        const replayMessages = hub.getMessagesAfter(parsed.lastAckEventId);
        if (!replayMessages.length) {
          const snapshot = await hub.getSnapshotMessage();
          sendMessage(socket, snapshot);
        } else {
          replayMessages.forEach((message) => sendMessage(socket, message));
        }

        const syncAt = new Date().toISOString();
        sendMessage(socket, {
          type: 'sync_status',
          module: WORKFLOW_MODULE,
          status: 'ok',
          lastSuccessfulSyncAt: syncAt,
          error: null
        });
        return;
      }

      if (parsed.type === 'auth') {
        return;
      }

      sendMessage(socket, {
        type: 'error',
        code: 'UNSUPPORTED_MESSAGE_TYPE',
        message: `Unsupported message type ${(parsed as { type: string }).type}`,
        recoverable: true
      });
    });

    socket.on('close', () => {
      sessions.delete(socket);
    });
  });

  return {
    close: async (): Promise<void> => {
      clearInterval(heartbeatTicker);
      unsubscribeFromHub();
      await new Promise<void>((resolve, reject) => {
        wss.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}
