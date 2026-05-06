export type TaskStatus = "pending" | "running" | "suspended" | "completed" | "failed";

export interface TaskDefinition {
  name: string;
  description: string;
  params: Record<string, unknown>;
  mode: "queue" | "preemptive";
  priority: number;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface TaskResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
}

export interface TaskProgress {
  taskId: string;
  step: string | number;
  progress: number;
  message?: string;
}

export interface TaskInstance {
  id: string;
  name: string;
  params: Record<string, unknown>;
  mode: "queue" | "preemptive";
  priority: number;
  status: TaskStatus;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  retryCount: number;
  createdAt: number;
  startedAt?: number;
  result?: TaskResult;
  progress?: TaskProgress;
}
