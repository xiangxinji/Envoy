## Why

Envoy 目前提供了基础的 Server/Client 任务调度能力，但没有"团队协作"的语义层。当需要构建"一个编排者 + 多个执行者"的 AI Agent 团队时，缺少角色定义和知识共享机制。team-work 在不修改现有 Server/Client 的前提下，提供 Team/Leader/Member 三层抽象，让 Agent 团队通过共享的 Markdown 知识库实现去中心化的工作流协作。

## What Changes

- 新增 `src/teamwork/` 目录，包含 Team、Leader、Member 三个类，由 `src/index.ts` 统一导出
- Team 封装 Server，新增文件系统资源管理（Markdown 文件的 CRUD + 变更推送）
- Leader 封装 Client，具备向 Team 注册/更新/删除资源的唯一权限
- Member 封装 Client，可查询 Team 资源，接收资源变更通知
- Leader 对 Team 资源的任何变更会实时推送给所有 Member
- 通过现有 Envoy 消息机制实现资源操作（不修改 Server/Client 核心）

## Capabilities

### New Capabilities

- `team-resource`: Team 端文件系统资源管理——存储 Markdown 文件、处理资源增删改查请求、Leader 变更时广播通知给所有 Member
- `team-roles`: 三个角色的定义与封装——Team（Server 封装 + 资源管理）、Leader（Client 封装 + 资源写入权限）、Member（Client 封装 + 资源只读）

### Modified Capabilities

（无需修改现有能力）

## Impact

- 新增 `src/teamwork/` 目录（约 4 个文件），由 `src/index.ts` 导出，不修改现有 Server/Client 核心
- 需要在现有消息协议中新增资源操作相关的消息类型（通过 notify 的 subtype 扩展）
- 资源以文件形式存储在 Team 进程的本地磁盘上
- Leader 和 Member 之间通过 Team 中转实现知识共享
