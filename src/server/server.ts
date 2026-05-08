import { EventEmitter } from "../core/event-emitter.js";
import { createMessage } from "../core/message.js";
import type { Message } from "../core/message.js";
import type { TaskResult, TaskProgress, TaskRecord, TaskHistoryEntry } from "../core/task.js";
import type { CapabilityDefinition } from "../core/capability.js";
import type { RegisterPayload } from "../core/message.js";
import { ServerTransport } from "./transport.js";
import { ConnectionManager } from "./connection-manager.js";
import type { ClientState } from "./connection-manager.js";
import { CapabilityRegistry } from "./capability-registry.js";
import { TaskDispatcher } from "./task-dispatcher.js";
import { MessageRouter } from "./message-router.js";

/** 服务端事件类型定义 */
export type ServerEvents = {
  /** 客户端上线事件 */
  "client:online": (client: ClientState) => void;
  /** 客户端离线事件 */
  "client:offline": (info: { id: string }) => void;
  /** 客户端注册能力事件 */
  "client:registered": (clientId: string, caps: CapabilityDefinition[]) => void;
  /** 任务完成事件 */
  "task:completed": (taskId: string, result: TaskResult) => void;
  /** 任务进度事件 */
  "task:progress": (taskId: string, progress: TaskProgress) => void;
  /** 收到消息事件 */
  "message": (clientId: string, msg: Message) => void;
}

/** 服务端配置选项 */
export interface ServerOptions {
  /** 监听端口 */
  port: number;
  /** 监听主机地址，默认 0.0.0.0 */
  host?: string;
  /** 心跳超时时间（毫秒），默认 30000 */
  heartbeatTimeout?: number;
  /** 任务默认超时时间（毫秒），默认 60000 */
  defaultTaskTimeout?: number;
}

/**
 * UniOpc 服务端主类
 * 管理客户端连接、能力注册、任务调度等功能
 */
export class Server extends EventEmitter<ServerEvents> {
  private transport: ServerTransport;
  private connectionManager: ConnectionManager;
  private capabilityRegistry: CapabilityRegistry;
  private taskDispatcher: TaskDispatcher;
  private messageRouter: MessageRouter;
  private watchers = new Set<string>();
  private tasks = new Map<string, TaskRecord>();

  /** 待处理任务映射表，用于跟踪异步任务结果 */
  private pendingTasks = new Map<
    string,
    {
      resolve: (result: TaskResult) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      fromClient?: string; // for client-to-client routing
      originalRequestId?: string; // original request message id for replyTo
    }
  >();

  /** 创建服务端实例 */
  constructor(private options: ServerOptions) {
    super();

    this.transport = new ServerTransport({
      port: options.port,
      host: options.host,
    });

    this.connectionManager = new ConnectionManager({
      heartbeatTimeout: options.heartbeatTimeout,
    });

    this.capabilityRegistry = new CapabilityRegistry();

    this.taskDispatcher = new TaskDispatcher(
      this.connectionManager,
      this.capabilityRegistry,
      (clientId, msg) => this.transport.send(clientId, msg),
      { defaultTimeout: options.defaultTaskTimeout }
    );

    this.messageRouter = new MessageRouter(
      (clientId, msg) => this.transport.send(clientId, msg)
    );

    this.setupTransportHandlers();
    this.setupConnectionManagerHandlers();
  }

  /** 启动服务端，开始监听连接 */
  async start(): Promise<void> {
    await this.transport.start();
    this.connectionManager.startTimeoutChecker();
  }

