## Context

UniOpc 已有成熟的 Server/Client 任务调度框架：Server 管理连接、能力注册和任务分发，Client 注册能力并执行任务。现有架构是"所有 Client 平等"模型，没有角色区分和知识共享机制。

team-work 在此基础上构建团队协作语义层——三个角色：Team（Server 封装）、Leader（Client 封装）、Member（Client 封装），核心新增是文件系统级的 Markdown 资源管理和变更推送。

## Goals / Non-Goals

**Goals:**

- 提供 Team/Leader/Member 三层抽象，代码放在 `src/teamwork/` 下，由 `src/index.ts` 导出
- Team 端支持 Markdown 文件的增删改查，持久化到磁盘
- Leader 独占资源的写入权限（增、删、改）
- Member 可查询资源，并实时接收资源变更通知
- Leader 变更资源时，Team 广播通知给所有已连接的 Member
- 通过现有消息机制（notify subtype）实现资源操作

**Non-Goals:**

- 不实现工作流编排引擎（未来由 LLM + 知识库驱动）
- 不实现资源版本控制或 diff 追踪
- 不实现资源的分片、分页或全文搜索
- 不修改现有 Server/Client 核心代码（仅新增 `src/teamwork/` 模块和 `src/index.ts` 导出）
- 不实现 Leader 的鉴权机制（假设 Team 内信任所有连接）

## Decisions

### 1. 复用现有 Server/Client，不修改核心

**选择**: team-work 通过继承/封装现有 Server 和 Client 实现，不引入新的传输层。

**理由**: Server 已具备连接管理、消息路由、notify 广播能力。资源操作可以通过 `notify` 的 subtype 扩展来实现，无需修改消息协议核心。

**替代方案**: 在 Server 核心中添加资源管理模块——侵入性太强，违反关注点分离。

### 2. 资源操作通过 notify 消息扩展

**选择**: 新增以下 notify subtype：

| 方向 | subtype | 用途 |
|------|---------|------|
| Leader → Team | `resource:register` | 注册/更新资源 |
| Leader → Team | `resource:delete` | 删除资源 |
| Member → Team | `resource:query` | 查询资源列表或内容 |
| Team → Leader | `resource:ack` | 操作确认 |
| Team → All Members | `resource:changed` | 广播资源变更 |

**理由**: notify 已支持 subtype 和 payload，且 Server 已有 `notify(clientId, subtype, payload)` 和广播能力。不需要新增 MessageType。

**替代方案**: 新增 message type（如 `resource_op`）——需要修改 `src/core/message.ts`，侵入核心。

### 3. 文件系统存储，按路径组织

**选择**: 资源存储在 Team 进程工作目录下的 `resources/` 目录，按 Leader 注册时的路径组织。

```
resources/
├── workflow/
│   ├── etl-pipeline.md
│   └── data-sync.md
└── knowledge/
    └── api-guide.md
```

**理由**: Markdown 文件本身就是磁盘文件，直接文件系统存储最自然。支持按路径组织，Leader 注册时指定相对路径。

**替代方案**: 内存 Map 存储——重启丢失，不适合知识库场景。

### 4. Leader 身份通过注册消息声明

**选择**: Leader 连接后发送 `register` 时在 payload 中标记 `role: "leader"`。Team 记录角色，仅允许 leader 角色的 client 操作资源。

**理由**: 最小侵入，利用现有 register 机制。Team 端在处理资源操作前检查发送者角色。

### 5. 变更推送：全量路径列表

**选择**: Leader 变更资源后，Team 广播 `resource:changed` 给所有 Member，payload 包含变更类型（created/updated/deleted）和资源路径。Member 据此决定是否重新拉取。

**理由**: 推送增量信息（路径 + 变更类型），Member 按需拉取完整内容。避免广播大量内容。

## Risks / Trade-offs

- **[无鉴权]** → 任何连接的 Client 都可能声称自己是 Leader。当前假设 Team 内可信，未来可加 token 验证。
- **[文件系统依赖]** → 资源路径需要防止目录遍历攻击（如 `../../etc/passwd`）。Team 端必须校验路径合法性。
- **[无版本控制]** → 资源覆盖更新，无法回退。可接受，因为 Leader 掌控知识库。
- **[广播开销]** → 每个 Member 都会收到变更通知，即使不关心该资源。可接受，Member 端自行过滤。
