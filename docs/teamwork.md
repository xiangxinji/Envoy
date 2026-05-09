# Teamwork 模块

## 一、意图

Teamwork 是 Envoy 框架之上的**团队协作抽象层**。它为"一个编排者 + 多个执行者"的 AI Agent 团队提供角色定义和知识共享机制，使 Agent 之间能够通过共享的 Markdown 知识库实现去中心化的工作流协作。

核心理念：

- **不做编排** — Teamwork 不提供工作流引擎或任务编排。Leader 不逐步驱动 Member 工作。
- **知识驱动** — Leader 将知识（workflow 定义、业务规则等）注册到 Team，Member 执行任务后自主查询知识库决定下一步。
- **去中心化决策** — 每个 Member 是半自主的 agent，不依赖 Leader 的实时指挥。

```
传统编排模式:
Leader ──step1──▶ Member ──结果──▶ Leader ──step2──▶ Member ──结果──▶ Leader ...
                                  ↑
                            Leader 是瓶颈

Teamwork 模式:
Leader ──注册知识库──▶ Team (共享知识)
                         │
              ┌──────────┼──────────┐
              │          │          │
         Member A    Member B    Member C
              │          │          │
         完成任务     完成任务     接收任务
         查询知识     查询知识     查询知识
         自主决策     自主决策     自主决策
```

---

## 二、三个角色

### Team（团队）

封装 Envoy Server，新增文件系统资源管理能力。

| 职责 | 说明 |
|------|------|
| 连接管理 | 继承 Server 的 WebSocket 连接、心跳、能力注册 |
| 资源存储 | 在本地磁盘维护 Markdown 文件，按路径组织 |
| 角色追踪 | 记录每个连接的 Client 角色（leader / member） |
| 权限校验 | 仅允许 Leader 角色进行资源增删改 |
| 变更广播 | 资源变更时向所有 Member 推送通知 |

### Leader（领导者）

封装 Envoy Client，独占资源写入权限。

| 职责 | 说明 |
|------|------|
| 资源注册 | 向 Team 注册/更新 Markdown 知识文件 |
| 资源删除 | 从 Team 删除不再需要的知识文件 |
| 任务分派 | 继承 Client 的 execute 能力，可向 Member 派发任务 |

Leader 不注册具体的执行能力（不实现具体任务），而是注册知识到 Team，供 Member 参考。

### Member（成员）

封装 Envoy Client，资源只读，可接收变更通知。

| 职责 | 说明 |
|------|------|
| 资源查询 | 查询 Team 中的资源列表或具体内容 |
| 变更监听 | 实时接收 Team 的资源变更通知 |
| 任务执行 | 继承 Client 的能力注册和任务执行 |

Member 是实际的工作执行者。它注册具体能力、接收并执行任务，在需要时查询知识库。

---

## 三、架构

```
┌──────────────────────────────────────────────────────────┐
│                       Team (Server)                      │
│                                                          │
│  ┌────────────┐  ┌───────────────┐  ┌────────────────┐  │
│  │  Server     │  │ ResourceMgr   │  │  RoleTracker   │  │
│  │  (原有)     │  │ (文件系统CRUD) │  │ (角色+权限)     │  │
│  └────────────┘  └───────────────┘  └────────────────┘  │
│                                                          │
│  resources/ (磁盘持久化)                                   │
│  ├── workflow/                                            │
│  │   └── etl-pipeline.md                                 │
│  └── knowledge/                                           │
│      └── api-guide.md                                    │
└────────────────────────┬─────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
   ┌──────▼──────┐       │       ┌──────▼──────┐
   │   Leader    │       │       │   Leader    │
   │  (Client)   │       │       │  (Client)   │
   │             │       │       └─────────────┘
   │ 写入资源     │       │
   │ 分派任务     │       │
   └─────────────┘       │
                         │
          ┌──────────────┼──────────────┐
          │              │              │
   ┌──────▼──────┐ ┌────▼──────┐ ┌────▼──────┐
   │   Member    │ │  Member   │ │  Member   │
   │  (Client)   │ │ (Client)  │ │ (Client)  │
   │             │ │           │ │           │
   │ 查询资源     │ │ 查询资源   │ │ 查询资源   │
   │ 接收变更     │ │ 接收变更   │ │ 接收变更   │
   │ 执行任务     │ │ 执行任务   │ │ 执行任务   │
   └─────────────┘ └───────────┘ └───────────┘
```

---

## 四、消息协议

Teamwork 不修改 Envoy 核心消息类型，通过现有 `message`（Client→Server）和 `notify`（Server→Client）的 subtype 机制扩展。

### 角色声明

```
Leader/Member ──message/team:join──▶ Team
  payload: { role: "leader" | "member" }
```

连接后自动发送，Team 记录角色。

### 资源注册

