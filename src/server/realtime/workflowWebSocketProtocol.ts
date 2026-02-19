import {
  type ClientToServerMessage,
  type RealtimeModule,
  type ServerToClientMessage,
  type WsErrorMessage,
  type WsStaleStateMessage,
  type WsSyncStatusMessage
} from '../../shared/workflows.js';

export function safeParseMessage(raw: string): ClientToServerMessage | null {
  try {
    return JSON.parse(raw) as ClientToServerMessage;
  } catch {
    return null;
  }
}

export function parseEventLatencyMs(message: ServerToClientMessage): number | null {
  if (message.type !== 'event') {
    return null;
  }

  const occurredAtMs = Date.parse(message.occurredAt);
  if (Number.isNaN(occurredAtMs)) {
    return null;
  }

  return Math.max(0, Date.now() - occurredAtMs);
}

export function createSyncStatus(
  module: RealtimeModule,
  status: 'ok' | 'syncing' | 'error'
): WsSyncStatusMessage {
  return {
    type: 'sync_status',
    module,
    status,
    lastSuccessfulSyncAt: status === 'ok' ? new Date().toISOString() : null,
    error: null
  };
}

export function createStaleState(
  module: RealtimeModule,
  isStale: boolean,
  lastSuccessfulUpdateAt: string | null,
  reason: string
): WsStaleStateMessage {
  return {
    type: 'stale_state',
    module,
    isStale,
    lastSuccessfulUpdateAt,
    reason
  };
}

export function createBadMessageError(): WsErrorMessage {
  return {
    type: 'error',
    code: 'BAD_MESSAGE',
    message: 'Message payload is not valid JSON',
    recoverable: true,
    requestId: null,
    timestampUtc: new Date().toISOString(),
    context: {
      action: 'send_valid_json'
    }
  };
}

export function createUnsupportedMessageTypeError(messageType: string): WsErrorMessage {
  return {
    type: 'error',
    code: 'UNSUPPORTED_MESSAGE_TYPE',
    message: `Unsupported message type ${messageType}`,
    recoverable: true,
    requestId: null,
    timestampUtc: new Date().toISOString(),
    context: {
      action: 'send_supported_type'
    }
  };
}
