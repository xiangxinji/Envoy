import { Server } from "../server/server.js";
import type { ServerOptions } from "../server/server.js";
import { EventEmitter } from "../core/event-emitter.js";
import type { Message } from "../core/message.js";
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
  private roles = new Map<string, "leader" | "member">();

  constructor(options: TeamOptions) {
    super();
    const { ...serverOpts } = options;
    this.server = new Server(serverOpts as ServerOptions);
    this.setupHandlers();
  }

  async start(): Promise<void> {
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
      if (msg.type !== "message" || msg.to !== "server") return;
      this.handleTeamMessage(clientId, msg);
    });
    this.server.on("client:offline", ({ id }) => {
      this.roles.delete(id);
      this.broadcastMembers();
    });
  }

  private handleTeamMessage(clientId: string, msg: Message): void {
    switch (msg.subtype) {
      case "team:join":
        this.handleJoin(clientId, msg.payload as TeamJoinPayload);
        break;
    }
  }

  broadcastChat(fromId: string, subtype: string, payload: unknown): void {
    for (const [clientId] of this.roles) {
      if (clientId === fromId) continue;
      this.server.relay(fromId, clientId, subtype, payload);
    }
  }

  getOnlineMemberIds(): string[] {
    return [...this.roles.keys()];
  }

  private broadcastMembers(): void {
    const members = [...this.roles.entries()].map(([id, role]) => ({
      id,
      role,
      status: "online" as const,
    }));
    for (const [clientId] of this.roles) {
      this.server.notify(clientId, "team:members", { members });
    }
  }

  private handleJoin(clientId: string, payload: TeamJoinPayload): void {
    this.roles.set(clientId, payload.role);
    if (payload.role === "leader") {
      this.emit("leader:joined", clientId);
    } else {
      this.emit("member:joined", clientId);
    }
    this.broadcastMembers();
  }




}
