export class EnvoyError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "EnvoyError";
  }
}

export class ConnectionError extends EnvoyError {
  constructor(message: string) {
    super(message, "CONNECTION_ERROR");
    this.name = "ConnectionError";
  }
}

export class TimeoutError extends EnvoyError {
  constructor(taskId: string, timeout: number) {
    super(`Task ${taskId} timed out after ${timeout}ms`, "TIMEOUT");
    this.name = "TimeoutError";
  }
}

export class TaskError extends EnvoyError {
  constructor(message: string) {
    super(message, "TASK_ERROR");
    this.name = "TaskError";
  }
}
