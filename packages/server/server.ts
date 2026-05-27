import { EventEmitter } from "../core/event-emitter.js";
import { createMessage } from "../core/message.js";
import type { Message } from "../core/message.js";
import type { Task, SubmitOptions } from "../core/task.js";
import { ServerTransport } from "./transport.js";
import { ConnectionManager } from "./connection-manager.js";
import type { ClientState } from "./connection-manager.js";

interface TaskState {
  task: Task;
  serialIndex: number;
  pendingClients: Set<string>;
  leaderReviewing: boolean;
  retryCount: number;
}

export interface SerializedTaskState {
  serialIndex: number;
  pendingClients: string[];
  leaderReviewing: boolean;
  retryCount: number;
}

export type ServerEvents = {
  "client:online": (client: ClientState) => void;
  "client:offline": (info: { id: string }) => void;
  "task:created": (task: Task) => void;
  "task:updated": (task: Task) => void;
  "task:completed": (task: Task) => void;
  "task:failed": (task: Task) => void;
  "message": (clientId: string, msg: Message) => void;
};

export interface ServerOptions {
  port: number;
  host?: string;
  heartbeatTimeout?: number;
  defaultTaskTimeout?: number;
}

export class Server extends EventEmitter<ServerEvents> {
  private transport: ServerTransport;
  private connectionManager: ConnectionManager;
  private tasks = new Map<string, TaskState>();
  private taskCounter = 0;

  constructor(options: ServerOptions) {
    super();

    this.transport = new ServerTransport({
      port: options.port,
      host: options.host,
    });

    this.connectionManager = new ConnectionManager({
      heartbeatTimeout: options.heartbeatTimeout,
    });

    this.setupTransportHandlers();
    this.setupConnectionManagerHandlers();
  }

  async start(): Promise<void> {
    await this.transport.start();
    this.connectionManager.startTimeoutChecker();
  }

  async stop(): Promise<void> {
    this.connectionManager.stopTimeoutChecker();
    await this.transport.stop();
  }

  getClient(clientId: string): ClientState | undefined {
    return this.connectionManager.getClient(clientId);
  }

  getClients(): ClientState[] {
    return this.connectionManager.getAllClients();
  }

