# Envoy

基于 WebSocket 的 Server/Client 通信框架，支持 subscribe 驱动的任务调度、串行/并行执行、资源池、心跳检测。

## 核心概念

```
┌──────────┐  submit({ content, subscribe, mode })  ┌──────────┐  dispatch  ┌──────────┐
│ Client A │ ──────────────────────────────────────► │  Server  │ ─────────► │ Client B │
│ (发起者)  │                                         │ (中转)    │            │ (执行者)  │
└──────────┘                                         └──────────┘            └──────────┘
     ▲                                                     │                      │
     │                task 状态变更通知                      │       result         │
     └─────────────────────────────────────────────────────┘◄─────────────────────┘
```

- **Server 只做中转** — 不发起任务、不做业务逻辑、不存储能力
- **subscribe 驱动分发** — 发起者明确指定谁执行，不需要服务端发现
- **Client 内建订阅** — Client 创建时自动接收 Server Task，无需额外注册
- **ClientTask 串行队列** — Server Task 到达后自动生成 ClientTask，串行执行，自动切换

## 安装

```bash
npm install envoy
```

## 快速开始

### 服务端

```typescript
import { Server } from "envoy/server";

const server = new Server({ port: 9000 });

server.on("client:online", (client) => {
  console.log(`客户端上线: ${client.id}`);
});

server.on("task:completed", (task) => {
  console.log(`任务完成: ${task.id}`, task.resources);
});

await server.start();
```

### 客户端 — 处理任务

Client 创建时内建订阅 Server Task。`doing` 注册处理器，收到的是 **ClientTask**：

```typescript
import { Client } from "envoy/client";

const worker = new Client({
  id: "worker-1",
  servers: ["ws://localhost:9000"],
});

// doing 注册处理器 — 收到的是 ClientTask
worker.doing(async (clientTask) => {
  const task = clientTask.serverTask;  // 通过 .serverTask 访问 Server Task 数据
  console.log(`收到任务: ${task.content}`);
  console.log(`来自: ${task.createBy}`);
  console.log(`已有资源:`, task.resources);
  return { result: "处理完毕" };
});

await worker.connect();
```

### 客户端 — 发起任务

```typescript
const boss = new Client({
  id: "boss",
  servers: ["ws://localhost:9000"],
});

await boss.connect();

// 串行：worker-1 做完 → worker-2 接着做
boss.submit({
  content: "处理用户数据",
  subscribe: ["worker-1", "worker-2"],
  mode: "serial",
});

// 并行：worker-1 和 worker-2 同时做
boss.submit({
  content: "生成报表",
  subscribe: ["worker-1", "worker-2"],
  mode: "parallel",
});
```

### 接收任务状态通知

```typescript
// 发起者自动收到通知
boss.on("task", (task) => {
  console.log(`任务 ${task.id} 状态: ${task.status}`);
  // task 包含完整的 resources（所有执行者的结果）
});

// 执行者也可以监听整体任务状态
worker.on("task", (task) => {
  console.log(`任务整体进度:`, task.resources);
});
```

## 数据模型

### Server Task

```typescript
interface Task {
  id: string;
  createBy: string;           // 发起者（不执行）
  subscribe: string[];        // 执行者列表（至少一个）
  content: string;            // 任务内容
  mode: "serial" | "parallel"; // 串行 | 并行
  status: "pending" | "running" | "completed" | "failed";
  resources: Resource[];      // 资源池，逐步累积
  createdAt: number;
}
```

### Resource

任务流转过程中的可扩展资源池：

```typescript
interface Resource {
  type: string;    // "client-result" | 可扩展
  by: string;      // 谁产生的
  data: unknown;   // 数据
}
```

Serial 模式下，后一个执行者能看到前一个执行者的结果：

```
B 执行 → resources: [{ type: "client-result", by: "B", data: {...} }]
C 执行 → resources: [{ type: "client-result", by: "B", data: {...} },
                      { type: "client-result", by: "C", data: {...} }]
```

### ClientTask 与 doing

