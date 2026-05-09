import { Client } from "../client/client.js";
import type { LeaderOptions } from "./types.js";

export class Leader extends Client {

  constructor(options: LeaderOptions) {
    super(options);
  }

  override async connect(): Promise<void> {
    await super.connect();
    this.send("team:join", { role: "leader" });
  }
}
