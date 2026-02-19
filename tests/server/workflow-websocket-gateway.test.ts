// @vitest-environment node
import type { Server } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryWorkflowRepository } from '../../src/server/dal/inMemoryWorkflowRepository.js';
import { metricsRegistry } from '../../src/server/observability/metrics.js';
import { createWorkflowWebSocketGateway } from '../../src/server/realtime/workflowWebSocketGateway.js';
import { InMemoryWorkflowRealtimeHub } from '../../src/server/realtime/workflowRealtimeHub.js';
import {
  createBadMessageError,
  createStaleState,
  createSyncStatus,
  createUnsupportedMessageTypeError,
  parseEventLatencyMs,
  safeParseMessage
} from '../../src/server/realtime/workflowWebSocketProtocol.js';
import type { ServerToClientMessage } from '../../src/shared/workflows.js';

type EventHandler = (...args: unknown[]) => void;

const wsMockState = vi.hoisted(() => ({
  latestWebSocketServer: null as null | {
    connect: (socket: MockSocket) => void;
  }
}));

class MockSocket {
  OPEN = 1;
  CLOSED = 3;
  readyState = this.OPEN;
  sentMessages: ServerToClientMessage[] = [];
  private handlers = new Map<string, EventHandler[]>();

  on(event: string, handler: EventHandler): void {
    const current = this.handlers.get(event) ?? [];
    current.push(handler);
    this.handlers.set(event, current);
  }

  send(rawPayload: string): void {
    this.sentMessages.push(JSON.parse(rawPayload) as ServerToClientMessage);
  }

  close(): void {
    this.readyState = this.CLOSED;
    this.emit('close');
  }

  emit(event: string, ...args: unknown[]): void {
    const listeners = this.handlers.get(event) ?? [];
    listeners.forEach((listener) => listener(...args));
  }

  receive(payload: unknown): void {
    this.emit('message', Buffer.from(JSON.stringify(payload)));
  }
}

