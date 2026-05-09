import type { ClientOptions } from "../src/client/index.js";

/** 资源变更事件 */
export interface ResourceChangedEvent {
  action: "created" | "updated" | "deleted";
  path: string;
}

/** 资源列表查询 */
export interface ResourceListPayload {
  queryId: string;
  type: "list";
}

/** 资源内容查询 */
export interface ResourceGetPayload {
  queryId: string;
  type: "get";
  path: string;
}

/** 资源查询结果 */
export interface ResourceQueryResult {
  queryId: string;
  success: boolean;
  paths?: string[];
  content?: string;
  error?: string;
}

/** 资源注册请求 */
export interface ResourceRegisterPayload {
  operationId: string;
  path: string;
  content: string;
}

/** 资源删除请求 */
export interface ResourceDeletePayload {
  operationId: string;
  path: string;
}

/** 资源操作确认 */
export interface ResourceAck {
  operationId: string;
  success: boolean;
  error?: string;
}

/** 角色声明 */
export interface TeamJoinPayload {
  role: "leader" | "member";
}

/** Team 配置选项 */
export interface TeamOptions {
  port: number;
  host?: string;
  resourceRoot?: string;
  heartbeatTimeout?: number;
  defaultTaskTimeout?: number;
}

/** Leader 配置选项 */
export type LeaderOptions = ClientOptions;

/** Member 配置选项 */
export type MemberOptions = ClientOptions;
