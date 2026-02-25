declare module "ws" {
  import { EventEmitter } from "events";
  type Data = string | Buffer | ArrayBuffer | Buffer[];

  interface WebSocketServerOptions {
    noServer?: boolean;
    port?: number;
  }

  class WebSocket extends EventEmitter {
    static readonly CONNECTING: number;
    static readonly OPEN: number;
    static readonly CLOSING: number;
    static readonly CLOSED: number;
    constructor(url: string, protocols?: string | string[]);
    readyState: number;
    url: string;
    protocol: string;
    send(data: Data): void;
    close(code?: number, reason?: string): void;
    ping(): void;
    on(event: "message", cb: (data: Data) => void): this;
    on(event: "close", cb: (code: number, reason: Buffer) => void): this;
    on(event: "error", cb: (err: Error) => void): this;
    on(event: "open", cb: () => void): this;
    on(event: "pong", cb: () => void): this;
  }

  class WebSocketServer extends EventEmitter {
    constructor(options?: WebSocketServerOptions);
    clients: Set<WebSocket>;
    handleUpgrade(
      req: import("http").IncomingMessage,
      socket: any,
      head: Buffer,
      cb: (ws: WebSocket) => void
    ): void;
    on(event: "connection", cb: (ws: WebSocket, req: import("http").IncomingMessage) => void): this;
    on(event: "error", cb: (err: Error) => void): this;
  }

  export { WebSocket, WebSocketServer };
  export default WebSocket;
}
