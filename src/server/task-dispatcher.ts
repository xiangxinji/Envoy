import type { Message } from "../core/message.js";
import { createMessage } from "../core/message.js";
import type { TaskResult } from "../core/task.js";
import type { ConnectionManager } from "./connection-manager.js";
import type { CapabilityRegistry } from "./capability-registry.js";

export interface DispatcherOptions {
  defaultTimeout?: number; // ms, default 60000
}

export interface DispatchResult {
  taskId: string;
  clientId: string;
}

export class TaskDispatcher {
  private taskCounter = 0;

  constructor(
    private connectionManager: ConnectionManager,
    private capabilityRegistry: CapabilityRegistry,
    private send: (clientId: string, message: Message) => void,
    private options: DispatcherOptions = {}
  ) {}

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

  sendAbort(clientId: string, taskId: string): void {
    const msg = createMessage("execute_abort", "server", clientId, { taskId });
    this.send(clientId, msg);
  }
}
