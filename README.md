# Envoy

基于 WebSocket 的 Server/Client 通信框架，支持任务调度、能力注册、心跳检测、客户端间通信等功能。

## 特性

- **能力注册** - 客户端动态注册可执行能力，服务端自动发现和调度
- **任务调度** - 支持自动选择和指定客户端执行任务
- **优先级队列** - 任务按优先级排序执行
- **任务抢占** - 高优先级任务可抢占低优先级任务（Generator 模式）
- **心跳检测** - 服务端通过心跳超时检测客户端离线
- **自动重连** - 客户端断线后自动重连，支持退避策略
- **进度上报** - 任务执行过程中实时上报进度
- **客户端间通信** - 客户端可通过服务端路由调用其他客户端的能力

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

server.on("task:completed", (taskId, result) => {
  console.log(`任务完成: ${taskId}`, result);
});

await server.start();
console.log("服务端已启动");
```

### 客户端

```typescript
import { Client } from "envoy/client";

const client = new Client({
  id: "worker-1",
  servers: ["ws://localhost:9000"],
});

// 注册能力
client.register("compute", {
  description: "计算任务",
  params: { input: { type: "string", required: true } },
  mode: "queue",
  priority: 1,
  execute: async (ctx) => {
    console.log(`处理: ${ctx.params.input}`);
    ctx.report({ step: "处理中", progress: 50 });
    await sleep(1000);
    return { result: "done" };
  },
});

await client.connect();
console.log("客户端已连接");
```

### 执行任务

```typescript
// 自动选择客户端执行
const result = await server.executeAny("compute", { input: "data" });

// 指定客户端执行
const result2 = await server.executeTo("worker-1", "compute", { input: "data" });

// 客户端间调用（通过服务端路由）
const result3 = await clientA.execute("compute", { input: "data" });
```

## API 参考

### Server

#### 构造选项

```typescript
interface ServerOptions {
  port: number;              // 监听端口（必填）
  host?: string;             // 监听地址，默认 "0.0.0.0"
  heartbeatTimeout?: number; // 心跳超时（毫秒），默认 30000
  defaultTaskTimeout?: number; // 任务默认超时（毫秒），默认 60000
}
```

#### 方法

| 方法 | 说明 |
|---|---|
| `start(): Promise<void>` | 启动服务器 |
| `stop(): Promise<void>` | 停止服务器 |
| `getClient(clientId)` | 获取指定客户端状态 |
| `getClients()` | 获取所有客户端列表 |
| `getOnlineClients()` | 获取在线客户端列表 |
| `getClientCapabilities(clientId)` | 获取指定客户端的能力列表 |
| `executeAny(taskName, params, options?)` | 自动选择空闲客户端执行任务 |
| `executeTo(clientId, taskName, params, options?)` | 指定客户端执行任务 |
| `notify(clientId, subtype, payload)` | 向客户端推送通知 |

#### 事件

| 事件 | 参数 | 说明 |
|---|---|---|
| `client:online` | `ClientState` | 客户端上线 |
| `client:offline` | `{ id }` | 客户端离线 |
| `client:registered` | `clientId, CapabilityDefinition[]` | 客户端注册能力 |
| `task:completed` | `taskId, TaskResult` | 任务完成 |
| `task:progress` | `taskId, TaskProgress` | 任务进度 |
| `message` | `clientId, Message` | 收到消息 |

### Client

#### 构造选项

```typescript
interface ClientOptions {
  id: string;                  // 客户端唯一标识（必填）
  servers: string[];           // 服务端地址列表（必填）
  heartbeatInterval?: number;  // 心跳间隔（毫秒），默认 10000
  reconnect?: boolean;         // 是否自动重连，默认 true
  reconnectInterval?: number;  // 重连间隔（毫秒），默认 3000
  maxReconnectAttempts?: number; // 最大重连次数，默认 10
}
```

#### 方法

| 方法 | 说明 |
|---|---|
| `register(name, options)` | 注册能力 |
| `connect(): Promise<void>` | 连接到服务端 |
| `disconnect()` | 断开连接 |
| `execute(taskName, params?): Promise<unknown>` | 请求服务端执行任务 |
| `send(subtype, payload)` | 向服务端发送消息 |
| `sendTo(targetId, subtype, payload)` | 向指定客户端发送消息（fire-and-forget） |

#### 事件

| 事件 | 参数 | 说明 |
|---|---|---|
| `connected` | - | 连接成功 |
| `disconnected` | - | 断开连接 |
| `reconnecting` | `attempt` | 重连尝试 |
| `registered` | - | 能力注册成功 |
| `notify` | `Message` | 收到通知 |
| `notify:<subtype>` | `payload` | 收到特定类型通知 |
| `message` | `Message` | 收到消息 |
| `message:<subtype>` | `payload` | 收到特定类型消息（含客户端间消息） |
| `error` | `Error` | 错误 |

### WatcherClient

WatcherClient 是观察者客户端，用于监控服务端状态变更（如客户端上下线、能力注册等）。连接后会自动收到服务端的初始快照。

```typescript
import { WatcherClient } from "envoy/client";

