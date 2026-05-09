import type { TaskInstance } from "./task.js";

export class PriorityQueue {
  private items: TaskInstance[] = [];

  get length(): number {
    return this.items.length;
  }

  enqueue(task: TaskInstance): void {
    const idx = this.items.findIndex((t) => t.priority < task.priority);
    if (idx === -1) {
      this.items.push(task);
    } else {
      this.items.splice(idx, 0, task);
    }
  }

  dequeue(): TaskInstance | undefined {
    return this.items.shift();
  }

  peek(): TaskInstance | undefined {
    return this.items[0];
  }

  remove(taskId: string): TaskInstance | undefined {
    const idx = this.items.findIndex((t) => t.id === taskId);
    if (idx === -1) return undefined;
    return this.items.splice(idx, 1)[0];
  }

  toArray(): TaskInstance[] {
    return [...this.items];
  }

  clear(): void {
    this.items = [];
  }
}
