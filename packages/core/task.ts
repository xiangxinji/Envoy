export type TaskMode = "serial" | "parallel";
export type TaskStatus = "pending" | "running" | "reviewing" | "completed" | "failed";

export interface Resource {
  type: string;
  by: string;
  data: unknown;
  attempt: number;
}

export interface Task {
  id: string;
  createBy: string;
  subscribe: string[];
  content: string;
  mode: TaskMode;
  status: TaskStatus;
  resources: Resource[];
  createdAt: number;
  attempt: number;
}

export interface SubmitOptions {
  content: string;
  subscribe: string[];
  mode: TaskMode;
}
