import { describe, it, expect } from "vitest";
import {
  EnvoyError,
  ConnectionError,
  TimeoutError,
  TaskError,
} from "../../packages/core/errors.js";

describe("Error types", () => {
  it("EnvoyError has name and code", () => {
    const err = new EnvoyError("test", "TEST_CODE");
    expect(err.message).toBe("test");
    expect(err.code).toBe("TEST_CODE");
    expect(err.name).toBe("EnvoyError");
    expect(err).toBeInstanceOf(Error);
  });

  it("ConnectionError has correct defaults", () => {
    const err = new ConnectionError("conn failed");
    expect(err.code).toBe("CONNECTION_ERROR");
    expect(err.name).toBe("ConnectionError");
    expect(err).toBeInstanceOf(EnvoyError);
  });

  it("TimeoutError includes task info", () => {
    const err = new TimeoutError("task-1", 5000);
    expect(err.message).toContain("task-1");
    expect(err.message).toContain("5000");
    expect(err.code).toBe("TIMEOUT");
    expect(err).toBeInstanceOf(EnvoyError);
  });

  it("TaskError has correct code", () => {
    const err = new TaskError("bad task");
    expect(err.code).toBe("TASK_ERROR");
    expect(err.name).toBe("TaskError");
    expect(err).toBeInstanceOf(EnvoyError);
  });
});
