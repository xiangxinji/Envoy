import { WebSocket } from "ws";
import { EventEmitter } from "../core/event-emitter.js";
import { type Message, serializeMessage, deserializeMessage } from "../core/message.js";

export interface ClientTransportOptions {
  url: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class ClientTransport extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;

  constructor(private options: ClientTransportOptions) {
    super();
  }

  get isConnected(): boolean {
    return this.connected;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.options.url);

      ws.on("open", () => {
        this.ws = ws;
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit("open");
        resolve();
      });

      ws.on("message", (data) => {
        try {
          const msg = deserializeMessage(data.toString());
          this.emit("message", msg);
        } catch {
          // ignore malformed messages
        }
      });

      ws.on("close", () => {
        this.connected = false;
        this.ws = null;
        this.emit("close");
        this.tryReconnect();
      });

      ws.on("error", (err) => {
        if (!this.connected) {
          reject(err);
        } else {
          this.emit("error", err);
        }
      });
    });
  }

  send(message: Message): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected");
    }
    this.ws.send(serializeMessage(message));
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.options.reconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  private tryReconnect(): void {
    if (!this.options.reconnect) return;

    const max = this.options.maxReconnectAttempts ?? 10;
    if (this.reconnectAttempts >= max) {
      this.emit("reconnect_failed");
      return;
    }

    const interval = this.options.reconnectInterval ?? 3000;
    const delay = interval * Math.min(this.reconnectAttempts + 1, 5);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.emit("reconnecting", this.reconnectAttempts);
      this.connect().catch(() => {
        // reconnect will be tried again on close
      });
    }, delay);
  }
}
