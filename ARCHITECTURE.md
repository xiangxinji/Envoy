# UniOpc 架构说明文档

## 一、项目简介

UniOpc 是一个基于 WebSocket 的 Server/Client 分布式任务调度框架。Server 负责管理客户端连接、能力注册和任务调度，Client 连接 Server 注册能力并执行任务。内置 WatcherClient 机制支持实时监控。

---

## 二、技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Node.js >= 18 |
| 语言 | TypeScript (strict, ES2022, ESM) |
| 通信 | WebSocket (ws ^8.18.0) |
| 监控后端 | Hono |
| 监控前端 | Vue 3 + Vue Router + TailwindCSS 4 + Vite 8 |
| 构建 | tsc (主项目) / vue-tsc + vite (前端) |

---

## 三、目录结构

```
UniOpc/
├── src/                          # 主框架源码
│   ├── core/                     # 核心类型定义
│   │   ├── message.ts            # 消息协议与序列化
│   │   ├── capability.ts         # 能力定义接口
│   │   ├── task.ts               # 任务类型 + TaskRecord + TaskHistoryEntry
│   │   ├── queue.ts              # 优先队列
│   │   ├── event-emitter.ts      # 泛型事件系统
│   │   └── errors.ts             # 错误类型
│   ├── server/                   # 服务端
│   │   ├── server.ts             # Server 主类（TaskStore、调度、事件）
│   │   ├── transport.ts          # WebSocket 传输层
│   │   ├── connection-manager.ts # 连接管理 + 心跳超时
│   │   ├── capability-registry.ts# 能力注册表（双向映射）
│   │   ├── task-dispatcher.ts    # 任务调度 + 客户端选择
│   │   ├── message-router.ts     # 消息路由 + 请求追踪
│   │   └── index.ts              # 导出
│   ├── client/                   # 客户端
│   │   ├── client.ts             # Client 主类（重连、能力注册、任务执行）
│   │   ├── transport.ts          # WebSocket 传输层（自动重连）
│   │   ├── heartbeat.ts          # 心跳上报
│   │   ├── capability.ts         # 能力注册类型 + TaskContext
│   │   ├── task-queue.ts         # 任务队列（支持抢占）
│   │   ├── task-executor.ts      # 任务执行器（重试、进度上报）
│   │   ├── watcher-client.ts     # WatcherClient（监控专用）
│   │   └── index.ts              # 导出
│   └── index.ts                  # 入口导出
│
├── monitor/                      # 监控仪表盘（独立应用）
│   ├── server/                   # 监控后端
│   │   └── src/
│   │       ├── index.ts          # 启动入口（WatcherClient → Hono）
│   │       ├── state-store.ts    # 状态管理（clients + capabilities + tasks）
│   │       ├── api.ts            # REST API
│   │       └── sse.ts            # SSE 实时推送
│   └── web/                      # 监控前端
│       └── src/
│           ├── main.ts           # Vue 入口
│           ├── router.ts         # 路由配置
│           ├── App.vue           # 主布局 + 导航
│           ├── composables/
│           │   └── useSSE.ts     # SSE 连接管理 + 响应式数据
│           └── components/
│               ├── ClientsPage.vue        # 客户端页面
│               ├── TasksPage.vue          # 任务页面
│               ├── ClientTable.vue        # 客户端表格
│               ├── ClientTaskList.vue     # 客户端关联任务
│               ├── TaskHistoryTimeline.vue# 任务历史时间线
│               ├── CapabilityGrid.vue     # 能力网格
│               ├── StatsCard.vue          # 统计卡片
│               └── ConnectionBadge.vue    # 连接状态
│
├── examples/                    # 示例代码（12个场景）
├── openspec/                    # OpenSpec 规格与变更记录
└── dist/                        # 编译输出
```

---

