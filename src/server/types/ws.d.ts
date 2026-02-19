declare module 'ws' {
  import { EventEmitter } from 'node:events';
  import type { Server } from 'node:http';

  export class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    readonly OPEN: number;
    readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    on(event: 'message', listener: (data: { toString(): string }) => void): this;
    on(event: 'close', listener: () => void): this;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options: { server: Server; path: string });
    on(event: 'connection', listener: (socket: WebSocket) => void): this;
    close(callback: (error?: Error) => void): void;
  }
}
