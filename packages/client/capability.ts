import type { CapabilityDefinition, ParamDef } from "../core/capability.js";

/** 能力注册信息 */
export interface CapabilityRegistration {
  /** 能力名称 */
  name: string;
  /** 能力描述 */
  description: string;
  /** 参数定义 */
  params: Record<string, ParamDef>;
  /** 执行模式：队列模式或抢占模式 */
  mode: "queue" | "preemptive";
  /** 优先级，数值越高优先级越高 */
  priority: number;
  /** 执行超时时间（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟（毫秒） */
  retryDelay?: number;
  /** 执行函数 */
  execute: AsyncExecuteFn | GeneratorExecuteFn;
}

/** 任务执行上下文 */
export type TaskContext = {
  /** 任务参数 */
  params: Record<string, unknown>;
  /** 报告任务进度 */
  report: (progress: { step: string | number; progress: number; message?: string }) => void;
  /** 请求服务端执行其他任务 */
  execute: (taskName: string, params: Record<string, unknown>) => Promise<unknown>;
};

/** 异步执行函数类型 */
export type AsyncExecuteFn = (ctx: TaskContext) => Promise<unknown>;
/** 生成器执行函数类型（支持抢占） */
export type GeneratorExecuteFn = (ctx: TaskContext) => Generator<unknown, unknown, unknown>;

/** 将注册信息转换为能力定义 */
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
