import { describe, it, expect } from "vitest";
import { EventEmitter } from "../../packages/core/event-emitter.js";

describe("EventEmitter", () => {
  it("emits events to registered listeners", () => {
    const emitter = new EventEmitter();
    const results: string[] = [];
    emitter.on("test", (msg: string) => results.push(msg));
    emitter.emit("test", "hello");
    expect(results).toEqual(["hello"]);
  });

  it("supports multiple listeners on same event", () => {
    const emitter = new EventEmitter();
    const results: number[] = [];
    emitter.on("evt", () => results.push(1));
    emitter.on("evt", () => results.push(2));
    emitter.emit("evt");
    expect(results).toEqual([1, 2]);
  });

  it("removes listener with off", () => {
    const emitter = new EventEmitter();
    const results: string[] = [];
    const fn = (msg: string) => results.push(msg);
    emitter.on("test", fn);
    emitter.emit("test", "a");
    emitter.off("test", fn);
    emitter.emit("test", "b");
    expect(results).toEqual(["a"]);
  });

  it("once listener fires only once", () => {
    const emitter = new EventEmitter();
    let count = 0;
    emitter.once("ping", () => count++);
    emitter.emit("ping");
    emitter.emit("ping");
    expect(count).toBe(1);
  });

  it("removeAllListeners removes all for specific event", () => {
    const emitter = new EventEmitter();
    let count = 0;
    emitter.on("a", () => count++);
    emitter.on("b", () => count++);
    emitter.removeAllListeners("a");
    emitter.emit("a");
    emitter.emit("b");
    expect(count).toBe(1);
  });

  it("removeAllListeners with no arg clears everything", () => {
    const emitter = new EventEmitter();
    let count = 0;
    emitter.on("a", () => count++);
    emitter.on("b", () => count++);
    emitter.removeAllListeners();
    emitter.emit("a");
    emitter.emit("b");
    expect(count).toBe(0);
  });

  it("supports typed events", () => {
    type Events = { "add": (a: number, b: number) => void };
    const emitter = new EventEmitter<Events>();
    let result = 0;
    emitter.on("add", (a, b) => { result = a + b; });
    emitter.emit("add", 3, 4);
    expect(result).toBe(7);
  });
});