Client 创建时内建订阅 Server Task。当 Server 通过 `dispatch` 把任务派发到 Client 时：

1. **自动接收** — Client 天生接收 dispatch，不需要 doing 来触发订阅
2. **生成 ClientTask** — 根据 Server Task 一对一映射，推入串行队列
3. **去重判断** — 同一个 Server Task 不会重复创建 ClientTask
4. **串行执行** — 当前无任务立即执行，有任务则排队，完成后自动切换下一个
5. **延迟注册** — 即使 doing 在任务到达之后才注册，排队中的任务也会立即执行

```
Client 创建
    │
    │  内建订阅：任何 dispatch 自动接收
    │
    ▼
dispatch 到达 (Server Task)
    │
    │ 检查：是否已有同 ID 的 ClientTask？
    │ ──已有──► 跳过（不重复创建）
    │
    │ ──没有──► 创建 ClientTask { serverTask, status: 'pending' }
    │           推入串行队列
    │
    ▼
队列处理
    │
    ├── 当前无任务 ──► 立即执行
    └── 当前有任务 ──► 排队等待，轮到时自动执行
    │
    ▼
doing(clientTask)                    ← handler 收到 ClientTask
    │  clientTask.serverTask         ← 原始 Server Task
    │  clientTask.serverTask.content ← 任务内容
    │  clientTask.status             ← 客户端侧状态
    │
    ▼
return result
    │  ClientTask.status → completed
    │  result 发回 Server
    │  自动取下一个 ClientTask 执行
    ▼
```

```typescript
const worker = new Client({ id: "worker-1", servers: ["ws://localhost:9000"] });

// doing 可以在任何时刻注册
worker.doing(async (clientTask) => {
  const task = clientTask.serverTask;
  console.log(`执行: ${task.content}`);
  return { result: "完成" };
});

await worker.connect();

// 查看队列状态
worker.queueLength;   // 排队中的任务数
worker.currentTask;   // 当前正在执行的 ClientTask（无则为 null）
```

ClientTask 类型定义：

```typescript
interface ClientTask {
  id: string;                 // 客户端本地 ID（ct-xxx 格式）
  serverTask: Task;           // 原始 Server Task 引用
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;           // 执行结果
  error?: string;             // 错误信息
  startedAt?: number;         // 开始执行时间
  completedAt?: number;       // 完成时间
}
```

关键行为：
- **doing handler 收到 ClientTask** — 通过 `clientTask.serverTask` 访问原始 Server Task
- **内建订阅** — Client 创建时自动接收 Server Task，doing 只负责注册处理逻辑
- **延迟注册** — doing 之前到达的任务会在队列中等待，doing 注册后立即处理
- **永远串行** — 不管 Server Task 的 mode 是 serial 还是 parallel，Client 内部队列始终逐个执行
- **自动切换** — 一个任务完成后自动执行队列中下一个，无需手动调用

## API 参考

### Server

#### 构造选项

```typescript
interface ServerOptions {
  port: number;                // 监听端口（必填）
  host?: string;               // 监听地址，默认 "0.0.0.0"
  heartbeatTimeout?: number;   // 心跳超时（毫秒），默认 30000
  defaultTaskTimeout?: number; // 任务默认超时（毫秒），默认 60000
}
```

#### 方法

| 方法 | 说明 |
|---|---|
| `start()` | 启动服务器 |
| `stop()` | 停止服务器 |
| `getClient(clientId)` | 获取客户端状态 |
| `getClients()` | 获取所有客户端 |
| `getOnlineClients()` | 获取在线客户端 |
| `getTask(taskId)` | 获取任务 |
| `getAllTasks()` | 获取所有任务 |
| `notify(clientId, subtype, payload)` | 推送通知 |

#### 事件

| 事件 | 参数 | 说明 |
|---|---|---|
| `client:online` | `ClientState` | 客户端上线 |
| `client:offline` | `{ id }` | 客户端离线 |
| `task:created` | `Task` | 任务创建 |
| `task:updated` | `Task` | 任务状态更新 |
| `task:completed` | `Task` | 任务完成 |
| `task:failed` | `Task` | 任务失败 |
| `message` | `clientId, Message` | 收到消息 |