const watcher = new WatcherClient({
  id: "watcher-1",
  servers: ["ws://localhost:9000"],
});

await watcher.connect();

// 等待初始快照
const snapshot = await watcher.waitForSnapshot();
console.log("当前在线客户端:", snapshot.clients);
console.log("所有能力:", snapshot.capabilities);

// 也可以使用 getSnapshot() 同步获取（如果已缓存）
const cached = watcher.getSnapshot();

// 监听状态变更
watcher.on("client:online", (state) => {
  console.log("客户端上线:", state.id);
});

watcher.on("client:offline", (info) => {
  console.log("客户端离线:", info.id);
});

watcher.on("client:registered", ({ clientId, capabilities }) => {
  console.log(`${clientId} 注册了能力:`, capabilities.map(c => c.name));
});
```

#### 事件

| 事件 | 参数 | 说明 |
|---|---|---|
| `snapshot` | `WatcherSnapshot` | 收到初始快照 |
| `client:online` | `ClientState` | 客户端上线 |
| `client:offline` | `{ id }` | 客户端离线 |
| `client:registered` | `{ clientId, capabilities }` | 客户端注册能力 |

#### 方法

| 方法 | 说明 |
|---|---|
| `getSnapshot()` | 获取已缓存的快照，未收到返回 `null` |
| `waitForSnapshot()` | 等待快照，已缓存则立即返回 |

### 能力注册选项

```typescript
interface RegisterOptions {
  description?: string;                    // 能力描述
  params?: Record<string, ParamDef>;       // 参数定义
  mode?: "queue" | "preemptive";           // 执行模式
  priority?: number;                       // 优先级（数值越大越高）
  timeout?: number;                        // 超时（毫秒）
  maxRetries?: number;                     // 最大重试次数
  retryDelay?: number;                     // 重试延迟（毫秒）
  execute: AsyncExecuteFn | GeneratorExecuteFn; // 执行函数
}
```

### 任务执行上下文

```typescript
interface TaskContext {
  params: Record<string, unknown>;  // 任务参数
  report: (progress: {              // 上报进度
    step: string | number;
    progress: number;
    message?: string;
  }) => void;
  execute: (taskName: string, params: Record<string, unknown>) => Promise<unknown>; // 委托执行
}
```

### 错误类型

| 类 | 错误码 | 说明 |
|---|---|---|
| `EnvoyError` | 自定义 | 基类 |
| `ConnectionError` | `CONNECTION_ERROR` | 连接错误 |
| `TimeoutError` | `TIMEOUT` | 任务超时 |
| `TaskError` | `TASK_ERROR` | 任务执行错误 |

## 示例

项目包含完整的示例代码，位于 `examples/` 目录：

| 示例 | 说明 |
|---|---|
| `basic.ts` | 基础连接、能力注册、任务执行 |
| `heartbeat.ts` | 心跳检测与超时离线 |
| `timeout.ts` | 任务超时处理 |
| `retry.ts` | 任务重试机制 |
| `preemptive.ts` | 任务抢占 |
| `generator.ts` | Generator 执行模式 |
| `reconnect.ts` | 断线自动重连 |
| `load-balance.ts` | 多客户端负载均衡 |
| `priority-queue.ts` | 优先级队列调度 |
| `error-handling.ts` | 错误处理 |
| `notification.ts` | 通知机制 |
| `client-to-client.ts` | 客户端间通信 |

运行示例：

```bash
npx tsx examples/basic.ts
npx tsx examples/heartbeat.ts
# ...
```

## 开发

```bash
# 安装依赖
npm install

# 编译
npm run build

# 监听模式
npm run dev
```

## 技术栈

- **运行时**: Node.js >= 18
- **语言**: TypeScript (strict mode)
- **模块系统**: ESM
- **WebSocket**: ws ^8.18.0

## 许可证

MIT
