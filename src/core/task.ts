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

export type TaskHistoryEntry =
  | { type: "created"; at: number; by: string }
  | { type: "dispatched"; at: number; to: string }
  | { type: "started"; at: number; by: string }
  | { type: "progress"; at: number; by: string; step: string | number; progress: number; message?: string }
  | { type: "completed"; at: number; by: string; result: TaskResult }
  | { type: "failed"; at: number; by: string; error: string };

export interface TaskRecord {
  id: string;
  name: string;
  params: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  initiator: string;
  createdAt: number;
  history: TaskHistoryEntry[];
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
