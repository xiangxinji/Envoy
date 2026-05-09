import { EventEmitter } from "../../packages/core/event-emitter.js";

/** 客户端状态信息 */
export interface ClientState {
  /** 客户端 ID */
  id: string;
  /** 客户端状态：在线、离线、忙碌 */
  status: "online" | "offline" | "busy";
  /** 连接时间戳 */
  connectedAt: number;
  /** 最后心跳时间戳 */
  lastHeartbeat: number;
  /** 任务队列长度 */
  queueLength: number;
  /** 当前正在执行的任务 */
  currentTask?: {
    /** 任务 ID */
    taskId: string;
    /** 任务名称 */
    taskName: string;
    /** 任务进度 */
    progress?: number;
  };
  /** 客户端运行时长（毫秒） */
  uptime: number;
  /** 内存使用量（字节） */
  memoryUsage?: number;
}

/** 连接管理器配置选项 */
export interface ConnectionManagerOptions {
  /** 心跳超时时间（毫秒），默认 30000 */
  heartbeatTimeout?: number;
}

/**
 * 连接管理器
 * 负责管理所有客户端连接状态和心跳检测
 */
export class ConnectionManager extends EventEmitter {
  private clients = new Map<string, ClientState>();
  private timeoutChecker: ReturnType<typeof setInterval> | null = null;

  /** 创建连接管理器实例 */
  constructor(private options: ConnectionManagerOptions = {}) {
    super();
  }

  /** 添加新客户端连接 */
  addClient(clientId: string): void {
    const now = Date.now();
    this.clients.set(clientId, {
      id: clientId,
      status: "online",
      connectedAt: now,
      lastHeartbeat: now,
      queueLength: 0,
      uptime: 0,
    });
    this.emit("client:online", clientId);
  }

  /** 移除客户端连接 */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.status = "offline";
      this.clients.delete(clientId);
      this.emit("client:offline", clientId);
    }
  }

  /** 更新客户端心跳信息 */
  updateHeartbeat(
    clientId: string,
    payload: {
      queueLength: number;
      running?: { taskId: string; taskName: string; progress?: number };
      uptime: number;
      memoryUsage?: number;
    }
  ): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastHeartbeat = Date.now();
    client.queueLength = payload.queueLength;
    client.currentTask = payload.running;
    client.uptime = payload.uptime;
    client.memoryUsage = payload.memoryUsage;
    client.status = payload.running ? "busy" : "online";
  }

  /** 获取指定客户端状态 */
  getClient(clientId: string): ClientState | undefined {
    return this.clients.get(clientId);
  }

  /** 获取所有客户端状态列表 */
  getAllClients(): ClientState[] {
    return [...this.clients.values()];
  }

  /** 获取在线客户端状态列表 */
  getOnlineClients(): ClientState[] {
    return this.getAllClients().filter((c) => c.status !== "offline");
  }

  /** 启动心跳超时检测器 */
  startTimeoutChecker(): void {
    const timeout = this.options.heartbeatTimeout ?? 30000;
    this.timeoutChecker = setInterval(() => {
      const now = Date.now();
      for (const client of this.clients.values()) {
        if (client.status !== "offline" && now - client.lastHeartbeat > timeout) {
          client.status = "offline";
          this.emit("client:offline", client.id);
        }
      }
    }, Math.min(timeout / 2, 10000));
  }

  /** 停止心跳超时检测器 */
  stopTimeoutChecker(): void {
    if (this.timeoutChecker) {
      clearInterval(this.timeoutChecker);
      this.timeoutChecker = null;
    }
  }
}