  /** 停止服务端，断开所有连接 */
  async stop(): Promise<void> {
    this.connectionManager.stopTimeoutChecker();
    for (const [, pending] of this.pendingTasks) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Server shutting down"));
    }
    this.pendingTasks.clear();
    this.messageRouter.cancelAll();
    await this.transport.stop();
  }

  // --- 公共 API ---

  /** 获取指定客户端状态 */
  getClient(clientId: string) {
    return this.connectionManager.getClient(clientId);
  }

  /** 获取所有客户端列表 */
  getClients() {
    return this.connectionManager.getAllClients();
  }

  /** 获取在线客户端列表 */
  getOnlineClients() {
    return this.connectionManager.getOnlineClients();
  }

  /** 获取指定客户端注册的能力列表 */
  getClientCapabilities(clientId: string): CapabilityDefinition[] {
    return this.capabilityRegistry.getClientCapabilities(clientId);
  }

  /** 自动选择客户端执行任务 */
  async executeAny(
    taskName: string,
    params: Record<string, unknown>,
    options?: { priority?: number; mode?: "queue" | "preemptive"; timeout?: number }
  ): Promise<TaskResult> {
    const clientId = this.taskDispatcher.selectClient(taskName);
    if (!clientId) {
      throw new Error(`No available client for capability: ${taskName}`);
    }
    return this.executeTo(clientId, taskName, params, options);
  }

  /** 指定客户端执行任务 */
  async executeTo(
    clientId: string,
    taskName: string,
    params: Record<string, unknown>,
    options?: { priority?: number; mode?: "queue" | "preemptive"; timeout?: number }
  ): Promise<TaskResult> {
    const timeout = options?.timeout ?? this.options.defaultTaskTimeout ?? 60000;
    const taskId = this.taskDispatcher.dispatch(clientId, taskName, params, options);

    const now = Date.now();
    const record: TaskRecord = {
      id: taskId,
      name: taskName,
      params,
      status: "pending",
      initiator: "server",
      createdAt: now,
      history: [
        { type: "created", at: now, by: "server" },
        { type: "dispatched", at: now, to: clientId },
      ],
    };
    this.tasks.set(taskId, record);
    this.notifyWatchers("task:created", record);

    return new Promise<TaskResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingTasks.delete(taskId);
        reject(new Error(`Task ${taskId} timed out after ${timeout}ms`));
      }, timeout);

      this.pendingTasks.set(taskId, { resolve, reject, timer });
    });
  }

  /** 向指定客户端发送通知 */
  notify(clientId: string, subtype: string, payload: unknown): void {
    const msg = createMessage("notify", "server", clientId, payload, { subtype });
    this.transport.send(clientId, msg);
  }

  // --- 内部处理方法 ---

  /** 设置传输层事件处理器 */
  private setupTransportHandlers(): void {
    this.transport.on("connection", (clientId: unknown) => {
      const id = clientId as string;
      this.connectionManager.addClient(id);
      const state = this.connectionManager.getClient(id)!;
      this.emit("client:online", state);
      this.notifyWatchers("client:online", state);
    });

    this.transport.on("close", (clientId: unknown) => {
      const id = clientId as string;
      this.watchers.delete(id);
      this.capabilityRegistry.unregister(id);
      this.connectionManager.removeClient(id);
      this.emit("client:offline", { id });
      this.notifyWatchers("client:offline", { id });
    });

    this.transport.on("message", (clientId: unknown, msg: unknown) => {
      const id = clientId as string;
      const message = msg as Message;
      this.handleMessage(id, message);
    });
  }

  /** 设置连接管理器事件处理器 */
  private setupConnectionManagerHandlers(): void {
    this.connectionManager.on("client:offline", (clientId: unknown) => {
      const id = clientId as string;
      this.watchers.delete(id);
      this.emit("client:offline", { id });
      this.notifyWatchers("client:offline", { id });
    });
  }

  /** 处理收到的消息，根据类型分发到对应处理器 */
  private handleMessage(clientId: string, msg: Message): void {
    switch (msg.type) {
      case "register":
        this.handleRegister(clientId, msg);
        break;
      case "heartbeat":
        this.handleHeartbeat(clientId, msg);
        break;
      case "execute_result":
        this.handleExecuteResult(clientId, msg);
        break;
      case "execute_progress":
        this.handleExecuteProgress(clientId, msg);
        break;
      case "execute_request":
        this.handleExecuteRequest(clientId, msg);
        break;
      case "notify":
      case "message":
        this.emit("message", clientId, msg);
        break;
      default:
        break;
    }
  }

  /** 向所有 watcher 推送通知 */
  private notifyWatchers(subtype: string, payload: unknown): void {
    for (const watcherId of this.watchers) {
      try {
        this.notify(watcherId, subtype, payload);
      } catch {
        // watcher may have disconnected
      }
    }
  }

  /** 处理客户端能力注册消息 */
  private handleRegister(clientId: string, msg: Message): void {
    const payload = msg.payload as RegisterPayload;

    if (payload.watcher) {
      this.watchers.add(clientId);
      // 推送初始快照
      const snapshot = {
        clients: this.connectionManager.getAllClients(),
        capabilities: this.capabilityRegistry.getAllCapabilities(),
        tasks: [...this.tasks.values()],
      };
      this.notify(clientId, "snapshot", snapshot);
    }

    const caps = payload.capabilities as CapabilityDefinition[];
    for (const cap of caps) {
      this.capabilityRegistry.register(clientId, cap);
    }

    const ack = createMessage("register_ack", "server", clientId, { success: true });
    this.transport.send(clientId, ack);
    if (caps.length > 0) {
      this.emit("client:registered", clientId, caps);
      this.notifyWatchers("client:registered", { clientId, capabilities: caps });
    }
  }

  /** 处理心跳消息，更新客户端状态 */
  private handleHeartbeat(clientId: string, msg: Message): void {
    this.connectionManager.updateHeartbeat(clientId, msg.payload as any);
    const ack = createMessage("heartbeat_ack", "server", clientId, {});
    this.transport.send(clientId, ack);
  }

  /** 处理任务执行结果 */
  private handleExecuteResult(clientId: string, msg: Message): void {
    const taskId = msg.replyTo ?? (msg.payload as any).taskId;

    // check if this is a client-to-client result that needs forwarding
    const pending = this.pendingTasks.get(taskId);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingTasks.delete(taskId);

    const result = msg.payload as TaskResult;

    // if fromClient is set, this was a client-to-client call, forward result
    if (pending.fromClient) {
      const forwardMsg = createMessage(
        "execute_result",
        "server",
        pending.fromClient,
        result,
        { replyTo: pending.originalRequestId ?? taskId }
      );
      this.transport.send(pending.fromClient, forwardMsg);
    } else {
      pending.resolve(result);
    }

    this.emit("task:completed", taskId, result);

    const record = this.tasks.get(taskId);
    if (record) {
      if (result.success) {
        record.status = "completed";
        record.history.push({ type: "completed", at: Date.now(), by: clientId, result });
      } else {
        record.status = "failed";
        record.history.push({ type: "failed", at: Date.now(), by: clientId, error: result.error ?? "Unknown error" });
      }
      this.notifyWatchers("task:updated", record);
    }
  }

  /** 处理任务执行进度更新 */
  private handleExecuteProgress(clientId: string, msg: Message): void {
    const progress = msg.payload as TaskProgress;
    this.emit("task:progress", progress.taskId, progress);

    const record = this.tasks.get(progress.taskId);
    if (record) {
      record.status = "running";
      const existingIdx = record.history.findIndex(
        (e) => e.type === "progress" && e.step === progress.step
      );
      const entry: TaskHistoryEntry = {
        type: "progress",
        at: Date.now(),
        by: clientId,
        step: progress.step,
        progress: progress.progress,
        message: progress.message,
      };
      if (existingIdx >= 0) {
        record.history[existingIdx] = entry;
      } else {
        record.history.push(entry);
      }
      this.notifyWatchers("task:updated", record);
    }
  }

  /** 处理客户端发起的任务执行请求（用于客户端间调用） */
  private handleExecuteRequest(clientId: string, msg: Message): void {
    const { taskName, params, timeout } = msg.payload as {
      taskName: string;
      params: Record<string, unknown>;
      timeout?: number;
    };

    const targetClientId = this.taskDispatcher.selectClient(taskName);
    if (!targetClientId) {
      const err = createMessage("error", "server", clientId, {
        message: `No available client for capability: ${taskName}`,
      });
      this.transport.send(clientId, err);
      return;
    }

    const effectiveTimeout = timeout ?? this.options.defaultTaskTimeout ?? 60000;
    const taskId = this.taskDispatcher.dispatch(targetClientId, taskName, params, {
      timeout: effectiveTimeout,
    });

    const now = Date.now();
    const record: TaskRecord = {
      id: taskId,
      name: taskName,
      params,
      status: "pending",
      initiator: clientId,
      createdAt: now,
      history: [
        { type: "created", at: now, by: clientId },
        { type: "dispatched", at: now, to: targetClientId },
      ],
    };
    this.tasks.set(taskId, record);
    this.notifyWatchers("task:created", record);

    // track for forwarding result back
    this.messageRouter.trackRequest(taskId, clientId, effectiveTimeout, () => {
      this.pendingTasks.delete(taskId);
      if (!this.transport.isConnected(clientId)) return;
      const err = createMessage("error", "server", clientId, {
        message: `Task ${taskId} timed out`,
      });
      this.transport.send(clientId, err);
    });

    this.pendingTasks.set(taskId, {
      resolve: () => {}, // will be handled by handleExecuteResult via fromClient
      reject: () => {},
      timer: setTimeout(() => {}, effectiveTimeout), // placeholder
      fromClient: clientId,
      originalRequestId: msg.id,
    });
  }
}
