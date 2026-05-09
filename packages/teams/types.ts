import type { ClientOptions } from "../client/index.js";


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
