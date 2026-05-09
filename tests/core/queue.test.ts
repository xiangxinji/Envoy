import { describe, it, expect } from "vitest";
import { Queue } from "../../packages/core/queue.js";

describe("Queue", () => {
  it("enqueues and dequeues in FIFO order", () => {
    const q = new Queue<number>();
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    expect(q.dequeue()).toBe(1);
    expect(q.dequeue()).toBe(2);
    expect(q.dequeue()).toBe(3);
  });

  it("returns undefined when dequeuing empty queue", () => {
    const q = new Queue<string>();
    expect(q.dequeue()).toBeUndefined();
  });

  it("reports correct length", () => {
    const q = new Queue<number>();
    expect(q.length).toBe(0);
    q.enqueue(1);
    expect(q.length).toBe(1);
    q.enqueue(2);
    expect(q.length).toBe(2);
    q.dequeue();
    expect(q.length).toBe(1);
  });

  it("peeks at front without removing", () => {
    const q = new Queue<number>();
    q.enqueue(10);
    q.enqueue(20);
    expect(q.peek()).toBe(10);
    expect(q.length).toBe(2);
  });

  it("removes item by predicate", () => {
    const q = new Queue<{ id: number }>();
    q.enqueue({ id: 1 });
    q.enqueue({ id: 2 });
    q.enqueue({ id: 3 });
    const removed = q.remove((item) => item.id === 2);
    expect(removed).toEqual({ id: 2 });
    expect(q.length).toBe(2);
    expect(q.toArray()).toEqual([{ id: 1 }, { id: 3 }]);
  });

  it("returns undefined when remove finds nothing", () => {
    const q = new Queue<number>();
    q.enqueue(1);
    expect(q.remove((x) => x === 99)).toBeUndefined();
  });

  it("toArray returns a copy", () => {
    const q = new Queue<number>();
    q.enqueue(1);
    q.enqueue(2);
    const arr = q.toArray();
    arr.push(3);
    expect(q.length).toBe(2);
  });

  it("clears all items", () => {
    const q = new Queue<number>();
    q.enqueue(1);
    q.enqueue(2);
    q.clear();
    expect(q.length).toBe(0);
    expect(q.peek()).toBeUndefined();
  });
});
