# 任务流转机制

## 一、概述

Envoy 的任务流转采用 **Server 中转、自动路由** 模型。Client 不能直接调用另一个 Client，所有任务请求经过 Server 调度分发。

```
Client A ──execute_request──▶ Server ──execute──▶ Client B
                               │                     │
                               │◀──execute_result────│
                               │
         ◀──execute_result────│
```

## 二、角色分工

| 角色 | 职责 |
|------|------|
| **调用方 Client** | 发起 `execute_request`，通过 Promise 等待结果 |
| **Server** | 接收请求，选择目标 Client，下发任务，中转结果 |
| **执行方 Client** | 接收 `execute`，入队执行，上报进度，返回结果 |

## 三、完整流转路径

### 3.1 发起请求

调用方通过 `client.execute(taskName, params)` 发起任务：

```
Client A                              Server                              Client B
   │                                    │                                    │
   │  clientA.execute("add", {a,b})     │                                    │
   │───────────────────────────────────▶│                                    │
   │  type: execute_request             │                                    │
   │  from: "client-a"                  │                                    │
   │  to: "server"                      │                                    │
   │  payload: {                        │                                    │
   │    taskName: "add",                │                                    │
   │    params: { a: 1, b: 2 }          │                                    │
   │  }                                 │                                    │
   │  msg.id = "req-xxx"  ←── 用于匹配返回结果                                │
```

Client 内部为这次请求创建一个 Promise，用 `requestId` 跟踪：

```typescript
// packages/client/client.ts → executeOnServer()
const requestId = `req-${Date.now()}-${++this.taskCounter}`;
this.pendingResults.set(requestId, { resolve, reject, timer });
```

### 3.2 Server 调度

Server 收到 `execute_request` 后，执行调度：

```
│                                    │                                    │
│                                    │  1. taskDispatcher.selectClient()  │
│                                    │     按 taskName 查找有该能力的       │
│                                    │     在线 Client                     │
│                                    │                                    │
│                                    │  2. 选择策略：                      │
│                                    │     优先选空闲 → 队列最短            │
│                                    │                                    │
│                                    │  3. taskDispatcher.dispatch()       │
│                                    │     生成 taskId，下发任务            │
│                                    │                                    │
│                                    │  4. 记录 TaskRecord                │
│                                    │     status: "pending"               │
│                                    │     initiator: "client-a"           │
│                                    │     history: [created, dispatched]  │
│                                    │                                    │
│                                    │  5. 保存 fromClient 信息            │
│                                    │     用于结果回传                    │
```

关键数据结构：

```typescript
// Server 端 pendingTasks 记录
this.pendingTasks.set(taskId, {
  resolve, reject, timer,
  fromClient: clientId,           // 调用方，用于回传结果
  originalRequestId: msg.id,      // 原始请求 ID，用于 replyTo 匹配
});
```

### 3.3 下发执行

Server 将任务发送给选中的 Client：

```
│                                    │──── type: execute ─────────────────▶│
│                                    │     to: "client-b"                  │
│                                    │     payload: {                      │
│                                    │       taskId: "task-xxx",           │
│                                    │       name: "add",                  │
│                                    │       params: { a: 1, b: 2 },       │
│                                    │       mode: "queue",                │
│                                    │       priority: 1,                  │
│                                    │       timeout: 60000                │
│                                    │     }                               │
```

### 3.4 执行方处理

Client B 收到 `execute` 消息后：

```
│                                    │                                    │
│                                    │                                    │  1. 查找本地注册的 "add" 能力
│                                    │                                    │  2. 构造 TaskInstance 入队
│                                    │                                    │  3. TaskExecutor 取出执行
│                                    │                                    │  4. 执行过程中可调用 ctx.report()
│                                    │                                    │     上报进度
```

### 3.5 进度上报

执行过程中，Client B 可多次上报进度：

```
│                                    │◀─── execute_progress ──────────────│
│                                    │     replyTo: taskId                │
│                                    │     payload: {                     │
│                                    │       taskId: "task-xxx",          │
│                                    │       step: "processing",          │
│                                    │       progress: 50,                │
│                                    │       message: "计算中"             │
│                                    │     }                              │
│                                    │                                    │
│                                    │  Server 处理：                      │
│                                    │  emit("task:progress")             │
│                                    │  更新 TaskRecord.history           │
│                                    │  通知 WatcherClient                │
```

