## ADDED Requirements

### Requirement: StateStore 管理 tasks
StateStore SHALL 新增 tasks 数据管理，支持接收全量任务和增量更新。

#### Scenario: 接收 Snapshot 全量任务
- **WHEN** StateStore 收到 snapshot 数据
- **THEN** 清空现有 tasks 并用 snapshot 中的 tasks 数据填充

#### Scenario: 接收 task:created 事件
- **WHEN** StateStore 收到 task:created 事件
- **THEN** 将新 TaskRecord 添加到 tasks 中

#### Scenario: 接收 task:updated 事件
- **WHEN** StateStore 收到 task:updated 事件
- **THEN** 用更新后的 TaskRecord 替换 tasks 中对应 id 的记录

### Requirement: 任务 REST API
Monitor 后端 SHALL 提供以下 API 端点：

- `GET /api/tasks` — 返回所有任务记录列表
- `GET /api/tasks/:id` — 返回指定 id 的任务记录，不存在时返回 404

#### Scenario: 获取所有任务
- **WHEN** 客户端请求 GET /api/tasks
- **THEN** 返回 StateStore 中所有 TaskRecord 的 JSON 数组

#### Scenario: 获取指定任务
- **WHEN** 客户端请求 GET /api/tasks/:id 且任务存在
- **THEN** 返回对应 TaskRecord 的 JSON 对象

#### Scenario: 任务不存在
- **WHEN** 客户端请求 GET /api/tasks/:id 且任务不存在
- **THEN** 返回 404 状态码和 `{ error: "Task not found" }`

### Requirement: 任务 SSE 事件推送
Monitor 后端 SHALL 通过 SSE 推送任务相关事件：
- `task:created` — 新任务创建时推送完整 TaskRecord
- `task:updated` — 任务状态变更时推送更新后的 TaskRecord

#### Scenario: SSE 连接时推送初始任务数据
- **WHEN** SSE 客户端连接
- **THEN** init 事件中包含 tasks 字段，为当前所有任务记录

#### Scenario: 新任务创建时 SSE 推送
- **WHEN** StateStore 接收到 task:created
- **THEN** SSE 推送 event: task:created，data 为 TaskRecord JSON

#### Scenario: 任务更新时 SSE 推送
- **WHEN** StateStore 接收到 task:updated
- **THEN** SSE 推送 event: task:updated，data 为更新后的 TaskRecord JSON