```
Leader ──message/resource:register──▶ Team
  payload: { operationId, path, content }

Team ──notify/resource:ack──▶ Leader
  payload: { operationId, success, error? }

Team ──notify/resource:changed──▶ All Members
  payload: { action: "created"|"updated", path }
```

### 资源删除

```
Leader ──message/resource:delete──▶ Team
  payload: { operationId, path }

Team ──notify/resource:ack──▶ Leader
  payload: { operationId, success, error? }

Team ──notify/resource:changed──▶ All Members
  payload: { action: "deleted", path }
```

### 资源查询

```
Member ──message/resource:query──▶ Team
  payload: { queryId, type: "list" }
  payload: { queryId, type: "get", path }

Team ──notify/resource:query-result──▶ Member
  payload: { queryId, success, paths? | content?, error? }
```

---

## 五、数据流：一次完整的资源操作

```
1. Leader 注册知识
   leader.registerResource("workflow/etl.md", "# ETL Pipeline...")
     │
     ├─ send("resource:register", {operationId, path, content})
     │
     ▼
   Team 收到消息
     ├─ 校验角色 → 是 leader ✓
     ├─ 校验路径 → 无目录遍历 ✓
     ├─ 写入文件 → resources/workflow/etl.md
     ├─ notify leader → resource:ack {success: true}
     └─ 广播所有 member → resource:changed {action: "created", path}

2. Member 查询知识
   member.getResource("workflow/etl.md")
     │
     ├─ send("resource:query", {queryId, type: "get", path})
     │
     ▼
   Team 收到消息
     ├─ 读取文件 → resources/workflow/etl.md
     └─ notify member → resource:query-result {content: "..."}

3. Member 自主决策（未来）
   member 完成任务后
     ├─ 拉取相关知识 → getResource("workflow/etl.md")
     ├─ 喂给 LLM → "根据这个 workflow，下一步做什么？"
     └─ 自主决定下一步行动
```

---

## 六、API 参考

### Team

```typescript
import { Team } from "envoy";

const team = new Team({
  port: 9400,                // 监听端口
  host?: "0.0.0.0",         // 监听地址
  resourceRoot?: "resources", // 资源存储目录（默认 resources/）
  heartbeatTimeout?: 30000,  // 心跳超时
  defaultTaskTimeout?: 60000 // 任务超时
});

await team.start();
await team.stop();
team.innerServer;  // 访问底层 Server 实例
```

**事件：**

| 事件 | 参数 | 触发时机 |
|------|------|----------|
| `leader:joined` | `(clientId)` | Leader 连接并声明角色 |
| `member:joined` | `(clientId)` | Member 连接并声明角色 |
| `resource:changed` | `(event)` | 资源被创建/更新/删除 |

### Leader

```typescript
import { Leader } from "envoy";

const leader = new Leader({
  id: "lead-1",
  servers: ["ws://localhost:9400"],
  // ...其余同 ClientOptions
});

await leader.connect();

// 资源操作
const ack = await leader.registerResource("workflow/etl.md", "# ETL...");
await leader.deleteResource("workflow/old.md");

// 继承自 Client
await leader.execute("some-task", { ... });
leader.register("capability-name", { execute: async (ctx) => { ... } });
```

### Member

```typescript
import { Member } from "envoy";

const member = new Member({
  id: "member-1",
  servers: ["ws://localhost:9400"],
  // ...其余同 ClientOptions
});

await member.connect();

// 资源查询
const paths = await member.listResources();
const content = await member.getResource("workflow/etl.md");

// 监听变更
member.on("resource-changed", (event) => {
  console.log(event.action, event.path); // "created" | "updated" | "deleted"
});

// 继承自 Client
member.register("capability-name", { execute: async (ctx) => { ... } });
```

---

## 七、目录结构

```
src/teamwork/
├── types.ts     # 类型定义（ResourceChangedEvent, TeamOptions 等）
├── team.ts      # Team 类 — Server 封装 + 文件系统资源管理 + 角色权限
├── leader.ts    # Leader 类 — Client 封装 + 资源写入
├── member.ts    # Member 类 — Client 封装 + 资源只读 + 变更监听
└── index.ts     # 模块导出
```

---

## 八、设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 资源操作方式 | 复用 notify/message subtype | 不修改核心消息类型，零侵入 |
| 资源存储 | 文件系统持久化 | Markdown 本身就是文件，重启不丢失 |
| 角色声明 | 连接后发 `team:join` 消息 | 不修改 Server 的 register 处理逻辑 |
| 变更推送 | 增量通知（action + path） | Member 按需拉取内容，不广播全部数据 |
| 编排方式 | 不提供 | 未来由 LLM + 知识库驱动，Teamwork 只管知识共享 |

---

## 九、安全性

- **路径校验** — 拒绝 `..` 路径遍历、绝对路径、null 字节
- **角色权限** — 只有 Leader 角色可以增删改资源，Member 只能查询
- **信任模型** — 当前假设 Team 内所有连接可信，未实现鉴权（未来可加 token）