vi.mock('ws', () => {
  class MockWebSocketServer {
    private connectionHandler: ((socket: MockSocket) => void) | null = null;

    constructor(_options: { server: Server; path: string }) {
      wsMockState.latestWebSocketServer = this;
    }

    on(event: string, handler: (socket: MockSocket) => void): void {
      if (event === 'connection') {
        this.connectionHandler = handler;
      }
    }

    connect(socket: MockSocket): void {
      this.connectionHandler?.(socket);
    }

    close(callback: (error?: Error) => void): void {
      callback();
    }
  }

  return {
    WebSocketServer: MockWebSocketServer
  };
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2_000,
  pollMs = 10
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting after ${timeoutMs}ms`);
    }
    await delay(pollMs);
  }
}

describe('workflow websocket protocol contracts', () => {
  it('parses valid client messages and rejects invalid JSON', () => {
    const valid = safeParseMessage(JSON.stringify({ type: 'subscribe', topics: ['workflow', 'sync'] }));
    const invalid = safeParseMessage('{bad-json');

    expect(valid?.type).toBe('subscribe');
    expect(invalid).toBeNull();
  });

  it('builds stale_state, sync_status, and error payloads', () => {
    const stale = createStaleState('workflow', true, null, 'awaiting_subscription');
    const syncing = createSyncStatus('workflow', 'syncing');
    const ok = createSyncStatus('workflow', 'ok');
    const badMessage = createBadMessageError();
    const unsupported = createUnsupportedMessageTypeError('unknown');

    expect(stale.type).toBe('stale_state');
    expect(stale.reason).toBe('awaiting_subscription');
    expect(syncing.type).toBe('sync_status');
    expect(syncing.status).toBe('syncing');
    expect(ok.lastSuccessfulSyncAt).toMatch(/Z$/);
    expect(badMessage.code).toBe('BAD_MESSAGE');
    expect(unsupported.code).toBe('UNSUPPORTED_MESSAGE_TYPE');
  });

  it('produces snapshot and event contracts from the realtime hub', async () => {
    const repository = new InMemoryWorkflowRepository();
    const hub = new InMemoryWorkflowRealtimeHub(repository);

    const snapshot = await hub.getSnapshotMessage('workflow');
    expect(snapshot.type).toBe('snapshot');
    if (snapshot.type === 'snapshot' && snapshot.module === 'workflow') {
      expect(snapshot.data.workflows.length).toBeGreaterThan(0);
    }

    await hub.publishTransition({
      workflowId: 'wf-1001',
      toStatus: 'blocked',
      actorId: 'tester',
      reason: 'dependency'
    });

    const replay = hub.getMessagesAfter(null);
    expect(replay.length).toBeGreaterThan(0);
    const event = replay.find((message) => message.type === 'event');
    expect(event?.type).toBe('event');
  });

  it('records event latency and reconnect counters in metrics registry', () => {
    metricsRegistry.reset();

    const eventLikeMessage = {
      type: 'event',
      eventId: 'evt-1',
      module: 'workflow',
      entityType: 'workflow',
      entityId: 'wf-1',
      eventType: 'workflow_transition',
      occurredAt: new Date(Date.now() - 250).toISOString(),
      payload: {
        workflow: {
          id: 'wf-1',
          name: 'Workflow',
          ownerId: 'owner',
          status: 'blocked',
          lastTransitionAt: new Date().toISOString()
        },
        transition: {
          id: 'wt-1',
          workflowId: 'wf-1',
          fromStatus: 'in_progress',
          toStatus: 'blocked',
          occurredAtUtc: new Date().toISOString(),
          actorId: 'owner',
          reason: 'dependency'
        }
      },
      lineageRef: 'workflow-transition:wt-1'
    } as const;

    const latency = parseEventLatencyMs(eventLikeMessage);
    expect(latency).not.toBeNull();
    if (latency !== null) {
      metricsRegistry.observeEventToUiLatency(latency);
    }
    metricsRegistry.incrementWebsocketReconnectAttempts();

    expect(metricsRegistry.getEventToUiLatencyMs().length).toBe(1);
    expect(metricsRegistry.getWebsocketReconnectAttemptsTotal()).toBe(1);
  });

  it('replays missed workflow events after reconnect resync_request', async () => {
    metricsRegistry.reset();

    const repository = new InMemoryWorkflowRepository();
    const hub = new InMemoryWorkflowRealtimeHub(repository);
    const gateway = createWorkflowWebSocketGateway({} as Server, hub);
    const gatewayServer = wsMockState.latestWebSocketServer;
    expect(gatewayServer).not.toBeNull();

    const firstClient = new MockSocket();
    const secondClient = new MockSocket();
    gatewayServer?.connect(firstClient);

    try {
      firstClient.receive({ type: 'subscribe', topics: ['workflow'] });
      await waitFor(
        () =>
          firstClient.sentMessages.some(
            (message) =>
              message.type === 'sync_status' && message.module === 'workflow' && message.status === 'ok'
          )
      );

      await hub.publishTransition({
        workflowId: 'wf-1001',
        toStatus: 'blocked',
        actorId: 'qa',
        reason: 'integration_test'
      });

      await waitFor(
        () => firstClient.sentMessages.some((message) => message.type === 'event' && message.module === 'workflow')
      );

      const firstEvent = firstClient.sentMessages.find(
        (message): message is Extract<ServerToClientMessage, { type: 'event' }> =>
          message.type === 'event' && message.module === 'workflow'
      );
      expect(firstEvent).toBeDefined();

      firstClient.close();

      await hub.publishTransition({
        workflowId: 'wf-1001',
        toStatus: 'in_progress',
        actorId: 'qa',
        reason: 'integration_test_replay'
      });

      const replayCandidates = hub
        .getMessagesAfter(firstEvent?.eventId ?? null)
        .filter(
          (message): message is Extract<ServerToClientMessage, { type: 'event' }> =>
            message.type === 'event' && message.module === 'workflow'
        );
      expect(replayCandidates).toHaveLength(1);
      const expectedReplayEventId = replayCandidates[0].eventId;

      gatewayServer?.connect(secondClient);
      secondClient.receive({ type: 'subscribe', topics: ['workflow'] });
      await waitFor(
        () =>
          secondClient.sentMessages.some(
            (message) =>
              message.type === 'sync_status' && message.module === 'workflow' && message.status === 'ok'
          )
      );

      const preResyncEventCount = secondClient.sentMessages.filter(
        (message) => message.type === 'event' && message.module === 'workflow'
      ).length;
      expect(preResyncEventCount).toBe(0);

      secondClient.receive({
        type: 'resync_request',
        lastAckEventId: firstEvent?.eventId ?? null
      });

      await waitFor(
        () =>
          secondClient.sentMessages.some(
            (message) =>
              message.type === 'event' &&
              message.module === 'workflow' &&
              message.eventId === expectedReplayEventId
          )
      );

      const replayedEvents = secondClient.sentMessages.filter(
        (message) =>
          message.type === 'event' &&
          message.module === 'workflow' &&
          message.eventId === expectedReplayEventId
      );
      expect(replayedEvents).toHaveLength(1);
      expect(metricsRegistry.getWebsocketReconnectAttemptsTotal()).toBe(1);
    } finally {
      secondClient.close();
      if (firstClient.readyState !== firstClient.CLOSED) {
        firstClient.close();
      }
      await gateway.close();
    }
  });
});
