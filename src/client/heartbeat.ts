import { createMessage } from "../core/message.js";

/** 心跳数据载荷 */
export interface HeartbeatPayload {
  /** 任务队列长度 */
  queueLength: number;
  /** 当前正在执行的任务 */
  running?: {
    /** 任务 ID */
    taskId: string;
    /** 任务名称 */
    taskName: string;
    /** 任务进度 */
    progress?: number;
  };
  /** 客户端运行时长（毫秒） */
  uptime: number;
  /** 内存使用量（字节） */
  memoryUsage?: number;
}

/** 获取心跳数据的函数类型 */
export type GetHeartbeatData = () => HeartbeatPayload;
/** 消息发送函数类型 */
export type SendFn = (msg: import("../core/message.js").Message) => void;

/**
 * 心跳管理器
 * 定期向服务端发送心跳包，报告客户端状态
 */
export class Heartbeat {
  private timer: ReturnType<typeof setInterval> | null = null;
  private startTime = Date.now();

  /** 创建心跳管理器实例 */
  constructor(
    private clientId: string,
    private send: SendFn,
    private getData: GetHeartbeatData,
    private interval: number = 10000
  ) {}

  /** 启动心跳定时器 */
  start(): void {
    this.startTime = Date.now();
    this.timer = setInterval(() => this.tick(), this.interval);
  }

  /** 停止心跳定时器 */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 发送心跳包 */
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
