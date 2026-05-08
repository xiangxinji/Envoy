# TaskRecord

## Purpose

定义任务记录的数据模型和历史条目类型，为 Server 端提供任务追踪的持久化结构。

## Requirements

### Requirement: TaskRecord 数据模型
系统 SHALL 定义 TaskRecord 类型，包含以下字段：
- `id`: string，任务唯一标识
- `name`: string，任务名称
- `params`: Record<string, unknown>，任务参数
- `status`: "pending" | "running" | "completed" | "failed"，任务当前状态
- `initiator`: string，任务发起方标识（"server" 或 client id）
- `createdAt`: number，创建时间戳
- `history`: TaskHistoryEntry[]，历史记录数组

#### Scenario: 创建 TaskRecord
- **WHEN** Server 端 dispatch 一个任务
- **THEN** 系统创建一个 TaskRecord，status 为 "pending"，history 包含一条 type 为 "created" 的 entry

### Requirement: TaskHistoryEntry 联合类型
系统 SHALL 定义 TaskHistoryEntry 为以下联合类型：
- `{ type: "created", at: number, by: string }`
- `{ type: "dispatched", at: number, to: string }`
- `{ type: "started", at: number, by: string }`
- `{ type: "progress", at: number, by: string, step: string | number, progress: number, message?: string }`
- `{ type: "completed", at: number, by: string, result: TaskResult }`
- `{ type: "failed", at: number, by: string, error: string }`

#### Scenario: history entry 类型安全
- **WHEN** 追加一条 history entry
- **THEN** 系统根据 type 字段确保 entry 的其他字段符合对应类型的结构

### Requirement: Server 端 TaskStore
Server 类 SHALL 维护一个 Map<string, TaskRecord> 用于存储所有任务记录。

#### Scenario: dispatch 时创建记录
- **WHEN** TaskDispatcher.dispatch 被调用
- **THEN** 系统创建 TaskRecord 并追加 created 和 dispatched 两条 history entry，status 设为 "pending"

#### Scenario: 收到 execute_result 成功
- **WHEN** Server 收到客户端的 execute_result 且 result.success 为 true
- **THEN** 系统追加一条 type 为 "completed" 的 history entry，status 更新为 "completed"

#### Scenario: 收到 execute_result 失败
- **WHEN** Server 收到客户端的 execute_result 且 result.success 为 false
- **THEN** 系统追加一条 type 为 "failed" 的 history entry，status 更新为 "failed"

#### Scenario: 收到 execute_progress
- **WHEN** Server 收到客户端的 execute_progress
- **THEN** 系统追加一条 type 为 "progress" 的 history entry。若已存在相同 step 的 progress entry，MUST 替换为最新一条

### Requirement: TaskStore 不设上限
系统 SHALL 保留所有 TaskRecord，不自动清理。任务数据仅在 Server 进程生命周期内存在。

#### Scenario: 长时间运行的任务累积
- **WHEN** Server 长时间运行产生大量任务记录
- **THEN** 所有记录均保留在 TaskStore 中，不做自动清理
