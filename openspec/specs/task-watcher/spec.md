# TaskWatcher

## Purpose

定义 Watcher 客户端的任务事件推送机制，使监控端能实时接收任务的创建和状态变更通知。

## Requirements

### Requirement: WatcherSnapshot 包含 tasks
WatcherSnapshot 接口 SHALL 新增 `tasks: TaskRecord[]` 字段。

#### Scenario: Watcher 连接时获取全量任务
- **WHEN** WatcherClient 连接并收到 snapshot 通知
- **THEN** snapshot.payload 中包含 tasks 字段，为 Server 端 TaskStore 的全量任务记录数组

### Requirement: WatcherClientEvents 新增任务事件
WatcherClientEvents SHALL 新增以下事件：
- `task:created`: (task: TaskRecord) => void
- `task:updated`: (task: TaskRecord) => void

#### Scenario: 收到任务创建通知
- **WHEN** WatcherClient 收到 subtype 为 "task:created" 的 notify 消息
- **THEN** 触发 `task:created` 事件，payload 为完整的 TaskRecord

#### Scenario: 收到任务更新通知
- **WHEN** WatcherClient 收到 subtype 为 "task:updated" 的 notify 消息
- **THEN** 触发 `task:updated` 事件，payload 为更新后的完整 TaskRecord

### Requirement: Server 向 Watcher 推送任务事件
Server SHALL 在以下节点通过 notifyWatchers 推送任务事件：
- dispatch 时推送 `task:created`（包含 created + dispatched history）
- execute_progress 时推送 `task:updated`
- execute_result 时推送 `task:updated`（completed 或 failed）

#### Scenario: 任务 dispatch 后 watcher 收到通知
- **WHEN** Server 端 dispatch 一个新任务
- **THEN** 所有已连接的 watcher 收到 subtype 为 "task:created" 的 notify

#### Scenario: 任务 progress 更新后 watcher 收到通知
- **WHEN** Server 收到客户端的 execute_progress
- **THEN** 所有已连接的 watcher 收到 subtype 为 "task:updated" 的 notify

#### Scenario: 任务完成后 watcher 收到通知
- **WHEN** Server 收到客户端的 execute_result
- **THEN** 所有已连接的 watcher 收到 subtype 为 "task:updated" 的 notify
