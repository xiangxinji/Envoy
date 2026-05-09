import { Client } from "../client/client.js";
import type {   MemberOptions } from "./types.js";

export class Member extends Client {


  constructor(options: MemberOptions) {
    super(options);
  }

  override async connect(): Promise<void> {
    await super.connect();
    this.send("team:join", { role: "member" });
  }

 
}
