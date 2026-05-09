import { Server } from "../server/server.js";
import type { ServerOptions } from "../server/server.js";
import { EventEmitter } from "../core/event-emitter.js";
import type { Message } from "../core/message.js";
import fs from "node:fs";
import path from "node:path";
import type {

  TeamJoinPayload,
  TeamOptions,
} from "./types.js";

export type TeamEvents = {
  "leader:joined": (clientId: string) => void;
  "member:joined": (clientId: string) => void;
};

export class Team extends EventEmitter<TeamEvents> {
  private server: Server;
  private resourceRoot: string;
  private roles = new Map<string, "leader" | "member">();

  constructor(options: TeamOptions) {
    super();
    const { resourceRoot = "resources", ...serverOpts } = options;
    this.resourceRoot = path.resolve(resourceRoot);
    this.server = new Server(serverOpts as ServerOptions);
    this.setupHandlers();
  }

  async start(): Promise<void> {
    fs.mkdirSync(this.resourceRoot, { recursive: true });
    await this.server.start();
  }

  async stop(): Promise<void> {
    await this.server.stop();
  }

  get innerServer(): Server {
    return this.server;
  }

  // --- 内部消息路由 ---

  private setupHandlers(): void {
    this.server.on("message", (clientId, msg) => {
      if (msg.type !== "message") return;

      // 转发非 server 目标的 message 给目标 Client
      if (msg.to !== "server") {
        this.server.notify(msg.to, msg.subtype ?? "", msg.payload);
        return;
      }

      this.handleTeamMessage(clientId, msg);
    });
    this.server.on("client:offline", ({ id }) => {
      this.roles.delete(id);
    });
  }

  private handleTeamMessage(clientId: string, msg: Message): void {
    switch (msg.subtype) {
      case "team:join":
        this.handleJoin(clientId, msg.payload as TeamJoinPayload);
        break;
    }
  }

  private handleJoin(clientId: string, payload: TeamJoinPayload): void {
    this.roles.set(clientId, payload.role);
    if (payload.role === "leader") {
      this.emit("leader:joined", clientId);
    } else {
      this.emit("member:joined", clientId);
    }
  }




}
