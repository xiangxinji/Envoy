import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Team } from "../../packages/teams/team.js";
import { Leader } from "../../packages/teams/leader.js";
import { Member } from "../../packages/teams/member.js";
import type { ClientTask } from "../../packages/client/client.js";
import { waitFor } from "../helpers/waitFor.js";

const PORT = 9300;

describe("Team 集成测试", () => {
  let team: Team;
  let port: number;

  beforeEach(async () => {
    port = PORT + Math.floor(Math.random() * 100);
    team = new Team({ port, heartbeatTimeout: 60000 });
    await team.start();
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 100));
    await team.stop();
  });

  async function disconnectAll(...clients: Array<{ disconnect: () => void }>) {
    for (const c of clients) {
      c.disconnect();
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  function createLeader(id: string): Leader {
    return new Leader({ id, servers: [`ws://localhost:${port}`], reconnect: false, heartbeatInterval: 60000 });
  }

  function createMember(id: string): Member {
    return new Member({ id, servers: [`ws://localhost:${port}`], reconnect: false, heartbeatInterval: 60000 });
  }

  it("Leader 连接触发 leader:joined 事件", async () => {
    const joined = new Promise<string>((resolve) => {
      team.on("leader:joined", (id) => resolve(id));
    });

    const leader = createLeader("lead-1");
    await leader.connect();

    const id = await joined;
    expect(id).toBe("lead-1");
    expect(team.getOnlineMemberIds()).toContain("lead-1");

    await disconnectAll(leader);
  });

  it("Member 连接触发 member:joined 事件", async () => {
    const joined = new Promise<string>((resolve) => {
      team.on("member:joined", (id) => resolve(id));
    });

    const member = createMember("mem-1");
    await member.connect();

    const id = await joined;
    expect(id).toBe("mem-1");

    await disconnectAll(member);
  });

  it("team:members 广播给所有在线成员", async () => {
    const leader = createLeader("lead-2");
    const member1 = createMember("mem-2a");
    const member2 = createMember("mem-2b");

    const membersNotifications: unknown[][] = [];
    leader.on("notify", (msg: any) => {
      if (msg.subtype === "team:members") membersNotifications.push(msg.payload.members);
    });

    await leader.connect();
    await member1.connect();
    await member2.connect();

    await waitFor(() => {
      const last = membersNotifications[membersNotifications.length - 1];
      return last && (last as any[]).length === 3 ? last : undefined;
    });

    const lastNotif = membersNotifications[membersNotifications.length - 1] as any[];
    const ids = lastNotif.map((m: any) => m.id).sort();
    expect(ids).toEqual(["lead-2", "mem-2a", "mem-2b"]);

    await disconnectAll(leader, member1, member2);
  });

  it("成员离线后 roles 被清理", async () => {
    const leader = createLeader("lead-3");
    const member = createMember("mem-3");

    await leader.connect();
    await member.connect();

    await waitFor(() => team.getOnlineMemberIds().length >= 2 ? true : undefined);
    expect(team.getOnlineMemberIds()).toContain("mem-3");

    member.disconnect();

    await waitFor(() => {
      const ids = team.getOnlineMemberIds();
      return ids.includes("mem-3") ? undefined : true;
    });

    expect(team.getOnlineMemberIds()).not.toContain("mem-3");

    await disconnectAll(member, leader);
  });

  it("完整 Team 任务流程：submit → execute → review → complete", async () => {
    const leader = createLeader("lead-flow");
    const member = createMember("mem-flow");

    // Leader 处理 review
    leader.reviewing(async (ct: ClientTask) => {
      leader.review(ct.serverTask.id, true, "leader approved");
    });

    // Member 处理执行
    member.doing(async (ct: ClientTask) => {
      const result = `member did: ${ct.serverTask.content}`;
      member.sendResult(ct.serverTask.id, true, result);
      return result;
    });

    await leader.connect();
    await member.connect();

    await waitFor(() => team.getOnlineMemberIds().length >= 2 ? true : undefined);

    // Leader 提交任务给 member
    leader.submit({
      content: "do something",
      subscribe: ["mem-flow"],
      mode: "serial",
    });

    const completed = await waitFor(() => {
      const task = team.innerServer.getAllTasks().find((t) => t.status === "completed");
      return task;
    }, 5000);

    expect(completed).toBeDefined();
    expect(completed.status).toBe("completed");
    expect(completed.createBy).toBe("lead-flow");
    expect(completed.subscribe).toEqual(["mem-flow"]);

    const workerResult = completed.resources.find((r) => r.type === "client-result");
    expect(workerResult).toBeDefined();
    expect(workerResult!.data).toBe("member did: do something");

    const reviewResource = completed.resources.find((r) => r.type === "leader-review");
    expect(reviewResource).toBeDefined();

    await disconnectAll(leader, member);
  });

  it("broadcastChat 向所有其他成员中转消息", async () => {
    const leader = createLeader("lead-chat");
    const member1 = createMember("mem-chat1");
    const member2 = createMember("mem-chat2");

    const member1Chat: unknown[] = [];
    const member2Chat: unknown[] = [];

    member1.on("message", (msg: any) => {
      if (msg.subtype === "chat") member1Chat.push(msg);
    });
    member2.on("message", (msg: any) => {
      if (msg.subtype === "chat") member2Chat.push(msg);
    });

    await leader.connect();
    await member1.connect();
    await member2.connect();

    await waitFor(() => team.getOnlineMemberIds().length >= 3 ? true : undefined);

    team.broadcastChat("lead-chat", "chat", { text: "hello team" });

    await waitFor(() => member1Chat.length > 0 && member2Chat.length > 0 ? true : undefined);

    expect(member1Chat).toHaveLength(1);
    expect(member2Chat).toHaveLength(1);
    expect((member1Chat[0] as any).payload.text).toBe("hello team");
    expect((member2Chat[0] as any).payload.text).toBe("hello team");

    await disconnectAll(leader, member1, member2);
  });
});
