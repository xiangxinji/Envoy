import { WebSocketServer, WebSocket } from "ws";
import { EventEmitter } from "../core/event-emitter.js";
import { type Message, serializeMessage, deserializeMessage } from "../core/message.js";
import { ConnectionError } from "../core/errors.js";

export interface ServerTransportOptions {
  port: number;
  host?: string;
}

export class ServerTransport extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private connections = new Map<string, WebSocket>();

  constructor(private options: ServerTransportOptions) {
    super();
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({
        port: this.options.port,
        host: this.options.host,
      });

      this.wss.on("listening", () => resolve());
      this.wss.on("error", (err) => reject(new ConnectionError(err.message)));

      this.wss.on("connection", (ws, req) => {
        const clientId = new URL(
          req.url ?? "/",
          `http://${req.headers.host}`
        ).searchParams.get("clientId");

        if (!clientId) {
          ws.close(4000, "Missing clientId");
          return;
        }

        this.connections.set(clientId, ws);
        this.emit("connection", clientId);

        ws.on("message", (data) => {
          try {
            const msg = deserializeMessage(data.toString());
            this.emit("message", clientId, msg);
          } catch {
            // ignore malformed messages
          }
        });

        ws.on("close", () => {
          this.connections.delete(clientId);
          this.emit("close", clientId);
        });

        ws.on("error", () => {
          this.connections.delete(clientId);
          this.emit("close", clientId);
        });
      });
    });
  }

  send(clientId: string, message: Message): void {
    const ws = this.connections.get(clientId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new ConnectionError(`Client ${clientId} not connected`);
    }
    ws.send(serializeMessage(message));
  }

  isConnected(clientId: string): boolean {
    const ws = this.connections.get(clientId);
    return ws?.readyState === WebSocket.OPEN;
  }

  getClientIds(): string[] {
    return [...this.connections.keys()];
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }
      for (const ws of this.connections.values()) {
        ws.close();
      }
      this.connections.clear();
      this.wss.close(() => resolve());
      this.wss = null;
    });
  }
}
