import { Client } from "./client.js";
import type { ClientOptions } from "./client.js";
import { createMessage } from "../core/message.js";

/**
 * 观察者客户端
 * 以普通 Client 身份连接服务端，但不注册能力、不执行任务
 * 连接后通知服务端自己是 watcher，接收所有状态变更通知
 */
export class WatcherClient extends Client {
  constructor(options: ClientOptions) {
    super(options);
  }

  protected override sendRegister(): void {
    const msg = createMessage("register", this.options.id, "server", {
      watcher: true,
      capabilities: [],
    });
    this.transport.send(msg);
  }
}
