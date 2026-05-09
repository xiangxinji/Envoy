import type { Message } from "../../packages/core/message.js";
import { createMessage } from "../../packages/core/message.js";
import type { TaskResult } from "../../packages/core/task.js";
import type { ConnectionManager } from "./connection-manager.js";
import type { CapabilityRegistry } from "./capability-registry.js";

/** 任务调度器配置选项 */
export interface DispatcherOptions {
  /** 默认任务超时时间（毫秒），默认 60000 */
  defaultTimeout?: number;
}

/** 任务分发结果 */
export interface DispatchResult {
  /** 任务 ID */
  taskId: string;
  /** 目标客户端 ID */
  clientId: string;
}

/**
 * 任务调度器
 * 负责选择合适的客户端并分发任务
 */
export class TaskDispatcher {
  private taskCounter = 0;

  /** 创建任务调度器实例 */
  constructor(
    private connectionManager: ConnectionManager,
    private capabilityRegistry: CapabilityRegistry,
    private send: (clientId: string, message: Message) => void,
    private options: DispatcherOptions = {}
  ) {}

  /** 选择最适合执行指定能力的客户端 */
  selectClient(capName: string): string | undefined {
    const clientIds = this.capabilityRegistry.getClientsForCapability(capName);
    if (clientIds.length === 0) return undefined;

    // filter online clients
    const online = clientIds.filter((id) => {
      const state = this.connectionManager.getClient(id);
      return state && state.status !== "offline";
    });
    if (online.length === 0) return undefined;

    // pick the one with shortest queue
    online.sort((a, b) => {
      const sa = this.connectionManager.getClient(a)!;
      const sb = this.connectionManager.getClient(b)!;
      // prefer idle over busy
      if (sa.status === "online" && sb.status === "busy") return -1;
      if (sa.status === "busy" && sb.status === "online") return 1;
      return sa.queueLength - sb.queueLength;
    });

    return online[0];
  }

  /** 向指定客户端分发任务 */
  dispatch(
    clientId: string,
    taskName: string,
    params: Record<string, unknown>,
    options?: { priority?: number; mode?: "queue" | "preemptive"; timeout?: number }
  ): string {
    const taskId = `task-${Date.now()}-${++this.taskCounter}`;
    const timeout = options?.timeout ?? this.options.defaultTimeout ?? 60000;

    const msg = createMessage("execute", "server", clientId, {
      taskId,
      name: taskName,
      params,
      mode: options?.mode ?? "queue",
      priority: options?.priority ?? 0,
      timeout,
    });

    this.send(clientId, msg);
    return taskId;
  }

  /** 向指定客户端发送任务中止指令 */
  sendAbort(clientId: string, taskId: string): void {
    const msg = createMessage("execute_abort", "server", clientId, { taskId });
    this.send(clientId, msg);
  }
}
