import { EventEmitter } from "../core/event-emitter.js";
import { PriorityQueue } from "../core/queue.js";
import type { TaskInstance } from "../core/task.js";

export class TaskQueue extends EventEmitter {
  private queue = new PriorityQueue();
  private running: TaskInstance | null = null;
  private suspended: TaskInstance[] = [];

  get queueLength(): number {
    return this.queue.length;
  }

  get currentTask(): TaskInstance | null {
    return this.running;
  }

  get suspendedTasks(): TaskInstance[] {
    return [...this.suspended];
  }

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

  shouldPreempt(currentPriority: number): boolean {
    const next = this.queue.peek();
    return next !== undefined && next.mode === "preemptive" && next.priority > currentPriority;
  }
}
