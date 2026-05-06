import type { Message } from "../core/message.js";

export type SendFn = (clientId: string, message: Message) => void;

export class MessageRouter {
  // pending request tracking: messageId → { from, timer }
  private pendingRequests = new Map<
    string,
    { from: string; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(private send: SendFn) {}

  route(message: Message): void {
    this.send(message.to, message);
  }

  trackRequest(requestId: string, from: string, timeout: number, onTimeout: () => void): void {
    const timer = setTimeout(() => {
      this.pendingRequests.delete(requestId);
      onTimeout();
    }, timeout);
    this.pendingRequests.set(requestId, { from, timer });
  }

  resolveRequest(requestId: string): string | undefined {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return undefined;
    clearTimeout(pending.timer);
    this.pendingRequests.delete(requestId);
    return pending.from;
  }

  cancelRequest(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(requestId);
    }
  }

  cancelAll(): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
    }
    this.pendingRequests.clear();
  }
}
