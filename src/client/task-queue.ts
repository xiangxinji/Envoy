import { EventEmitter } from "../core/event-emitter.js";
import { PriorityQueue } from "../core/queue.js";
import type { TaskInstance } from "../core/task.js";

/**
 * 任务队列
 * 管理待执行任务，支持优先级排序和抢占
 */
export class TaskQueue extends EventEmitter {
  private queue = new PriorityQueue();
  private running: TaskInstance | null = null;
  private suspended: TaskInstance[] = [];

  /** 队列长度 */
  get queueLength(): number {
    return this.queue.length;
  }

  /** 当前正在执行的任务 */
  get currentTask(): TaskInstance | null {
    return this.running;
  }

  /** 被挂起的任务列表 */
  get suspendedTasks(): TaskInstance[] {
    return [...this.suspended];
  }

  /** 将任务加入队列，支持抢占逻辑 */
  enqueue(task: TaskInstance): void {
    if (task.mode === "preemptive" && this.running && task.priority > this.running.priority) {
      // preempt: suspend current, run new one
      this.running.status = "suspended";
      this.suspended.push(this.running);
      this.queue.enqueue(task);
      this.emit("preempted", this.running.id, task.id);
      this.emit("changed");
      return;
    }
    this.queue.enqueue(task);
    this.emit("changed");
  }

  /** 获取下一个待执行任务，优先恢复挂起任务 */
  next(): TaskInstance | null {
    // check suspended tasks first (resume highest priority)
    if (this.suspended.length > 0) {
      this.suspended.sort((a, b) => b.priority - a.priority);
      const task = this.suspended.pop()!;
      task.status = "running";
      this.running = task;
      this.emit("changed");
      return task;
    }

    const task = this.queue.dequeue();
    if (!task) {
      this.running = null;
      return null;
    }
    task.status = "running";
    this.running = task;
    this.emit("changed");
    return task;
  }

  /** 标记任务完成 */
  complete(taskId: string): TaskInstance | null {
    if (this.running?.id === taskId) {
      this.running.status = "completed";
      const completed = this.running;
      this.running = null;
      this.emit("changed");
      return completed;
    }
    return null;
  }

  /** 标记任务失败 */
  fail(taskId: string): TaskInstance | null {
    if (this.running?.id === taskId) {
      this.running.status = "failed";
      const failed = this.running;
      this.running = null;
      this.emit("changed");
      return failed;
    }
    return null;
  }

  /** 中止指定任务 */
  abort(taskId: string): boolean {
    // abort running
    if (this.running?.id === taskId) {
      this.running.status = "failed";
      this.running = null;
      this.emit("changed");
      return true;
    }
    // abort from queue
    const removed = this.queue.remove(taskId);
    if (removed) {
      this.emit("changed");
      return true;
    }
    // abort from suspended
    const idx = this.suspended.findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      this.suspended.splice(idx, 1);
      this.emit("changed");
      return true;
    }
    return false;
  }

  /** 检查是否应该发生抢占 */
  shouldPreempt(currentPriority: number): boolean {
    const next = this.queue.peek();
    return next !== undefined && next.mode === "preemptive" && next.priority > currentPriority;
  }
}
