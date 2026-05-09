import { createMessage } from "../core/message.js";
import type { Message } from "../core/message.js";

export interface HeartbeatPayload {
  queueLength: number;
  running: boolean;
  uptime: number;
}

export type GetHeartbeatData = () => HeartbeatPayload;
export type SendFn = (msg: Message) => void;

export class Heartbeat {
  private timer: ReturnType<typeof setInterval> | null = null;
  private startTime = Date.now();

  constructor(
    private clientId: string,
    private send: SendFn,
    private getData: GetHeartbeatData,
    private interval: number = 10000
  ) {}

  start(): void {
    this.startTime = Date.now();
    this.timer = setInterval(() => this.tick(), this.interval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    const data = this.getData();
    const msg = createMessage("heartbeat", this.clientId, "server", {
      ...data,
      uptime: Date.now() - this.startTime,
    });
    try {
      this.send(msg);
    } catch {
      // transport will handle reconnection
    }
  }
}
