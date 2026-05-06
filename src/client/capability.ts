import type { CapabilityDefinition, ParamDef } from "../core/capability.js";

export interface CapabilityRegistration {
  name: string;
  description: string;
  params: Record<string, ParamDef>;
  mode: "queue" | "preemptive";
  priority: number;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  execute: AsyncExecuteFn | GeneratorExecuteFn;
}

export type TaskContext = {
  params: Record<string, unknown>;
  report: (progress: { step: string | number; progress: number; message?: string }) => void;
  execute: (taskName: string, params: Record<string, unknown>) => Promise<unknown>;
};

export type AsyncExecuteFn = (ctx: TaskContext) => Promise<unknown>;
export type GeneratorExecuteFn = (ctx: TaskContext) => Generator<unknown, unknown, unknown>;

export function toDefinition(reg: CapabilityRegistration): CapabilityDefinition {
  return {
    name: reg.name,
    description: reg.description,
    params: reg.params,
    mode: reg.mode,
    priority: reg.priority,
    timeout: reg.timeout,
    maxRetries: reg.maxRetries,
    retryDelay: reg.retryDelay,
  };
}
