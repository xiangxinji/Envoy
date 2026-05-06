export interface ParamDef {
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  required?: boolean;
  default?: unknown;
}

export interface CapabilityDefinition {
  name: string;
  description: string;
  params: Record<string, ParamDef>;
  mode: "queue" | "preemptive";
  priority: number;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}
