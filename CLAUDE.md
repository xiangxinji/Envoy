# CLAUDE.md

Envoy 是一个基于 WebSocket 的任务调度通信框架。Server 作为纯中转调度中心，Client 通过 `submit` 发起任务、通过 `doing` 注册处理器、通过事件监听接收任务状态变更。

## Tech Stack

- **Runtime**: Node.js >= 18
- **Language**: TypeScript (strict mode)
- **Module System**: ESM (`"type": "module"` in package.json)
- **Target**: ES2022
- **Module Resolution**: Node16
- **WebSocket**: ws ^8.18.0

## Commands

```bash
npm run build        # 编译 TypeScript 到 dist/
npm run dev          # 监听模式编译
npm start            # 运行编译产物
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         packages/                                    │
│                                                                      │
│  ┌─── core/ ──────────────────────────────────────────────────────┐ │
│  │ 纯数据结构与工具，零业务逻辑，零 IO                              │ │
│  │                                                                 │ │
│  │  task.ts        Task / Resource / SubmitOptions / TaskMode      │ │
│  │  message.ts     Message 协议定义，序列化/反序列化                │ │
│  │  event-emitter.ts  类型安全 EventEmitter (on/off/emit/once)     │ │
│  │  queue.ts       通用 FIFO Queue<T>                              │ │
│  │  errors.ts      EnvoyError > ConnectionError / TimeoutError     │ │
│  │                  / TaskError                                    │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─── server/ ─────────────────── 纯中转，不碰业务 ───────────────┐ │
│  │                                                                 │ │
│  │  server.ts            Server 主类                               │ │
│  │    ├─ 任务创建: createTaskAndDispatch                           │ │
│  │    ├─ 两种分发: dispatchSerial / dispatchParallel               │ │
│  │    ├─ 结果处理: processResult                                   │ │
│  │    ├─ Leader 审核: dispatchToLeader (subtype:"review")          │ │
│  │    ├─ 重试机制: resetForRetry (max 10)                          │ │
│  │    ├─ 客户端离线: handleClientOffline                           │ │
│  │    ├─ 状态恢复: loadTaskStates + redispatchRestoredTasks        │ │
│  │    └─ 消息中转: relay / notify / handleMessage                  │ │
│  │                                                                 │ │
│  │  connection-manager.ts  客户端状态注册表 + 心跳超时检测          │ │
│  │  transport.ts           ServerTransport — WebSocket 服务端       │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─── client/ ─────────────────── 任务执行引擎 ───────────────────┐ │
│  │                                                                 │ │
│  │  client.ts            Client 主类                               │ │
│  │    ├─ doing(handler)   注册任务处理器                            │ │
│  │    ├─ submit(options)  发起任务                                  │ │
│  │    ├─ sendResult()     手动上报结果 (公开方法)                   │ │
│  │    ├─ send / sendTo    消息发送                                  │ │
│  │    └─ processNext()    串行队列：同一时间只执行一个 ClientTask    │ │
│  │                                                                 │ │
│  │  heartbeat.ts          定时心跳 (默认 10s)                       │ │
│  │  transport.ts          ClientTransport — WS 客户端 + 自动重连    │ │
│  │  watcher-client.ts     WatcherClient — 只读监控，继承 Client     │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─── teams/ ─────────────────── 角色协作层 ──────────────────────┐ │
│  │                                                                 │ │
│  │  team.ts      Team = Server + 角色注册表 + 成员列表广播         │ │
│  │  leader.ts    Leader extends Client — connect 后发 team:join    │ │
│  │  member.ts    Member extends Client — connect 后发 team:join    │ │
│  │  types.ts     TeamJoinPayload / TeamOptions                     │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  index.ts — 统一入口，重导出全部公开 API                             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 包导出

```
envoy                  → 主入口（重导出 server + client + teams）
envoy/server           → Server, ServerOptions, SerializedTaskState, ServerTransport
envoy/client           → Client, WatcherClient, ClientTask, TaskHandler, SKIP_RESULT, EXECUTION_TIMEOUT
envoy/co-work          → Team, Leader, Member, TeamOptions, LeaderOptions, MemberOptions
envoy/core/*           → Task, Message, Queue, EventEmitter, Errors
```

---

## 消息协议 (Message Protocol)

所有通信通过 `Message<T>` 结构传输，JSON 序列化。

### Message 结构

```ts
interface Message<T = unknown> {
  id: string;           // `${Date.now()}-${++counter}`
  type: MessageType;    // 消息类型
  subtype?: string;     // 子类型（用于区分 message/notify 的具体语义）
  from: string;         // 发送方 ID
  to: string;           // 接收方 ID（"server" 或 clientId）
  replyTo?: string;     // 回复的原始消息 ID
  payload: T;           // 消息体
  timestamp: number;
}
```

### 10 种 MessageType

| Type | 方向 | 用途 | payload |
|---|---|---|---|
| `submit` | Client → Server | 提交新任务 | `SubmitOptions` |
| `dispatch` | Server → Client | 分发任务给执行者 | `Task`（普通执行）或带 `subtype:"review"`（Leader 审核） |
| `result` | Client → Server | 上报执行结果 | `{ taskId, success, data?, error? }` |
| `task` | Server → Client/Watcher | 广播任务状态变更 | `Task` |
| `heartbeat` | Client → Server | 心跳（含队列状态） | `{ queueLength, running, uptime }` |
| `heartbeat_ack` | Server → Client | 心跳确认 | `{}` |
| `notify` | Server → Client | 服务端主动通知 | 由 `subtype` 决定 |
| `message` | 双向 | 通用消息（P2P 中转或 Team 广播） | 由 `subtype` 决定 |
| `error` | Server → Client | 服务端错误响应 | `{ message }` |

### 关键 subtype 值

| 消息类型 | subtype | 用途 |
|---|---|---|
| `dispatch` | `"review"` | Leader 审核分发，Client 端 `clientTask.reason === "review"` |
| `notify` | `"client:online"` | Watcher 收到客户端上线通知 |
| `notify` | `"client:offline"` | Watcher 收到客户端下线通知 |
| `notify` | `"team:members"` | Team 成员列表广播 |
| `message` | `"team:join"` | Leader/Member 连接后的角色声明 |

---

## 核心数据模型

### Task

```ts
// packages/core/task.ts
interface Task {
  id: string;              // `task-${Date.now()}-${counter}`
  createBy: string;        // 任务创建者（也是 Leader Review 的目标）
  subscribe: string[];     // 任务执行者列表
  content: string;         // 任务内容描述
  mode: TaskMode;          // "serial" | "parallel"
  status: TaskStatus;      // "pending" | "running" | "reviewing" | "completed" | "failed"
  resources: Resource[];   // 结果资源池
  createdAt: number;
  attempt: number;         // 当前尝试次数（重试时递增）
}
```

### Resource

```ts
interface Resource {
  type: string;    // "client-result" | "leader-review" | 自定义
  by: string;      // 产出者 clientId
  data: unknown;   // 具体数据
  attempt: number; // 对应 Task 的 attempt
  timestamp?: number;
}
```

### ClientTask（客户端本地包装）

```ts
// packages/client/client.ts
interface ClientTask {
  id: string;                       // `ct-${Date.now()}-${counter}`
  serverTask: Task;                 // 对应的 Server 端 Task
  reason: "execute" | "review";     // 任务用途：执行 或 Leader 审核
  result?: unknown;                 // handler 返回的结果
  error?: string;                   // handler 抛出的错误消息
  startedAt?: number;
  completedAt?: number;
}
```

---

## 任务生命周期

### 状态机

```
                        submit / submitFrom
                              │
                              ▼
                        ┌──────────┐
                 ┌──────│ pending  │◄───── resetForRetry
                 │      └────┬─────┘      (attempt ≤ 10)
                 │           │ dispatch
                 │           ▼
                 │      ┌──────────┐
                 │      │ running  │
                 │      └────┬─────┘
                 │           │
                 │     ┌─────┴───────────────┐
                 │     │                     │
                 │     ▼                     ▼
                 │  Member failed      全部 result 收齐
                 │     │                     │
                 │     ▼                     ▼
                 │  ┌────────┐         ┌───────────┐
                 │  │ failed │         │ reviewing │──dispatch(subtype:"review")──►Leader
                 │  └────────┘         └─────┬─────┘
                 │                           │
                 │                     ┌─────┴──────┐
                 │                     │            │
                 │                     ▼            ▼
                 │                 审核通过      审核失败
                 │                     │            │
                 │                     ▼            └──────── resetForRetry
                 │               ┌───────────┐     (retryCount ≤ 10)
                 └───────────────│ completed │     否则 → failed
                                 └───────────┘
```

### 两种调度模式

**Serial（串行）** — `subscribe: [A, B, C]`

```
dispatch A → result → dispatch B → result → dispatch C → result → Leader Review
```

- `serialIndex` 从 0 递增，逐个分发
- 当前 target 离线时不推进，等待重连
- 所有 target 完成后进入 Leader Review

**Parallel（并行）** — `subscribe: [A, B, C]`

```
dispatch A ─┐
dispatch B ─┤ 同时
dispatch C ─┘
全部 result 收齐 → Leader Review
```

- 所有在线 target 同时收到 dispatch
- 离线 target 保留在 `pendingClients` 中，重连后补发
- `pendingClients.size === 0` 时进入 Leader Review

### Leader Review 流程

1. 全部 member 执行完毕 → `dispatchToLeader()`
2. Server 设置 `leaderReviewing = true`，task 状态变为 `"reviewing"`
3. Server 向 `task.createBy` 发送 `dispatch` 消息（带 `subtype: "review"`）
4. Leader 的 Client 收到后创建 `ClientTask { reason: "review" }`
5. Leader handler 执行审核逻辑，手动调用 `client.sendResult()` 上报
6. Server 收到 result：
   - 成功 → `finishTask()` → `completed`
   - 失败 → `resetForRetry()`（重试上限 10 次）→ 超限则 `failed`

### 重试机制 (resetForRetry)

- 触发条件：Leader 审核失败 且 `retryCount < 10`
- 行为：重置 `pendingClients`、`serialIndex`、`leaderReviewing`，`attempt++`，状态回退到 `pending`，重新 dispatch

---

## Server 能力与边界

### Server 做什么

- 接受 WebSocket 连接，管理客户端注册表
- 接收 `submit` 消息创建 Task
- 按 `mode` 分发 dispatch 到 `subscribe` 列表中的客户端
- 收集 result，追加到 `task.resources`
- 全部 result 收齐后转发给 `createBy`（Leader）审核
- 广播 task 状态变更给所有相关方（createBy + subscribe + watchers）
- 中转 P2P 消息（`message` / `notify`）
- 心跳超时检测，清理离线客户端
- 客户端重连后重新分发未完成的 pending 任务

### Server 不做什么

- **不执行任何业务逻辑** — 任务内容对 Server 不透明
- **不持久化** — 全部状态在内存 `Map` 中，崩溃即丢失
- **不做权限控制** — 任何连接的客户端都可以 submit
- **不做消息路由的高级逻辑** — `message` 类型直接按 `msg.to` 转发
- **不追踪 Client 端执行进度** — 只知道 result 的有无

### 公开 API

```ts
class Server {
  // 生命周期
  start(): Promise<void>
  stop(): Promise<void>

  // 任务创建（外部调用）
  submitFrom(fromId, options): string           // 编程式提交，返回 taskId

  // 任务查询
  getTask(taskId): Task | undefined
  getTaskState(taskId): SerializedTaskState | null
  getAllTasks(): Task[]

  // 状态恢复
  loadTaskStates(entries): void                  // 批量加载持久化的 TaskState
  redispatchRestoredTasks(): void                // 重连后重新分发 pending/running 任务

  // 客户端查询
  getClient(clientId): ClientState | undefined
  getClients(): ClientState[]
  getOnlineClients(): ClientState[]

  // 消息
  notify(clientId, subtype, payload): void       // 向指定客户端发通知
  relay(fromId, toId, subtype, payload): void    // 中转 P2P 消息

  // 结果（外部调用）
  receiveResult(clientId, taskId, success, data?, error?): void
  addResourceToTask(taskId, type, by, data, notify?): void
  startTask(taskId): Task | null                 // 手动 pending → running

  // 事件
  on("task:created" | "task:updated" | "task:completed" | "task:failed", (task) => ...)
  on("client:online", (client: ClientState) => ...)
  on("client:offline", ({ id }) => ...)
  on("message", (clientId, msg) => ...)
}
```

---

## Client 能力与边界

### Client 做什么

- 管理 WebSocket 连接（含自动重连，指数退避最长 15s）
- 定时发送心跳（默认 10s）
- `submit()` 向 Server 提交任务
- `doing(handler)` 注册任务处理器
- 接收 dispatch 后创建 `ClientTask`，放入串行队列
- 逐个执行队列中的任务（同一时间只有一个 running）
- 通过事件暴露完整生命周期（queued → started → completed/failed/skipped → finished）
- 去重：同一 taskId 的旧 attempt 被新 attempt 覆盖（重试场景）
- `sendResult()` 手动上报执行结果给 Server

### Client 不做什么

- **不自动上报结果** — handler 执行完后不会自动 `sendResult`，消费方必须手动调用
- **不做并行执行** — 串行队列，同一时间只处理一个 ClientTask
- **不做任务优先级** — FIFO 顺序
- **不做持久化** — 断线后队列中的任务丢失（重连后由 Server 重新 dispatch）

### 特殊返回值

```ts
// handler 返回 SKIP_RESULT — 跳过此任务，不视为完成也不视为失败
import { SKIP_RESULT } from "envoy/client";
doing(async (task) => {
  if (shouldSkip) return SKIP_RESULT;
  return someResult;
});

// handler 返回 EXECUTION_TIMEOUT — 标记为执行超时失败
import { EXECUTION_TIMEOUT } from "envoy/client";
```

### 公开 API

```ts
class Client {
  // 生命周期
  connect(): Promise<void>
  disconnect(): void

  // 任务提交
  submit(options: SubmitOptions): void

  // 任务处理
  doing(fn: TaskHandler): void

  // 结果上报（手动调用）
  sendResult(taskId, success, data?, error?): void

  // 消息发送
  send(subtype, payload): void              // → server
  sendTo(targetId, subtype, payload): void  // → 指定客户端

  // 状态查询
  get queueLength(): number
  get currentTask(): ClientTask | null
  get taskQueue(): readonly ClientTask[]
  get taskHistory(): readonly ClientTask[]   // 最近 20 条

  // 事件
  on("connected" | "disconnected" | "reconnect_failed" | "rejected", ...)
  on("reconnecting", (attempt: number) => ...)
  on("task", (task: Task) => ...)            // Server 推送的 Task 状态更新
  on("message" | "notify", (msg: Message) => ...)
  on("error", (payload) => ...)
  on("task_queued" | "task_started", (task: ClientTask) => ...)
  on("task_completed" | "task_failed" | "task_skipped", (task: ClientTask) => ...)
  on("task_finished", (task: ClientTask) => ...)   // 无论成功/失败/跳过都会触发
}
```

---

## WatcherClient

继承 `Client`，以 `role=watcher` 连接 Server。不接收 dispatch 任务，只接收：

- 所有 Task 状态变更（`task:created` / `task:updated` / `task:completed` / `task:failed`）
- 客户端上下线通知（`client:online` / `client:offline`）

```ts
const watcher = new WatcherClient({ id: "monitor", servers: ["ws://localhost:3000"] });
watcher.on("task:created", (task) => { ... });
watcher.on("client:online", (state) => { ... });
```

---

## Team 协作层

Team = Server + 角色管理。在 Server 的中转能力上增加：

- **角色注册**：Leader / Member 连接后发送 `message { subtype: "team:join" }`，Team 记录角色
- **成员列表广播**：角色变更时向所有在线成员推送 `notify { subtype: "team:members" }`
- **聊天广播**：`broadcastChat(fromId, subtype, payload)` 向所有其他成员中转消息
- **成员查询**：`getOnlineMemberIds()` 返回所有在线成员 ID

Leader 和 Member 本身只比 Client 多一行 `this.send("team:join", { role })`。任务调度、结果收集、审核等流程完全复用 Server + Client 的能力。

---

## 容错机制

### 客户端离线 (handleClientOffline)

| 角色 | 场景 | 行为 |
|---|---|---|
| Member | 执行中离线 | 保留在 `pendingClients`，等待重连后重新 dispatch |
| Leader | 审核中离线 | 记录错误 resource，直接 `finishTask()` 完成 |

### 客户端重连 (reassignPendingTasks)

1. Client 重连成功
2. Server 的 `connection` 事件触发
3. 遍历所有 `running`/`pending` 状态的 Task
4. 如果该 Client 在 `pendingClients` 中，重新发送 dispatch

### 重复登录

ServerTransport 检测同 clientId 已有活跃连接时，关闭新连接并返回 code `4001`（`DUPLICATE_LOGIN`）。Client 端触发 `rejected` 事件。旧连接的 stale 状态会被清理。

### 自动重连

ClientTransport 默认开启自动重连，指数退避：`interval * min(attempt, 5)`（最长 15s），最多 10 次。

### 状态恢复

Server 提供两个方法用于持久化恢复：
- `loadTaskStates(entries)` — 批量加载 Task + TaskState
- `redispatchRestoredTasks()` — 对 pending 状态的任务重新 dispatch，对 running 状态的任务向在线客户端补发 dispatch

---

## 代码索引

### packages/core/

| 文件 | 行数 | 核心导出 | 职责 |
|---|---|---|---|
| `task.ts` | ~28 | `TaskMode`, `TaskStatus`, `Resource`, `Task`, `SubmitOptions` | 任务数据模型定义 |
| `message.ts` | ~51 | `MessageType`, `Message`, `createMessage`, `serializeMessage`, `deserializeMessage` | 消息协议，9 种 type + 构造/序列化 |
| `event-emitter.ts` | ~53 | `EventEmitter` | 类型安全的发布订阅基类，全模块继承 |
| `queue.ts` | ~34 | `Queue<T>` | 通用 FIFO 队列（enqueue/dequeue/peek/remove） |
| `errors.ts` | ~30 | `EnvoyError`, `ConnectionError`, `TimeoutError`, `TaskError` | 错误类型层级 |
| `index.ts` | ~7 | — | 重导出全部 core 类型 |

### packages/server/

| 文件 | 行数 | 核心导出 | 职责 |
|---|---|---|---|
| `server.ts` | ~492 | `Server`, `ServerOptions`, `ServerEvents`, `SerializedTaskState` | Server 主类，任务调度引擎 |
| `connection-manager.ts` | ~99 | `ConnectionManager`, `ClientState` | 客户端注册表 + 心跳超时检测 |
| `transport.ts` | ~127 | `ServerTransport` | WebSocket 服务端，连接管理 + 消息收发 |
| `index.ts` | ~5 | — | 重导出 Server + ServerOptions + ClientState |

**server.ts 关键方法索引：**

| 方法 | 行号 | 可见性 | 用途 |
|---|---|---|---|
| `constructor` | 47 | public | 初始化 transport + connectionManager |
| `start` / `stop` | 63/68 | public | 启停服务 |
| `submitFrom` | 150 | public | 编程式提交任务 |
| `createTaskAndDispatch` | 154 | private | 任务创建 + 分发（submitFrom 和 handleSubmit 共用） |
| `handleSubmit` | 250 | private | 处理客户端 submit 消息（校验 + createTaskAndDispatch） |
| `dispatchSerial` | 264 | private | 串行分发：按 serialIndex 逐个 dispatch |
| `dispatchParallel` | 284 | private | 并行分发：向所有在线 target 同时 dispatch |
| `processResult` | 335 | private | 结果处理核心：member result → leader review → retry/completed |
| `dispatchToLeader` | 395 | private | 进入审核阶段：发送 `dispatch { subtype: "review" }` |
| `resetForRetry` | 424 | private | 重试重置：回退状态，重新 dispatch |
| `handleClientOffline` | 471 | private | 客户端离线处理 |
| `notifyTaskUpdate` | 446 | private | 向 createBy + subscribe + watchers 广播 task 状态 |
| `reassignPendingTasks` | 414 | private | 重连后补发 pending 任务 |
| `receiveResult` | 312 | public | 外部调用上报结果 |
| `addResourceToTask` | 316 | public | 外部调用追加资源 |
| `startTask` | 324 | public | 手动 pending → running |
| `loadTaskStates` | 104 | public | 批量加载持久化状态 |
| `redispatchRestoredTasks` | 117 | public | 恢复后重新分发 |

### packages/client/

| 文件 | 行数 | 核心导出 | 职责 |
|---|---|---|---|
| `client.ts` | ~268 | `Client`, `ClientTask`, `ClientEvents`, `ClientOptions`, `TaskHandler`, `SKIP_RESULT`, `EXECUTION_TIMEOUT` | Client 主类，任务执行引擎 |
| `heartbeat.ts` | ~48 | `Heartbeat` | 定时心跳发送 |
| `transport.ts` | ~129 | `ClientTransport` | WebSocket 客户端 + 自动重连 |
| `watcher-client.ts` | ~53 | `WatcherClient`, `WatcherClientEvents` | 只读监控客户端 |
| `index.ts` | ~7 | — | 重导出全部 client 类型 |

**client.ts 关键方法索引：**

| 方法 | 行号 | 可见性 | 用途 |
|---|---|---|---|
| `constructor` | 60 | public | 初始化 transport + heartbeat |
| `connect` / `disconnect` | 105/110 | public | 连接/断开 |
| `doing` | 100 | public | 注册任务处理器，触发 processNext |
| `submit` | 115 | public | 向 Server 提交任务 |
| `sendResult` | 255 | public | 手动上报任务结果 |
| `send` / `sendTo` | 120/125 | public | 发送通用消息 |
| `handleDispatch` | 182 | private | 接收 dispatch，创建 ClientTask 入队 |
| `processNext` | 206 | private | 串行队列调度，执行 handler |
| `pushHistory` | 248 | private | 维护最近 20 条任务历史 |

### packages/teams/

| 文件 | 行数 | 核心导出 | 职责 |
|---|---|---|---|
| `team.ts` | ~94 | `Team`, `TeamEvents` | Team 服务端（内嵌 Server + 角色管理） |
| `leader.ts` | ~14 | `Leader` | Leader 客户端（Client + team:join） |
| `member.ts` | ~17 | `Member` | Member 客户端（Client + team:join） |
| `types.ts` | ~22 | `TeamJoinPayload`, `TeamOptions`, `LeaderOptions`, `MemberOptions` | 类型定义 |
| `index.ts` | ~11 | — | 重导出全部 teams 类型 |

---

## 设计边界与约束

1. **Server 纯中转** — Server 不解析 `content`，不执行任务，不做业务决策
2. **Client 串行队列** — 同一 Client 同一时间只执行一个任务，不支持并行
3. **结果手动上报** — `doing` handler 执行完后不会自动调用 `sendResult`，消费方必须手动上报
4. **无背压控制** — Client 队列无上限，高频 dispatch 可能堆积
5. **无持久化** — Server 和 Client 状态全在内存，崩溃即丢失（可通过 `loadTaskStates` 恢复）
6. **无权限控制** — 任何连接的客户端都可以 submit/dispatch/message，Server 不做鉴权
7. **无任务父子关系** — 任务之间相互独立，不支持子任务链
8. **Review 必须经过 Leader** — 所有任务完成后都进入 Leader Review 阶段，无法跳过
9. **重试上限 10 次** — Leader 审核失败最多重试 10 次，超限后标记 failed
10. **心跳 10s / 超时 30s** — Client 每 10s 发心跳，Server 30s 无心跳判定离线
