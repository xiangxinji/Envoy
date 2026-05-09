import { WebSocketServer, WebSocket } from "ws";
import { EventEmitter } from "../core/event-emitter.js";
import { type Message, serializeMessage, deserializeMessage } from "../core/message.js";
import { ConnectionError } from "../core/errors.js";

/** 服务端传输层配置选项 */
export interface ServerTransportOptions {
  /** 监听端口 */
  port: number;
  /** 监听主机地址 */
  host?: string;
}

/**
 * 服务端 WebSocket 传输层
 * 负责管理 WebSocket 服务器和客户端连接
 */
export class ServerTransport extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private connections = new Map<string, WebSocket>();

  /** 创建服务端传输层实例 */
  constructor(private options: ServerTransportOptions) {
    super();
  }

  /** 启动 WebSocket 服务器 */
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

  /** 向指定客户端发送消息 */
  send(clientId: string, message: Message): void {
    const ws = this.connections.get(clientId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new ConnectionError(`Client ${clientId} not connected`);
    }
    ws.send(serializeMessage(message));
  }

  /** 检查指定客户端是否在线 */
  isConnected(clientId: string): boolean {
    const ws = this.connections.get(clientId);
    return ws?.readyState === WebSocket.OPEN;
  }

  /** 获取所有已连接的客户端 ID 列表 */
  getClientIds(): string[] {
    return [...this.connections.keys()];
  }

  /** 停止 WebSocket 服务器，断开所有连接 */
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
