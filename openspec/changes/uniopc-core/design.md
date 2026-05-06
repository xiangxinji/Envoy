# UniOpc Core Design

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        uniopc (单包)                             │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                     core/ (内部共享)                         ││
│  │  message.ts  task.ts  capability.ts  queue.ts  events.ts   ││
│  └─────────────────────────────────────────────────────────────┘│
│         ▲                                     ▲                 │
│         │                                     │                 │
│  ┌──────┴───────┐                      ┌──────┴───────┐        │
│  │  server/     │                      │  client/     │        │
│  └──────────────┘                      └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
         ▲                                     ▲
         │                                     │
┌────────┴─────────────────────────────────────┴──────────────────┐
│                          Server                                  │
│                                                                 │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ ConnectionMgr│  │ CapabilityRegistry│  │ TaskDispatcher   │  │
│  │  心跳管理     │  │  能力注册表       │  │  任务调度         │  │
│  │  状态监控     │  │  Client→能力映射  │  │  自动选人         │  │
│  │  上下线检测   │  │  能力→Client映射  │  │  超时重试         │  │
│  └──────────────┘  └──────────────────┘  └──────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    MessageRouter                          │   │
│  │            WebSocket 消息收发 & 路由                      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
           │                    │                     │
           │ WebSocket          │ WebSocket           │ WebSocket
           ▼                    ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│      Client c1   │  │      Client c2   │  │      Client c3   │
│                  │  │                  │  │                  │
│ ┌──────────────┐ │  │ ┌──────────────┐ │  │ ┌──────────────┐ │
│ │  TaskQueue   │ │  │ │  TaskQueue   │ │  │ │  TaskQueue   │ │
│ │  优先级排序   │ │  │ │  优先级排序   │ │  │ │  优先级排序   │ │
│ │  挂起/恢复   │ │  │ │  挂起/恢复   │ │  │ │  挂起/恢复   │ │
│ └──────────────┘ │  │ └──────────────┘ │  │ └──────────────┘ │
│                  │  │                  │  │                  │
│ ┌──────────────┐ │  │ ┌──────────────┐ │  │ ┌──────────────┐ │
│ │ TaskExecutor │ │  │ │ TaskExecutor │ │  │ │ TaskExecutor │ │
│ │  执行任务     │ │  │ │  执行任务     │ │  │ │  执行任务     │ │
│ └──────────────┘ │  │ └──────────────┘ │  │ └──────────────┘ │
│                  │  │                  │  │                  │
│ ┌──────────────┐ │  │ ┌──────────────┐ │  │ ┌──────────────┐ │
│ │  Heartbeat   │ │  │ │  Heartbeat   │ │  │ │  Heartbeat   │ │
│ │  定时心跳     │ │  │ │  定时心跳     │ │  │ │  定时心跳     │ │
│ └──────────────┘ │  │ └──────────────┘ │  │ └──────────────┘ │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

## Message Protocol

所有通信使用统一消息结构：

```typescript
interface Message<T = unknown> {
  id: string;              // UUID
  type: MessageType;
  subtype?: string;        // 业务消息子类型
  from: string;            // 发送方 ID
  to: string;              // 目标方 ID
  replyTo?: string;        // 关联请求 ID
  payload: T;
  timestamp: number;
}
```

### 消息类型

| type | 方向 | 用途 |
|------|------|------|
| `register` | Client→Server | 注册能力 |
| `register_ack` | Server→Client | 注册确认 |
| `heartbeat` | Client→Server | 心跳（携带状态） |
| `heartbeat_ack` | Server→Client | 心跳响应 |
| `execute` | Server→Client | 下发任务 |
| `execute_result` | Client→Server | 任务结果 |
| `execute_progress` | Client→Server | 任务进度上报 |
| `execute_request` | Client→Server | 请求调用其他 Client |
| `execute_result` | Server→Client | 转发结果给请求方 |
| `execute_abort` | 双向 | 取消任务 |
| `notify` | Server→Client | 主动推送通知 |
| `message` | 双向 | 通用业务消息 |
| `error` | 双向 | 错误 |

## Capability Registration

Client 注册能力时携带描述信息：

```typescript
interface CapabilityDefinition {
  name: string;
  description: string;
  params: Record<string, ParamDef>;
}

interface ParamDef {
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  required?: boolean;
  default?: unknown;
}
```

Server 维护双向映射：
- `clientId → CapabilityDefinition[]`
- `capabilityName → clientId[]`

## Task Lifecycle

```
Pending → Running → Completed
              ↓
         Suspended → Running → Completed
```

### Task Definition