### Client

#### 构造选项

```typescript
interface ClientOptions {
  id: string;                    // 客户端唯一标识（必填）
  servers: string[];             // 服务端地址列表（必填）
  heartbeatInterval?: number;    // 心跳间隔（毫秒），默认 10000
  reconnect?: boolean;           // 自动重连，默认 true
  reconnectInterval?: number;    // 重连间隔（毫秒），默认 3000
  maxReconnectAttempts?: number; // 最大重连次数，默认 10
}
```

#### 属性

| 属性 | 类型 | 说明 |
|---|---|---|
| `queueLength` | `number` | 当前队列中的任务数 |
| `currentTask` | `ClientTask \| null` | 当前正在执行的任务 |

#### 方法

| 方法 | 说明 |
|---|---|
| `doing(fn)` | 注册任务处理器，handler 收到 `ClientTask` |
| `submit(options)` | 发起任务到服务端 |
| `connect()` | 连接到服务端 |
| `disconnect()` | 断开连接 |
| `send(subtype, payload)` | 发消息给服务端 |
| `sendTo(targetId, subtype, payload)` | 发消息给指定客户端 |

#### 事件

| 事件 | 参数 | 说明 |
|---|---|---|
| `connected` | - | 连接成功 |
| `disconnected` | - | 断开连接 |
| `reconnecting` | `attempt` | 重连尝试 |
| `task` | `Task` | 任务状态变更（完整 Server Task 对象） |
| `notify` | `Message` | 收到通知 |
| `message` | `Message` | 收到消息 |
| `error` | `unknown` | 错误 |

### WatcherClient

监控观察者客户端，用于监听服务端状态变更：

```typescript
import { WatcherClient } from "envoy/client";

const watcher = new WatcherClient({
  id: "watcher",
  servers: ["ws://localhost:9000"],
});

await watcher.connect();

watcher.on("task:created", (task) => {
  console.log("新任务:", task.content);
});

watcher.on("client:online", (state) => {
  console.log("上线:", state.id);
});
```

### Teams

基于 Envoy 的 Leader/Member 协作模块，提供文件级资源共享：

```typescript
import { Team, Leader, Member } from "envoy/co-work";

const team = new Team({ port: 9000, resourceRoot: "./resources" });
await team.start();

const leader = new Leader({ id: "leader", servers: ["ws://localhost:9000"] });
await leader.connect();
await leader.registerResource("config.json", '{"theme": "dark"}');

const member = new Member({ id: "member", servers: ["ws://localhost:9000"] });
await member.connect();
const content = await member.getResource("config.json");
```

## 消息协议

| 类型 | 方向 | 说明 |
|---|---|---|
| `submit` | Client → Server | 提交任务 |
| `dispatch` | Server → Client | 分发任务给执行者 |
| `result` | Client → Server | 执行结果 |
| `task` | Server → Client | 任务状态变更通知 |
| `heartbeat` | Client → Server | 心跳 |
| `heartbeat_ack` | Server → Client | 心跳响应 |
| `notify` | Server → Client | 服务端通知 |
| `message` | 双向 | 自由消息 |
| `error` | Server → Client | 错误 |

## 错误类型

| 类 | 错误码 | 说明 |
|---|---|---|
| `EnvoyError` | 自定义 | 基类 |
| `ConnectionError` | `CONNECTION_ERROR` | 连接错误 |
| `TimeoutError` | `TIMEOUT` | 任务超时 |
| `TaskError` | `TASK_ERROR` | 任务执行错误 |

## 开发

```bash
npm install
npm run build
npm run dev
npm test              # 运行测试
npm run test:watch    # 监听模式
```

## 技术栈

- **Runtime**: Node.js >= 18
- **Language**: TypeScript (strict mode)
- **Module System**: ESM
- **WebSocket**: ws ^8.18.0

## 许可证

MIT
