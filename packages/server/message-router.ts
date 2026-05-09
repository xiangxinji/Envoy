import type { Message } from "../core/message.js";

/** 消息发送函数类型 */
export type SendFn = (clientId: string, message: Message) => void;

/**
 * 消息路由器
 * 负责消息转发和请求跟踪
 */
export class MessageRouter {
  /** 待处理请求跟踪表：消息 ID → { 来源客户端, 超时定时器 } */
  private pendingRequests = new Map<
    string,
    { from: string; timer: ReturnType<typeof setTimeout> }
  >();

  /** 创建消息路由器实例 */
  constructor(private send: SendFn) {}

  /** 路由消息到目标客户端 */
  route(message: Message): void {
    this.send(message.to, message);
  }

  /** 跟踪请求，设置超时回调 */
  trackRequest(requestId: string, from: string, timeout: number, onTimeout: () => void): void {
    const timer = setTimeout(() => {
      this.pendingRequests.delete(requestId);
      onTimeout();
    }, timeout);
    this.pendingRequests.set(requestId, { from, timer });
  }

  /** 解析请求，返回来源客户端 ID */
  resolveRequest(requestId: string): string | undefined {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return undefined;
    clearTimeout(pending.timer);
    this.pendingRequests.delete(requestId);
    return pending.from;
  }

  /** 取消指定请求 */
  cancelRequest(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(requestId);
    }
  }

  /** 取消所有待处理请求 */
  cancelAll(): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
    }
    this.pendingRequests.clear();
  }
}