  getOnlineClients(): ClientState[] {
    return this.connectionManager.getOnlineClients();
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId)?.task;
  }

  getTaskState(taskId: string): SerializedTaskState | null {
    const state = this.tasks.get(taskId);
    if (!state) return null;
    return {
      serialIndex: state.serialIndex,
      pendingClients: [...state.pendingClients],
      leaderReviewing: state.leaderReviewing,
      retryCount: state.retryCount,
    };
  }

  getAllTasks(): Task[] {
    return [...this.tasks.values()].map((ts) => ts.task);
  }

  loadTaskStates(entries: Array<{ task: Task; state: SerializedTaskState }>): void {
    for (const { task, state } of entries) {
      if (this.tasks.has(task.id)) continue;
      this.tasks.set(task.id, {
        task,
        serialIndex: state.serialIndex,
        pendingClients: new Set(state.pendingClients),
        leaderReviewing: state.leaderReviewing,
        retryCount: state.retryCount,
      });
    }
  }

  redispatchRestoredTasks(): void {
    for (const [, state] of this.tasks) {
      const { task } = state;
      if (task.status === "pending") {
        if (task.mode === "serial") {
          this.dispatchSerial(state);
        } else {
          this.dispatchParallel(state);
        }
      } else if (task.status === "running") {
        for (const clientId of state.pendingClients) {
          if (!this.connectionManager.isOnline(clientId)) continue;
          const dispatchMsg = createMessage("dispatch", "server", clientId, task);
          this.transport.send(clientId, dispatchMsg);
        }
      }
      // "reviewing" tasks are NOT re-dispatched: the leader already received
      // the task for review. Re-dispatching would trigger duplicate review
      // attempts that could fail and cause status regression.
    }
  }

  notify(clientId: string, subtype: string, payload: unknown): void {
    const msg = createMessage("notify", "server", clientId, payload, { subtype });
    this.transport.send(clientId, msg);
  }

  relay(fromId: string, toId: string, subtype: string, payload: unknown): void {
    if (!this.connectionManager.isOnline(toId)) return;
    const msg = createMessage("message", fromId, toId, payload, { subtype });
    this.transport.send(toId, msg);
  }

  submitFrom(fromId: string, options: SubmitOptions): string {
    return this.createTaskAndDispatch(fromId, options);
  }

  private createTaskAndDispatch(fromId: string, options: SubmitOptions): string {
    const taskId = `task-${Date.now()}-${++this.taskCounter}`;
    const task: Task = {
      id: taskId,
      createBy: fromId,
      subscribe: options.subscribe!,
      content: options.content,
      mode: options.mode,
      status: "pending",
      resources: [],
      createdAt: Date.now(),
      attempt: 1,
    };

    const state: TaskState = {
      task,
      serialIndex: 0,
      pendingClients: new Set(options.subscribe!),
      leaderReviewing: false,
      retryCount: 0,
    };
    this.tasks.set(taskId, state);

    this.emit("task:created", task);
    this.notifyTaskUpdate(task);

    if (task.mode === "serial") {
      this.dispatchSerial(state);
    } else {
      this.dispatchParallel(state);
    }

    return taskId;
  }

  private setupTransportHandlers(): void {
    this.transport.on("connection", (clientId: unknown, role: unknown) => {
      const id = clientId as string;
      const r = (role as "client" | "watcher") || "client";
      this.connectionManager.addClient(id, r);
      const state = this.connectionManager.getClient(id)!;
      this.emit("client:online", state);
      this.notifyWatchers("client:online", state);
      this.reassignPendingTasks(id);
    });

    this.transport.on("close", (clientId: unknown) => {
      const id = clientId as string;
      const client = this.connectionManager.getClient(id);
      if (!client) return;
      this.connectionManager.removeClient(id);
      this.emit("client:offline", { id });
      this.notifyWatchers("client:offline", { id });
      this.handleClientOffline(id);
    });

    this.transport.on("message", (clientId: unknown, msg: unknown) => {
      this.handleMessage(clientId as string, msg as Message);
    });
  }

  private setupConnectionManagerHandlers(): void {
    this.connectionManager.on("client:offline", (clientId: unknown) => {
      const id = clientId as string;
      this.emit("client:offline", { id });
      this.handleClientOffline(id);
    });
  }

  private handleMessage(clientId: string, msg: Message): void {
    switch (msg.type) {
      case "heartbeat":
        this.handleHeartbeat(clientId, msg);
        break;
      case "submit":
        this.handleSubmit(clientId, msg);
        break;
      case "result":
        this.handleResult(clientId, msg);
        break;
      case "notify":
      case "message":
        if (msg.to !== "server") {
          this.transport.send(msg.to, msg);
        }
        this.emit("message", clientId, msg);
        break;
    }
  }

  private handleHeartbeat(clientId: string, msg: Message): void {
    this.connectionManager.updateHeartbeat(clientId, msg.payload as any);
    const ack = createMessage("heartbeat_ack", "server", clientId, {});
    this.transport.send(clientId, ack);
  }

  private handleSubmit(clientId: string, msg: Message): void {
    const payload = msg.payload as SubmitOptions;

    if (!payload.subscribe || payload.subscribe.length === 0) {
      const err = createMessage("error", "server", clientId, {
        message: "subscribe cannot be empty",
      });
      this.transport.send(clientId, err);
      return;
    }

    this.createTaskAndDispatch(clientId, payload);
  }

  private dispatchSerial(state: TaskState): void {
    const { task } = state;
    if (state.serialIndex >= task.subscribe.length) {
      this.dispatchToLeader(state);
      return;
    }

    const targetId = task.subscribe[state.serialIndex];
    if (!this.connectionManager.isOnline(targetId)) {
      // Target is offline — wait for reconnection instead of failing.
      this.notifyTaskUpdate(task);
      return;
    }

    this.notifyTaskUpdate(task);

    const dispatchMsg = createMessage("dispatch", "server", targetId, task);
    this.transport.send(targetId, dispatchMsg);
  }

  private dispatchParallel(state: TaskState): void {
    const { task } = state;
    this.notifyTaskUpdate(task);

    for (const targetId of task.subscribe) {
      if (!this.connectionManager.isOnline(targetId)) {
        // Skip dispatching to offline members, but keep them in pendingClients.
        // They will receive the task when they reconnect.
        continue;
      }
      const dispatchMsg = createMessage("dispatch", "server", targetId, task);
      this.transport.send(targetId, dispatchMsg);
    }

    // Only dispatch to leader if all members have actually submitted results
    // (not just because some are offline)
  }

  private handleResult(clientId: string, msg: Message): void {
    const { taskId, success, data, error } = msg.payload as {
      taskId: string;
      success: boolean;
      data?: unknown;
      error?: string;
    };
    this.processResult(clientId, taskId, success, data, error);
  }

  receiveResult(clientId: string, taskId: string, success: boolean, data?: unknown, error?: string): void {
    this.processResult(clientId, taskId, success, data, error);
  }

  addResourceToTask(taskId: string, type: string, by: string, data: unknown, notify = true): void {
    const state = this.tasks.get(taskId);
    if (!state) return;
    this.addResource(state.task, type, by, data);
    if (notify) this.notifyTaskUpdate(state.task);
  }

  /** Manual status transition: pending → running. Idempotent for parallel mode. */
  startTask(taskId: string): Task | null {
    const state = this.tasks.get(taskId);
    if (!state) return null;
    if (state.task.status !== "pending" && state.task.status !== "running") return null;
    if (state.task.status === "pending") {
      state.task.status = "running";
      this.notifyTaskUpdate(state.task);
    }
    return state.task;
  }

  private processResult(clientId: string, taskId: string, success: boolean, data?: unknown, error?: string): void {
    const state = this.tasks.get(taskId);
    if (!state) return;

    const { task } = state;

    if (!success) {
      if (state.leaderReviewing) {
        // Leader review failed
        this.addResource(task, "leader-review", clientId, { success: false, error });
        if (state.retryCount < 10) {
          this.resetForRetry(state);
        } else {
          task.status = "failed";
          this.emit("task:failed", task);
          this.notifyTaskUpdate(task);
        }
      } else {
        // Member execution failed
        this.addResource(task, "client-result", clientId, { error });
        task.status = "failed";
        this.emit("task:failed", task);
        this.notifyTaskUpdate(task);
      }
      return;
    }

    if (state.leaderReviewing) {
      // Leader review passed
      this.addResource(task, "leader-review", clientId, { success: true, data });
      this.finishTask(state);
      return;
    }

    // Member execution succeeded
    this.addResource(task, "client-result", clientId, data);
    state.pendingClients.delete(clientId);

    if (task.mode === "serial") {
      state.serialIndex++;
      this.notifyTaskUpdate(task);
      if (state.serialIndex >= task.subscribe.length) {
        this.dispatchToLeader(state);
      } else {
        this.dispatchSerial(state);
      }
    } else {
      this.notifyTaskUpdate(task);
      if (state.pendingClients.size === 0) {
        this.dispatchToLeader(state);
      }
    }
  }

  private finishTask(state: TaskState): void {
    state.task.status = "completed";
    this.emit("task:completed", state.task);
    this.notifyTaskUpdate(state.task);
  }

  private dispatchToLeader(state: TaskState): void {
    const { task } = state;
    const leaderId = task.createBy;

    if (!this.connectionManager.isOnline(leaderId)) {
      // Leader offline, complete task directly for now
      this.finishTask(state);
      return;
    }

    state.leaderReviewing = true;
    task.status = "reviewing";
    this.notifyTaskUpdate(task);

    const dispatchMsg = createMessage("dispatch", "server", leaderId, task, { subtype: "review" });
    this.transport.send(leaderId, dispatchMsg);
  }

  /** Re-dispatch pending tasks to a reconnecting client. */
  private reassignPendingTasks(clientId: string): void {
    for (const [, state] of this.tasks) {
      if (state.task.status !== "running" && state.task.status !== "pending") continue;
      if (!state.pendingClients.has(clientId)) continue;

      const dispatchMsg = createMessage("dispatch", "server", clientId, state.task);
      this.transport.send(clientId, dispatchMsg);
    }
  }

  private resetForRetry(state: TaskState): void {
    const { task } = state;

    state.leaderReviewing = false;
    state.retryCount++;
    task.attempt++;
    state.pendingClients = new Set(task.subscribe);
    state.serialIndex = 0;
    task.status = "pending";
    this.notifyTaskUpdate(task);

    if (task.mode === "serial") {
      this.dispatchSerial(state);
    } else {
      this.dispatchParallel(state);
    }
  }

  private addResource(task: Task, type: string, by: string, data: unknown, attempt?: number): void {
    task.resources.push({ type, by, data, attempt: attempt ?? task.attempt, timestamp: Date.now() });
  }

  private notifyTaskUpdate(task: Task): void {
    const targets = new Set<string>([task.createBy, ...task.subscribe]);
    for (const watcher of this.connectionManager.getWatchers()) {
      targets.add(watcher.id);
    }
    for (const targetId of targets) {
      if (!this.connectionManager.isOnline(targetId)) continue;
      try {
        const msg = createMessage("task", "server", targetId, task);
        this.transport.send(targetId, msg);
      } catch {
        // client may have disconnected
      }
    }
    this.emit("task:updated", task);
  }

  private notifyWatchers(subtype: string, payload: unknown): void {
    for (const watcher of this.connectionManager.getWatchers()) {
      try {
        this.notify(watcher.id, subtype, payload);
      } catch {}
    }
  }

  private handleClientOffline(clientId: string): void {
    for (const [, state] of this.tasks) {
      const taskStatus = state.task.status;
      if (taskStatus !== "running" && taskStatus !== "pending" && taskStatus !== "reviewing") continue;
      if (!state.pendingClients.has(clientId) && state.task.createBy !== clientId) continue;

      // Leader goes offline while reviewing — still finish the task
      if (state.leaderReviewing && state.task.createBy === clientId) {
        this.addResource(state.task, "leader-review", clientId, {
          error: `Leader ${clientId} disconnected during review`,
        });
        this.finishTask(state);
        continue;
      }

      // Member offline: keep them in pendingClients so the task waits for reconnection.
      // Do NOT delete from pendingClients or add error resources.
      // When the member reconnects, they will receive the task again.
    }
  }
}