## 四、系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Monitor Frontend                         │
│                  (Vue 3 + SSE + Vue Router)                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐                │
│  │ClientsPage│  │TasksPage │  │  StatsCard    │                │
│  └─────┬─────┘  └────┬─────┘  └───────────────┘                │
│        │              │                                          │
│        └──────┬───────┘                                          │
│               │ useSSE (composable)                              │
└───────────────┼──────────────────────────────────────────────────┘
                │ SSE (/sse)
                │
┌───────────────┼──────────────────────────────────────────────────┐
│          Monitor Backend (Hono)              │                   │
│  ┌────────────┐  ┌──────────┐  ┌──────────┐ │                   │
│  │ REST API   │  │   SSE    │  │StateStore│ │                   │
│  │ /api/*     │  │  /sse    │  │clients + │ │                   │
│  └────────────┘  └──────────┘  │caps+tasks│ │                   │
│                                 └────┬─────┘ │                   │
└──────────────────────────────────────┼──────────────────────────┘
                                       │ WatcherClient (WebSocket)
                                       │
┌──────────────────────────────────────┼──────────────────────────┐
│                    UniOpc Server     │                          │
│  ┌───────────────────────────────────┴─────────────────────┐   │
│  │                      Server 主类                         │   │
│  │  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │ConnectionMgr  │  │CapabilityReg │  │ TaskDispatcher│  │   │
│  │  │(心跳/状态)     │  │(双向映射)     │  │(负载均衡调度) │  │   │
│  │  └───────────────┘  └──────────────┘  └──────────────┘  │   │
│  │  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │ServerTransport│  │MessageRouter │  │  TaskStore   │  │   │
│  │  │(WebSocket)    │  │(C2C路由)      │  │(任务记录)     │  │   │
│  │  └───────────────┘  └──────────────┘  └──────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│            │ WebSocket                    │ WebSocket            │
└────────────┼──────────────────────────────┼─────────────────────┘
             │                              │
    ┌────────┴────────┐          ┌──────────┴──────────┐
    │    Client A     │          │     Client B        │
    │ ┌─────────────┐ │          │ ┌─────────────┐    │
    │ │ TaskQueue   │ │          │ │ TaskQueue   │    │
    │ │ TaskExecutor│ │          │ │ TaskExecutor│    │
    │ │ Heartbeat   │ │          │ │ Heartbeat   │    │
    │ │ Capabilities│ │          │ │ Capabilities│    │
    │ └─────────────┘ │          │ └─────────────┘    │
    └─────────────────┘          └────────────────────┘
```

---

## 五、核心数据流

### 5.1 消息协议

所有通信通过 `Message<T>` 统一格式：

```
Message {
  id: string           // 消息唯一 ID
  type: MessageType    // register | heartbeat | execute | execute_result |
                       // execute_progress | execute_request | execute_abort |
                       // notify | message | error
  subtype?: string     // 子类型（如 notify 的具体事件名）
  from: string         // 发送方 ID
  to: string           // 接收方 ID
  replyTo?: string     // 回复的目标消息 ID
  payload: T           // 消息内容
  timestamp: number    // 时间戳
}
```

### 5.2 任务生命周期

```
调用方                    Server                     Client
  │                        │                          │
  │  executeAny/executeTo  │                          │
  │───────────────────────▶│                          │
  │                        │  dispatch (execute msg)   │
  │                        │─────────────────────────▶│
  │                        │                          │
  │                        │  execute_progress (多次)   │
  │                        │◀─────────────────────────│
  │                        │                          │
  │                        │  execute_result           │
  │                        │◀─────────────────────────│
  │  Promise resolve       │                          │
  │◀───────────────────────│                          │
```

TaskStore 在每个节点记录 history：

```
TaskRecord {
  id, name, params, status, initiator, createdAt
  history: [
    { type: "created",    at, by: "server" }
    { type: "dispatched", at, to: "client-x" }
    { type: "progress",   at, by, step, progress, message }  // 同 step 合并
    { type: "completed",  at, by, result } | { type: "failed", at, by, error }
  ]
}
```

### 5.3 监控数据流

```
UniOpc Server ──notify──▶ WatcherClient ──事件──▶ StateStore ──SSE──▶ Vue Frontend
                              │                      │
                              │ snapshot (全量)       │ REST API (/api/*)
                              │ task:created (增量)   │
                              │ task:updated (增量)   │
                              │ client:online/offline │
                              │ client:registered     │
```

---

## 六、关键模块详解

### 6.1 Server (`src/server/server.ts`)

Server 是整个框架的核心，负责：

| 职责 | 实现 |
|------|------|
| 连接管理 | 通过 ConnectionManager 跟踪所有客户端状态 |
| 能力注册 | 通过 CapabilityRegistry 维护 client↔capability 双向映射 |
| 任务调度 | 通过 TaskDispatcher 选择最优客户端分发任务 |
| 任务记录 | 内置 TaskStore (Map)，记录完整 history |
| Watcher 支持 | 注册为 watcher 的客户端接收所有事件推送 |
| C2C 路由 | 客户端间通过 Server 中转调用 |

**任务调度策略**：优先选择空闲 → 队列最短的在线客户端。

**公共 API**：
- `executeAny(name, params)` — 自动选择客户端执行
- `executeTo(clientId, name, params)` — 指定客户端执行
- `notify(clientId, subtype, payload)` — 推送通知
- `getClient(id)` / `getClients()` / `getOnlineClients()` — 状态查询

### 6.2 Client (`src/client/client.ts`)

Client 是客户端主类，负责：

| 职责 | 实现 |
|------|------|
| 连接管理 | 自动重连（指数退避） |
| 能力注册 | `register()` 注册能力，注册后 server 端可见 |
| 任务执行 | TaskQueue + TaskExecutor 处理接收到的任务 |
| 心跳上报 | 定期上报状态（队列长度、当前任务、uptime、内存） |
| C2C 调用 | `execute()` 通过 server 中转调用其他 client 的能力 |

**执行模式**：
- `queue` — 排队执行，按优先级顺序
- `preemptive` — 可抢占，高优先级任务可暂停低优先级任务

**重试机制**：支持配置 `maxRetries` 和 `retryDelay`。

### 6.3 WatcherClient (`src/client/watcher-client.ts`)

继承 Client，注册时标记 `watcher: true`，Server 会：
1. 连接时推送全量 Snapshot（clients + capabilities + tasks）
2. 后续通过 notify 推送增量事件

```typescript
interface WatcherSnapshot {
  clients: ClientState[]
  capabilities: CapabilityDefinition[]
  tasks: TaskRecord[]
}

interface WatcherClientEvents {
  "snapshot": (snapshot: WatcherSnapshot) => void
  "client:online": (state: ClientState) => void
  "client:offline": (info: { id: string }) => void
  "client:registered": (data) => void
  "task:created": (task: TaskRecord) => void
  "task:updated": (task: TaskRecord) => void
}
```

### 6.4 Monitor 后端

| 文件 | 职责 |
|------|------|
| `state-store.ts` | 接收 WatcherClient 事件，维护 clients/capabilities/tasks 的内存状态 |
| `api.ts` | REST 端点：/api/status、/api/clients、/api/clients/:id、/api/capabilities、/api/tasks、/api/tasks/:id |
| `sse.ts` | SSE 端点：init（全量）、client:*、task:* 增量推送 |
| `index.ts` | 启动入口，连接 UniOpc Server，启动 Hono HTTP 服务 |

### 6.5 Monitor 前端

| 组件 | 职责 |
|------|------|
| `useSSE.ts` | EventSource 连接管理，提供 clients/tasks/capabilities/status 响应式数据 |
| `App.vue` | 主布局：header + 导航栏 (Clients/Tasks) + StatsCard + router-view |
| `ClientsPage.vue` | 客户端列表，点击展开显示关联任务 |
| `TasksPage.vue` | 全局任务列表（倒序），点击展开显示 history 时间线 |
| `TaskHistoryTimeline.vue` | 渲染任务 history（created/dispatched/started/completed/failed/progress） |
| `ClientTaskList.vue` | 按 client id 筛选关联任务（history 中出现该 client 的所有任务） |

---

## 七、API 参考

### 7.1 REST API (Monitor 后端)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/status` | 监控状态（客户端数、在线数、忙碌数、能力数） |
| GET | `/api/clients` | 所有客户端列表 |
| GET | `/api/clients/:id` | 指定客户端详情 |
| GET | `/api/capabilities` | 所有能力列表 |
| GET | `/api/tasks` | 所有任务记录 |
| GET | `/api/tasks/:id` | 指定任务详情（含 history） |

### 7.2 SSE 事件 (Monitor 后端)

| 事件 | 数据 | 触发时机 |
|------|------|----------|
| `init` | `{ clients, capabilities, tasks, status }` | SSE 连接建立 |
| `client:online` | `ClientState` | 客户端上线 |
| `client:offline` | `{ id }` | 客户端离线 |
| `client:registered` | `{ clientId, capabilities }` | 能力注册 |
| `task:created` | `TaskRecord` | 任务创建 |
| `task:updated` | `TaskRecord` | 任务进度更新或完成 |
| `ping` | — | 每 30 秒心跳 |

---

## 八、消息类型一览

| 类型 | 方向 | 说明 |
|------|------|------|
| `register` | Client → Server | 注册能力（watcher 也会用此消息） |
| `register_ack` | Server → Client | 注册确认 |
| `heartbeat` | Client → Server | 心跳上报（队列、uptime、内存） |
| `heartbeat_ack` | Server → Client | 心跳确认 |
| `execute` | Server → Client | 下发任务 |
| `execute_result` | Client → Server | 任务结果返回 |
| `execute_progress` | Client → Server | 任务进度上报 |
| `execute_request` | Client → Server | C2C 调用请求（Server 中转） |
| `execute_abort` | Server → Client | 终止任务 |
| `notify` | 双向 | 通知消息（含 subtype） |
| `message` | 双向 | 通用消息 |
| `error` | 双向 | 错误消息 |

---

## 九、包导出

```json
{
  "uniopc": "./dist/index.js",          // Server + Client + WatcherClient
  "uniopc/server": "./dist/server/",    // Server 相关
  "uniopc/client": "./dist/client/",    // Client + WatcherClient
  "uniopc/core/*": "./dist/core/*"      // TaskRecord, TaskHistoryEntry 等类型
}
```

---

## 十、构建与运行

```bash
# 主框架
npm run build          # tsc 编译到 dist/
npm run dev            # tsc --watch

# Monitor 后端
cd monitor/server && npm run build

# Monitor 前端
cd monitor/web && npm run build
cd monitor/web && npm run dev     # 开发模式 (localhost:5173)

# 启动顺序
# 1. UniOpc Server (port 9400)
# 2. Monitor Server (port 3000, 连接 UniOpc)
# 3. Monitor Web dev server (port 5173, proxy 到 3000)
```

---

## 十一、示例场景

| 示例 | 演示内容 |
|------|----------|
| `basic.ts` | 完整流程：连接、注册、执行、C2C、通知 |
| `heartbeat.ts` | 心跳检测与超时离线 |
| `timeout.ts` | 任务超时处理 |
| `retry.ts` | 失败自动重试 |
| `preemptive.ts` | 高优先级任务抢占 |
| `generator.ts` | Generator 执行模式（可中断） |
| `reconnect.ts` | 断线自动重连 |
| `load-balance.ts` | 多客户端负载均衡 |
| `priority-queue.ts` | 优先级队列调度 |
| `error-handling.ts` | 各类错误处理 |
| `notification.ts` | 服务端推送通知 |
| `client-to-client.ts` | 客户端间通信 |
