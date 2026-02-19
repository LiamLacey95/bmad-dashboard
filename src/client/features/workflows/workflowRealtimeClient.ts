import type { ClientToServerMessage, ServerToClientMessage } from '../../../shared/workflows.js';
import { calculateReconnectDelayMs } from './liveState';

export interface WorkflowRealtimeClientOptions {
  wsUrl: string;
  heartbeatIntervalMs?: number;
  maxReconnectAttempts?: number;
  onOpen: () => void;
  onClose: () => void;
  onReconnectScheduled: (attempt: number, delayMs: number) => void;
  onMessage: (message: ServerToClientMessage) => void;
  getLastAckEventId: () => string | null;
}

export class WorkflowRealtimeClient {
  private socket: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private closedManually = false;

  constructor(private readonly options: WorkflowRealtimeClientOptions) {}

  connect(): void {
    this.closedManually = false;
    this.openSocket();
  }

  close(): void {
    this.closedManually = true;
    this.clearTimers();
    this.socket?.close();
    this.socket = null;
  }

  private openSocket(): void {
    this.socket = new WebSocket(this.options.wsUrl);

    this.socket.addEventListener('open', () => {
      this.reconnectAttempt = 0;
      this.options.onOpen();
      this.send({ type: 'auth' });
      this.send({ type: 'subscribe', topics: ['workflow', 'sync'] });
      this.send({ type: 'resync_request', lastAckEventId: this.options.getLastAckEventId() });
      this.startHeartbeat();
    });

    this.socket.addEventListener('message', (event) => {
      const payload = this.parseServerMessage(event.data);
      if (!payload) {
        return;
      }
      this.options.onMessage(payload);
    });

    this.socket.addEventListener('close', () => {
      this.stopHeartbeat();
      this.options.onClose();
      if (this.closedManually) {
        return;
      }
      this.scheduleReconnect();
    });

    this.socket.addEventListener('error', () => {
      this.socket?.close();
    });
  }

  private parseServerMessage(rawData: unknown): ServerToClientMessage | null {
    if (typeof rawData !== 'string') {
      return null;
    }

    try {
      return JSON.parse(rawData) as ServerToClientMessage;
    } catch {
      return null;
    }
  }

  private send(message: ClientToServerMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    const intervalMs = this.options.heartbeatIntervalMs ?? 15_000;
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'heartbeat', ts: new Date().toISOString() });
    }, intervalMs);
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) {
      return;
    }

    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private scheduleReconnect(): void {
    const maxReconnectAttempts = this.options.maxReconnectAttempts ?? 10;
    if (this.reconnectAttempt >= maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempt += 1;
    const delayMs = calculateReconnectDelayMs(this.reconnectAttempt);
    this.options.onReconnectScheduled(this.reconnectAttempt, delayMs);

    this.reconnectTimer = setTimeout(() => {
      this.openSocket();
    }, delayMs);
  }

  private clearTimers(): void {
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