```typescript
interface TaskDefinition {
  name: string;
  description: string;
  params: Record<string, ParamDef>;
  mode: "queue" | "preemptive";
  priority: number;            // 数字越大越优先
  timeout?: number;            // ms
  maxRetries?: number;
  retryDelay?: number;         // ms
}
```

### Task Result

```typescript
interface TaskResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;            // ms
}
```

### Queue Mode

任务进入队列尾部，按优先级排序。前面的任务执行完才轮到自己。

### Preemptive Mode

任务使用 Generator 函数定义步骤边界。框架在每个 `yield` 后检查是否有更高优先级任务等待。如有，挂起当前任务，执行高优先级任务，完成后恢复。

```typescript
// Generator 步骤边界
execute: function* (ctx) {
  yield step1();     // ← 框架在此处检查
  yield step2();     // ← 框架在此处检查
  return result;
}
```

## Task Dispatch

Server 选择 Client 的逻辑：

1. 查询能力注册表，找到所有注册了该能力的 Client
2. 过滤出状态为 `online`（非 `busy`）的 Client
3. 选择当前任务队列最短的 Client（简单负载均衡）

## Client-to-Client Routing

```
c1.execute("test", params)
  → execute_request 发给 Server
  → Server 查注册表找到 c2
  → execute 发给 c2
  → c2 执行，返回 execute_result 给 Server
  → Server 转发 execute_result 给 c1
```

对 c1 完全透明，不知道是 c2 执行的。

## Heartbeat

- Client 每 N 秒发送 `heartbeat`，携带当前状态
- Server 回复 `heartbeat_ack`
- Server 超过 M 秒未收到心跳，标记 Client 为 `offline`
- Client 收到 `heartbeat_ack` 可携带 Server 下发的指令

### 心跳状态载荷

```typescript
interface HeartbeatPayload {
  queueLength: number;          // 队列中剩余任务数
  running?: {                   // 当前正在执行的任务
    taskId: string;
    taskName: string;
    progress?: number;          // 0-100
  };
  uptime: number;               // Client 运行时长 (ms)
  memoryUsage?: number;         // 内存使用 (bytes)
}
```

Server 收到心跳后更新 Client 状态视图，用于调度决策。

## Task Progress Reporting

任务执行过程中，Client 自动上报进度。框架层面保证，业务代码无需手动发送网络请求。

```typescript
// queue 模式: 通过 ctx.report() 上报
execute: async (ctx) => {
  ctx.report({ step: "pulling", progress: 0 });
  await pullCode();
  ctx.report({ step: "building", progress: 50 });
  await build();
  return { success: true };
}

// preemptive 模式: 每个 yield 自动上报
execute: function* (ctx) {
  yield pullCode();     // 框架自动: execute_progress { step: 1, progress: 33 }
  yield build();        // 框架自动: execute_progress { step: 2, progress: 66 }
  return { success: true };
}
```

### 进度消息结构

```typescript
interface TaskProgress {
  taskId: string;
  step: string | number;        // 步骤名或步骤索引
  progress: number;             // 0-100
  message?: string;             // 可选描述
}
```

## Framework Constraints

框架层面强制执行以下约束，不是"建议"而是代码层面的保证：

1. **Client 无法直接连接其他 Client** —— Client 只有到 Server 的连接，没有 `connectTo(otherClient)` API
2. **所有通信经 Server 中转** —— `client.execute()` 内部实现为发消息给 Server，由 Server 路由
3. **一切行为自动上报** —— 任务开始、进度、完成、队列变化等由框架自动上报，业务代码不需要手动调用网络方法
4. **Server 是唯一网关** —— Client 之间没有建立直接通信通道的能力

## Multi-Server Support

- Client 可连接多个 Server 实例
- 各 Server 之间完全隔离，互不可见
- Client 为每个 Server 维护独立的连接和状态
- 能力注册是全局的（同一能力注册到所有连接的 Server）

## Role Model

框架不内置"角色"概念。Leader、管理员等角色通过能力注册实现：

- Leader 注册 "dispatch"（派发任务）、"approve"（审批）等能力
- 普通成员注册具体执行能力（"implement"、"test" 等）
- Leader 通过 `client.execute("implement", params)` 调用成员，经 Server 自动路由
- Server 完全无感知谁是 Leader，只做能力路由和负载均衡
- 角色由团队自行决定，不关框架的事

## Error Handling

- 连接断开：Client 自动重连（指数退避）
- 任务超时：Server 标记失败，可配置重试
- 任务执行异常：Client 返回 `{ success: false, error: message }`
- 消息格式错误：返回 `error` 类型消息
