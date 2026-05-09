import { describe, it, expect } from "vitest";
import { createMessage, serializeMessage, deserializeMessage } from "../../packages/core/message.js";

describe("createMessage", () => {
  it("creates message with required fields", () => {
    const msg = createMessage("submit", "client-a", "server", { content: "hello" });
    expect(msg.type).toBe("submit");
    expect(msg.from).toBe("client-a");
    expect(msg.to).toBe("server");
    expect(msg.payload).toEqual({ content: "hello" });
    expect(msg.id).toBeDefined();
    expect(msg.timestamp).toBeTypeOf("number");
  });

  it("creates message with subtype and replyTo", () => {
    const msg = createMessage("message", "a", "b", "data", {
      subtype: "chat",
      replyTo: "msg-123",
    });
    expect(msg.subtype).toBe("chat");
    expect(msg.replyTo).toBe("msg-123");
  });

  it("generates unique IDs", () => {
    const a = createMessage("heartbeat", "a", "server", {});
    const b = createMessage("heartbeat", "a", "server", {});
    expect(a.id).not.toBe(b.id);
  });
});

describe("serializeMessage / deserializeMessage", () => {
  it("round-trips a message", () => {
    const original = createMessage("dispatch", "server", "client-1", { taskId: "t1" });
    const json = serializeMessage(original);
    const restored = deserializeMessage(json);
    expect(restored).toEqual(original);
  });

  it("preserves subtype and replyTo", () => {
    const original = createMessage("message", "a", "b", "hi", {
      subtype: "chat",
      replyTo: "r1",
    });
    const restored = deserializeMessage(serializeMessage(original));
    expect(restored.subtype).toBe("chat");
    expect(restored.replyTo).toBe("r1");
  });
});
