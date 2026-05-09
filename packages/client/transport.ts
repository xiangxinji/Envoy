import { WebSocket } from "ws";
import { EventEmitter } from "../core/event-emitter.js";
import { type Message, serializeMessage, deserializeMessage } from "../core/message.js";

/** 客户端传输层配置选项 */
export interface ClientTransportOptions {
  /** 服务端 WebSocket 地址 */
  url: string;
  /** 是否自动重连，默认 true */
  reconnect?: boolean;
  /** 重连间隔（毫秒），默认 3000 */
  reconnectInterval?: number;
  /** 最大重连尝试次数，默认 10 */
  maxReconnectAttempts?: number;
}

/**
 * 客户端 WebSocket 传输层
 * 负责与服务端的 WebSocket 连接和消息收发
 */
export class ClientTransport extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;

  /** 创建客户端传输层实例 */
  constructor(private options: ClientTransportOptions) {
    super();
  }

  /** 是否已连接 */
  get isConnected(): boolean {
    return this.connected;
  }

  /** 连接到服务端 */
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

  /** 发送消息到服务端 */
  send(message: Message): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected");
    }
    this.ws.send(serializeMessage(message));
  }

  /** 断开连接 */
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

  /** 尝试重新连接 */
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
