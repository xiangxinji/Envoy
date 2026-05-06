import type { TaskInstance, TaskResult, TaskProgress } from "../core/task.js";
import type { CapabilityRegistration, TaskContext } from "./capability.js";
import type { TaskQueue } from "./task-queue.js";

export type OnResult = (taskId: string, result: TaskResult) => void;
export type OnProgress = (taskId: string, progress: TaskProgress) => void;
export type OnExecuteRequest = (taskName: string, params: Record<string, unknown>) => Promise<unknown>;

export class TaskExecutor {
  constructor(
    private queue: TaskQueue,
    private capabilities: Map<string, CapabilityRegistration>,
    private onResult: OnResult,
    private onProgress: OnProgress,
    private onExecuteRequest: OnExecuteRequest
  ) {}

  async processNext(): Promise<void> {
    const task = this.queue.next();
    if (!task) return;

    const cap = this.capabilities.get(task.name);
    if (!task || !cap) return;

    const start = Date.now();
    try {
      const result = await this.executeWithCapability(task, cap);
      const duration = Date.now() - start;
      const taskResult: TaskResult = { success: true, data: result, duration };
      this.queue.complete(task.id);
      this.onResult(task.id, taskResult);
    } catch (err) {
      const duration = Date.now() - start;
      const taskResult: TaskResult = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        duration,
      };

      // retry logic
      if (task.maxRetries && task.retryCount < task.maxRetries) {
        task.retryCount++;
        task.status = "pending";
        this.queue.enqueue(task);
      } else {
        this.queue.fail(task.id);
        this.onResult(task.id, taskResult);
      }
    }
  }

  abort(taskId: string): boolean {
    return this.queue.abort(taskId);
  }

  private async executeWithCapability(
    task: TaskInstance,
    cap: CapabilityRegistration
  ): Promise<unknown> {
    const ctx: TaskContext = {
      params: task.params,
      report: (progress) => {
        this.onProgress(task.id, {
          taskId: task.id,
          step: progress.step,
          progress: progress.progress,
          message: progress.message,
        });
      },
      execute: (taskName, params) => this.onExecuteRequest(taskName, params),
    };

    if (cap.mode === "preemptive" && this.isGeneratorFn(cap.execute)) {
      return this.executeGenerator(task, cap, ctx);
    }

    return (cap.execute as (ctx: TaskContext) => Promise<unknown>)(ctx);
  }

  private async executeGenerator(
    task: TaskInstance,
    cap: CapabilityRegistration,
    ctx: TaskContext
  ): Promise<unknown> {
    const gen = (cap.execute as (ctx: TaskContext) => Generator<unknown, unknown, unknown>)(ctx);
    let stepIndex = 0;

    let result = gen.next();
    while (!result.done) {
      stepIndex++;
      // auto-report progress at each yield
      this.onProgress(task.id, {
        taskId: task.id,
        step: stepIndex,
        progress: Math.round((stepIndex / (stepIndex + 1)) * 100),
      });

      // check for preemption
      if (this.queue.shouldPreempt(task.priority)) {
        // suspend: return generator state via queue
        this.queue.enqueue({
          ...task,
          status: "pending",
        });
        return undefined; // will be resumed later
      }

      result = gen.next();
    }

    return result.value;
  }

  private isGeneratorFn(fn: (...args: any[]) => any): boolean {
    return fn.constructor?.name === "GeneratorFunction";
  }
}
