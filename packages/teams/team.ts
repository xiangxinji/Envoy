import { Server } from "../server/server.js";
import type { ServerOptions } from "../server/server.js";
import { EventEmitter } from "../core/event-emitter.js";
import type { Message } from "../core/message.js";
import fs from "node:fs";
import path from "node:path";
import type {
  ResourceChangedEvent,
  ResourceListPayload,
  ResourceGetPayload,
  ResourceRegisterPayload,
  ResourceDeletePayload,
  ResourceAck,
  ResourceQueryResult,
  TeamJoinPayload,
  TeamOptions,
} from "./types.js";

export type TeamEvents = {
  "leader:joined": (clientId: string) => void;
  "member:joined": (clientId: string) => void;
  "resource:changed": (event: ResourceChangedEvent) => void;
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
      case "resource:register":
        this.handleResourceRegister(clientId, msg.payload as ResourceRegisterPayload);
        break;
      case "resource:delete":
        this.handleResourceDelete(clientId, msg.payload as ResourceDeletePayload);
        break;
      case "resource:query":
        this.handleResourceQuery(clientId, msg.payload as ResourceListPayload | ResourceGetPayload);
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

  // --- 路径校验 ---

  private validatePath(resourcePath: string): string {
    if (!resourcePath || resourcePath.includes("\0")) {
      throw new Error("Invalid path");
    }
    if (path.isAbsolute(resourcePath)) {
      throw new Error("Absolute paths not allowed");
    }
    const resolved = path.resolve(this.resourceRoot, resourcePath);
    if (resolved !== this.resourceRoot && !resolved.startsWith(this.resourceRoot + path.sep)) {
      throw new Error("Path traversal not allowed");
    }
    return resolved;
  }

  // --- 资源操作处理 ---

  private handleResourceRegister(clientId: string, payload: ResourceRegisterPayload): void {
    if (this.roles.get(clientId) !== "leader") {
      this.sendAck(clientId, payload.operationId, false, "Only leaders can register resources");
      return;
    }
    try {
      const fullPath = this.validatePath(payload.path);
      const exists = fs.existsSync(fullPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, payload.content, "utf-8");

      this.sendAck(clientId, payload.operationId, true);
      this.broadcastResourceChange(exists ? "updated" : "created", payload.path);
    } catch (err: any) {
      this.sendAck(clientId, payload.operationId, false, err.message);
    }
  }

  private handleResourceDelete(clientId: string, payload: ResourceDeletePayload): void {
    if (this.roles.get(clientId) !== "leader") {
      this.sendAck(clientId, payload.operationId, false, "Only leaders can delete resources");
      return;
    }
    try {
      const fullPath = this.validatePath(payload.path);
      if (!fs.existsSync(fullPath)) {
        this.sendAck(clientId, payload.operationId, true);
        return;
      }
      fs.unlinkSync(fullPath);
      this.sendAck(clientId, payload.operationId, true);
      this.broadcastResourceChange("deleted", payload.path);
    } catch (err: any) {
      this.sendAck(clientId, payload.operationId, false, err.message);
    }
  }

  private handleResourceQuery(clientId: string, payload: ResourceListPayload | ResourceGetPayload): void {
    if (payload.type === "list") {
      this.handleResourceList(clientId, payload.queryId);
    } else {
      this.handleResourceGet(clientId, payload as ResourceGetPayload);
    }
  }

  private handleResourceList(clientId: string, queryId: string): void {
    try {
      const paths: string[] = [];
      if (fs.existsSync(this.resourceRoot)) {
        this.walkDir(this.resourceRoot, paths);
      }
      this.sendQueryResult(clientId, queryId, true, { paths });
    } catch (err: any) {
      this.sendQueryResult(clientId, queryId, false, { error: err.message });
    }
  }

  private handleResourceGet(clientId: string, payload: ResourceGetPayload): void {
    try {
      const fullPath = this.validatePath(payload.path);
      if (!fs.existsSync(fullPath)) {
        this.sendQueryResult(clientId, payload.queryId, false, { error: "Resource not found" });
        return;
      }
      const content = fs.readFileSync(fullPath, "utf-8");
      this.sendQueryResult(clientId, payload.queryId, true, { content });
    } catch (err: any) {
      this.sendQueryResult(clientId, payload.queryId, false, { error: err.message });
    }
  }

  // --- 文件系统辅助 ---

  private walkDir(dir: string, results: string[]): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.walkDir(fullPath, results);
      } else if (entry.isFile()) {
        results.push(path.relative(this.resourceRoot, fullPath).replace(/\\/g, "/"));
      }
    }
  }

  // --- 响应辅助 ---

  private sendAck(clientId: string, operationId: string, success: boolean, error?: string): void {
    const ack: ResourceAck = { operationId, success, error };
    this.server.notify(clientId, "resource:ack", ack);
  }

  private sendQueryResult(
    clientId: string,
    queryId: string,
    success: boolean,
    data: { paths?: string[]; content?: string; error?: string }
  ): void {
    const result: ResourceQueryResult = { queryId, success, ...data };
    this.server.notify(clientId, "resource:query-result", result);
  }

  private broadcastResourceChange(action: ResourceChangedEvent["action"], resourcePath: string): void {
    const event: ResourceChangedEvent = { action, path: resourcePath };
    for (const [clientId, role] of this.roles) {
      if (role === "member") {
        this.server.notify(clientId, "resource:changed", event);
      }
    }
    this.emit("resource:changed", event);
  }
}
