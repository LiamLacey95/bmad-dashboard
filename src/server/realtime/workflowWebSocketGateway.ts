import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { SYNC_MODULE } from '../../shared/delivery.js';
import {
  WORKFLOW_MODULE,
  type ClientToServerMessage,
  type RealtimeModule,
  type ServerToClientMessage
} from '../../shared/workflows.js';
import type { WorkflowRealtimeHub } from './workflowRealtimeHub.js';
import { metricsRegistry } from '../observability/metrics.js';

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 2;

interface Session {
  socket: WebSocket;
  topics: Set<RealtimeModule>;
  staleTopics: Set<RealtimeModule>;
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

function isValidTopic(topic: string): topic is RealtimeModule {
  return topic === WORKFLOW_MODULE || topic === 'story' || topic === 'project' || topic === SYNC_MODULE;
}

function sendSyncStatus(socket: WebSocket, module: RealtimeModule, status: 'ok' | 'syncing' | 'error'): void {
  sendMessage(socket, {
    type: 'sync_status',
    module,
    status,
    lastSuccessfulSyncAt: status === 'ok' ? new Date().toISOString() : null,
    error: null
  });
}

function updateStaleSessionsRatio(sessions: Map<WebSocket, Session>): void {
  const total = sessions.size;
  if (!total) {
    metricsRegistry.setStaleStateActiveSessionsRatio(0);
    return;
  }
  let staleCount = 0;
  sessions.forEach((session) => {
    if (session.staleTopics.size > 0) {
      staleCount += 1;
    }
  });
  metricsRegistry.setStaleStateActiveSessionsRatio(staleCount / total);
}

export function createWorkflowWebSocketGateway(server: Server, hub: WorkflowRealtimeHub) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const sessions = new Map<WebSocket, Session>();

  const unsubscribeFromHub = hub.onMessage((message) => {
    if (message.type !== 'event') {
      return;
    }

    sessions.forEach((session) => {
      if (!session.topics.has(message.module)) {
        return;
      }

      session.lastAckEventId = message.eventId;
      session.lastSuccessfulUpdateAt = message.occurredAt;
      session.staleTopics.delete(message.module);
      updateStaleSessionsRatio(sessions);

      sendMessage(session.socket, message);
      sendMessage(session.socket, {
        type: 'stale_state',
        module: message.module,
        isStale: false,
        lastSuccessfulUpdateAt: message.occurredAt,
        reason: 'fresh_event_received'
      });
    });
  });

  const heartbeatTicker = setInterval(() => {
    const now = Date.now();
    sessions.forEach((session, socket) => {
      if (now - session.lastHeartbeatAt <= HEARTBEAT_TIMEOUT_MS) {
        return;
      }

      session.topics.forEach((topic) => {
        session.staleTopics.add(topic);
        sendMessage(socket, {
          type: 'stale_state',
          module: topic,
          isStale: true,
          lastSuccessfulUpdateAt: session.lastSuccessfulUpdateAt,
          reason: 'heartbeat_timeout'
        });
      });
      updateStaleSessionsRatio(sessions);

      socket.close(4000, 'heartbeat_timeout');
      sessions.delete(socket);
    });
  }, 1_000);

  wss.on('connection', (socket) => {
    const session: Session = {
      socket,
      topics: new Set(),
      staleTopics: new Set([WORKFLOW_MODULE]),
      lastHeartbeatAt: Date.now(),
      lastAckEventId: null,
      lastSuccessfulUpdateAt: null
    };
    sessions.set(socket, session);
    updateStaleSessionsRatio(sessions);

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
          recoverable: true,
          requestId: null,
          timestampUtc: new Date().toISOString(),
          context: {
            action: 'send_valid_json'
          }
        });
        return;
      }

      if (parsed.type === 'heartbeat') {
        session.lastHeartbeatAt = Date.now();
        return;
      }

      if (parsed.type === 'subscribe') {
        session.topics = new Set(parsed.topics.filter(isValidTopic));
        session.staleTopics = new Set(session.topics);
        updateStaleSessionsRatio(sessions);

        await Promise.all(
          [...session.topics].map(async (topic) => {
            sendSyncStatus(socket, topic, 'syncing');

            if (topic === WORKFLOW_MODULE) {
              const snapshot = await hub.getSnapshotMessage('workflow');
              sendMessage(socket, snapshot);
            }

            if (topic === SYNC_MODULE) {
              const syncSnapshot = await hub.getSnapshotMessage('sync');
              sendMessage(socket, syncSnapshot);
            }

            sendSyncStatus(socket, topic, 'ok');
            session.staleTopics.delete(topic);
            updateStaleSessionsRatio(sessions);
          })
        );

        return;
      }

      if (parsed.type === 'resync_request') {
        session.lastAckEventId = parsed.lastAckEventId;

        await Promise.all(
          [...session.topics].map(async (topic) => {
            sendSyncStatus(socket, topic, 'syncing');

            if (topic === WORKFLOW_MODULE || topic === 'story') {
              const replayMessages = hub
                .getMessagesAfter(parsed.lastAckEventId)
                .filter((message) => message.type === 'event' && message.module === topic);

              if (!replayMessages.length && topic === WORKFLOW_MODULE) {
                const snapshot = await hub.getSnapshotMessage('workflow');
                sendMessage(socket, snapshot);
              }

              replayMessages.forEach((message) => sendMessage(socket, message));
            }

            if (topic === SYNC_MODULE) {
              const syncSnapshot = await hub.getSnapshotMessage('sync');
              sendMessage(socket, syncSnapshot);
            }

            sendSyncStatus(socket, topic, 'ok');
          })
        );

        return;
      }

      if (parsed.type === 'auth') {
        return;
      }

      sendMessage(socket, {
        type: 'error',
        code: 'UNSUPPORTED_MESSAGE_TYPE',
        message: `Unsupported message type ${(parsed as { type: string }).type}`,
        recoverable: true,
        requestId: null,
        timestampUtc: new Date().toISOString(),
        context: {
          action: 'send_supported_type'
        }
      });
    });

    socket.on('close', () => {
      sessions.delete(socket);
      updateStaleSessionsRatio(sessions);
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
