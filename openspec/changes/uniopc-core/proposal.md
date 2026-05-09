# Envoy Core Framework

## Problem

团队内部需要一个轻量级的分布式任务调度框架，让不同的 Node.js 服务节点之间能够互相发现、通信和协作。目前没有现成的工具能很好地满足"能力注册 + 自动派发 + 远程调用"这一组合需求。

## Solution

构建 Envoy —— 一个基于 WebSocket 的 Client/Server 任务调度框架，灵感来源于工业产线的中控调度模式（中心化控制，去中心化执行）。单包发布，通过 subpath exports 区分 server 和 client：

- **envoy/server**: 管理 Client 连接、维护能力注册表、调度任务、路由消息
- **envoy/client**: 连接 Server、注册能力、执行任务、管理本地队列
- 内部共享层（core）: 消息协议、任务定义、能力定义、优先级队列、事件系统

核心交互模式：Client 注册能力 → Server 感知状态 → 自动派发任务 → 结果回传。

## Key Design Decisions

1. **传输层**: WebSocket，双向通信，穿透防火墙
2. **能力注册**: Client 自注册能力（名字 + 描述 + 参数），Server 不关心实现细节
3. **任务执行**: 注册方法调用，Client 决定怎么执行
4. **Client-to-Client**: 必须经 Server 中转，框架层面强制约束，Client 之间无直接连接的能力
5. **任务队列**: Client 和 Server 各自维护任务队列
6. **执行模式**:
   - `queue` — 排队模式，按优先级顺序执行
   - `preemptive` — 插队模式，Generator 步骤边界协作式挂起
7. **优先级**: 数字越大越优先，同优先级 FIFO，per-task 可配置超时和重试
8. **结果结构**: 固定格式 `{ success: boolean, data?, error?, duration }`
9. **任务进度上报**: 任务执行过程中 Client 实时上报进度（步骤、百分比），Server 全程可见
10. **心跳携带状态**: 心跳不只是 ping/pong，携带队列长度、当前任务、进度等状态信息
11. **一切行为皆上报**: 框架层面保证所有行为自动上报 Server，业务代码无需手动调用
12. **多 Server**: Client 可连多个 Server，对等且隔离
13. **幂等性**: 框架不管，业务代码自行保证
14. **代码复用**: 单包内 core 目录共享（消息、任务、能力、队列、事件）

## Non-goals

- 不做服务发现/注册中心（不是 Consul/Nacos）
- 不做消息队列持久化（不是 RabbitMQ/Kafka）
- 不做浏览器端 Client（纯 Node.js）
- 不做任务幂等性保证（由业务代码负责）
- 不做 Server 间通信（各 Server 独立）

## Scope

- @envoy/core 共享层（消息协议、任务定义、能力定义、优先级队列、事件系统）
- WebSocket 传输层封装
- 心跳保活 + 携带状态信息（队列长度、当前任务、进度）
- 能力注册与查询
- 任务派发（自动选择空闲 Client）
- 任务队列（优先级 + 排队/插队）
- Generator 协作式挂起/恢复
- 任务进度实时上报（框架自动，非业务代码手动）
- 超时 + 可配置重试
- Client-to-Client 经 Server 中转（框架层面强制）
- Server 主动推送消息（带类型）
- 结构化结果回传
- 框架强制约束：一切行为皆上报，Server 是唯一网关

## Package Structure

```
envoy (单包，subpath exports)

envoy/
├── src/
│   ├── core/              # 内部共享，不直接暴露
│   │   ├── index.ts
│   │   ├── message.ts
│   │   ├── task.ts
│   │   ├── capability.ts
│   │   ├── queue.ts
│   │   ├── event-emitter.ts
│   │   └── errors.ts
│   │
│   ├── server/            # import { Server } from "envoy/server"
│   │   ├── index.ts
│   │   ├── server.ts
│   │   ├── connection-manager.ts
│   │   ├── capability-registry.ts
│   │   ├── task-dispatcher.ts
│   │   └── message-router.ts
│   │
│   ├── client/            # import { Client } from "envoy/client"
│   │   ├── index.ts
│   │   ├── client.ts
│   │   ├── heartbeat.ts
│   │   ├── task-queue.ts
│   │   └── task-executor.ts
│   │
│   └── index.ts
│
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

## API Preview

### Server

```typescript
const server = new Server({ port: 8080 });

server.on("client:online", (client) => {});
server.on("client:offline", (client) => {});
server.on("task:progress", (taskId, progress) => {
  // { step: "building", progress: 60 }
});

// 自动选空闲 Client
const result = await server.executeAny("deploy", { env: "prod" });

// 指定 Client
const result = await server.executeTo("c1", "deploy", { env: "prod" });

// 主动推送
server.notify("c1", "config_changed", { newConfig: {} });

// 查询 Client 状态（来自心跳上报）
const c1 = server.getClient("c1");
c1.status;         // "online" | "offline" | "busy"
c1.queueLength;    // 3
c1.currentTask;    // { taskId, taskName, progress }
```

### Client

```typescript
const client = new Client({
  id: "c1",
  servers: ["ws://server1:8080"],
});

// queue 模式
client.register("build", {
  description: "构建项目",
  params: { target: { type: "string", required: true } },
  mode: "queue",
  priority: 1,
  execute: async (ctx) => {
    // ctx.report() 进度上报，框架自动发送给 Server
    ctx.report({ step: "compiling", progress: 50 });
    return { success: true, data: result };
  }
});

// preemptive 模式
client.register("deploy", {
  description: "部署服务",
  params: { env: { type: "string", required: true } },
  mode: "preemptive",
  priority: 5,
  timeout: 60000,
  maxRetries: 2,
  execute: function* (ctx) {
    yield pullCode(ctx.params.repo);    // yield = 步骤边界，框架自动上报
    yield build(ctx.params.env);
    return { success: true };
  }
});

// Client 调用其他 Client（经 Server 自动路由）
const result = await client.execute("test", { input: "hello" });

await client.connect();
```

## Risks

- Generator 协作式挂起的边界情况（步骤中间的状态一致性）
- WebSocket 断线重连时的任务状态恢复
- 心跳携带状态的频率与性能平衡（太频繁浪费带宽，太稀疏状态不准）