### 3.6 返回结果

执行完成后，Client B 发送结果：

```
│                                    │◀─── execute_result ────────────────│
│                                    │     replyTo: taskId                │
│                                    │     payload: {                     │
│                                    │       success: true,               │
│                                    │       data: { result: 3 },         │
│                                    │       duration: 120                │
│                                    │     }                              │
```

### 3.7 Server 转发结果

Server 发现 `pending.fromClient` 存在，构造新消息转发给调用方：

```
│◀──────────────────────────────────│                                    │
│  type: execute_result             │                                    │
│  from: "server"                   │                                    │
│  to: "client-a"                   │                                    │
│  replyTo: "req-xxx"  ←── 匹配原始请求                                   │
│  payload: { success, data }       │                                    │
│                                    │                                    │
│  同时：                             │                                    │
│  emit("task:completed")           │                                    │
│  更新 TaskRecord (completed/failed)│                                    │
│  通知 WatcherClient                │                                    │
```

### 3.8 调用方收到结果

Client A 通过 `replyTo` 匹配到原始 Promise，完成调用：

```typescript
// replyTo = "req-xxx" 匹配 pendingResults 中的条目
const pending = this.pendingResults.get(replyTo);
pending.resolve(result.data);  // Promise 完成，execute() 返回
```

## 四、任务记录

Server 为每个任务维护 `TaskRecord`，记录完整生命周期：

```typescript
interface TaskRecord {
  id: string;           // 任务 ID
  name: string;         // 能力名称
  params: object;       // 任务参数
  status: string;       // pending | running | completed | failed
  initiator: string;    // 发起方 (client ID 或 "server")
  createdAt: number;    // 创建时间
  history: TaskHistoryEntry[];  // 状态变更历史
}

interface TaskHistoryEntry {
  type: "created" | "dispatched" | "started" | "progress"
      | "completed" | "failed";
  at: number;
  by?: string;
  to?: string;
  // progress 特有字段
  step?: string | number;
  progress?: number;
  message?: string;
  // completed/failed 特有字段
  result?: TaskResult;
  error?: string;
}
```

生命周期示例：

```
TaskRecord {
  id: "task-123",
  name: "add",
  status: "completed",
  initiator: "client-a",
  history: [
    { type: "created",    at: 1000, by: "client-a" },
    { type: "dispatched", at: 1000, to: "client-b" },
    { type: "progress",   at: 1050, by: "client-b", step: 1, progress: 50 },
    { type: "completed",  at: 1120, by: "client-b", result: { success: true, data: { result: 3 } } }
  ]
}
```

## 五、调度策略

TaskDispatcher 的选择逻辑（`selectClient`）：

1. 查找所有注册了指定能力的在线 Client
2. 优先选择空闲（没有正在执行任务）的 Client
3. 若都在忙，选择队列最短的 Client
4. 若没有 Client 注册该能力，返回 `null`（调用方收到错误）

**注意：调用方不能指定目标 Client**，只能指定能力名称，Server 负责选择执行者。

## 六、消息类型一览

| 类型 | 方向 | 触发时机 |
|------|------|---------|
| `execute_request` | Client → Server | 调用方发起任务 |
| `execute` | Server → Client | Server 下发任务给执行方 |
| `execute_progress` | Client → Server | 执行方上报进度 |
| `execute_result` | Client → Server | 执行方返回结果 |
| `execute_result` | Server → Client | Server 转发结果给调用方 |
| `execute_abort` | Server → Client | Server 终止任务 |
| `error` | Server → Client | 无可用执行方或超时 |

## 七、执行模式

能力注册时可选择执行模式：

| 模式 | 说明 |
|------|------|
| `queue` | 排队执行，按优先级顺序，一个接一个 |
| `preemptive` | 可抢占模式，高优先级任务可暂停低优先级任务（需使用 Generator 执行函数） |

## 八、超时与重试

| 机制 | 配置 | 默认值 |
|------|------|-------|
| 任务超时 | `timeout` / `defaultTaskTimeout` | 60000ms |
| 最大重试 | `maxRetries` | 0（不重试） |
| 重试延迟 | `retryDelay` | 1000ms |
| 请求超时 | Client 内部硬编码 | 60000ms |
