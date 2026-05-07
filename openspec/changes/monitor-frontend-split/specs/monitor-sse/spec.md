## ADDED Requirements

### Requirement: SSE 连接端点
Monitor Server SHALL 提供 `GET /sse` 端点，返回 `Content-Type: text/event-stream` 响应，建立 SSE 长连接。

#### Scenario: 建立 SSE 连接
- **WHEN** 前端通过 `EventSource` 连接 `GET /sse`
- **THEN** 服务端返回 `text/event-stream` 响应，保持连接打开

### Requirement: SSE 初始全量推送
SSE 端点 SHALL 在客户端连接后立即推送一条 `init` 事件，包含当前全量状态。

#### Scenario: 连接时推送初始状态
- **WHEN** SSE 连接建立
- **THEN** 服务端推送 `event: init` 消息，data 为 JSON 对象，包含 `clients` 数组、`capabilities` 数组、`status` 对象

### Requirement: SSE 实时事件推送
SSE 端点 SHALL 在 StateStore 状态变更时，向所有已连接的 SSE 客户端推送对应事件。

#### Scenario: 客户端上线推送
- **WHEN** WatcherClient 收到 `client:online` 事件
- **THEN** SSE 端点向所有连接推送 `event: client:online`，data 为该客户端的 ClientState

#### Scenario: 客户端离线推送
- **WHEN** WatcherClient 收到 `client:offline` 事件
- **THEN** SSE 端点向所有连接推送 `event: client:offline`，data 为 `{ id: string }`

#### Scenario: 能力注册推送
- **WHEN** WatcherClient 收到 `client:registered` 事件
- **THEN** SSE 端点向所有连接推送 `event: client:registered`，data 为 `{ clientId, capabilities }`

### Requirement: SSE 连接断开清理
SSE 端点 SHALL 在客户端断开连接时从连接列表中移除，不造成内存泄漏。

#### Scenario: 客户端断开连接
- **WHEN** SSE 客户端关闭 EventSource 连接
- **THEN** 服务端从连接列表中移除该客户端，不再推送事件
