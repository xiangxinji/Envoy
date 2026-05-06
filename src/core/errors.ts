export class UniOpcError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "UniOpcError";
  }
}

export class ConnectionError extends UniOpcError {
  constructor(message: string) {
    super(message, "CONNECTION_ERROR");
    this.name = "ConnectionError";
  }
}

export class TimeoutError extends UniOpcError {
  constructor(taskId: string, timeout: number) {
    super(`Task ${taskId} timed out after ${timeout}ms`, "TIMEOUT");
    this.name = "TimeoutError";
  }
}

export class TaskError extends UniOpcError {
  constructor(message: string) {
    super(message, "TASK_ERROR");
    this.name = "TaskError";
  }
}
