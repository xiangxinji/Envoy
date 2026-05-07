## ADDED Requirements

### Requirement: 全局状态 API 端点
Monitor HTTP API SHALL 提供 `GET /api/status` 端点，返回全局概览信息。

#### Scenario: 查询全局状态
- **WHEN** 客户端发送 `GET /api/status` 请求
- **THEN** 返回 JSON 对象，包含 totalClients、onlineClients、busyClients、totalCapabilities、connectedAt（Monitor 自身连接时间）

### Requirement: 客户端列表 API 端点
Monitor HTTP API SHALL 提供 `GET /api/clients` 端点，返回所有客户端状态列表。

#### Scenario: 查询所有客户端
- **WHEN** 客户端发送 `GET /api/clients` 请求
- **THEN** 返回 ClientState 对象的 JSON 数组

### Requirement: 单个客户端详情 API 端点
Monitor HTTP API SHALL 提供 `GET /api/clients/:id` 端点，返回指定客户端的详细状态。

#### Scenario: 查询存在的客户端
- **WHEN** 客户端发送 `GET /api/clients/:id` 请求且该 id 存在
- **THEN** 返回对应 ClientState 的 JSON 对象，HTTP 状态码 200

#### Scenario: 查询不存在的客户端
- **WHEN** 客户端发送 `GET /api/clients/:id` 请求且该 id 不存在
- **THEN** 返回 `{ error: "Client not found" }` JSON，HTTP 状态码 404

### Requirement: 能力列表 API 端点
Monitor HTTP API SHALL 提供 `GET /api/capabilities` 端点，返回所有已注册的能力列表。

#### Scenario: 查询所有能力
- **WHEN** 客户端发送 `GET /api/capabilities` 请求
- **THEN** 返回 CapabilityDefinition 对象的 JSON 数组

### Requirement: API 响应格式
所有 API 端点 SHALL 返回 `Content-Type: application/json` 的响应。

#### Scenario: 响应头检查
- **WHEN** 请求任意 /api/* 端点
- **THEN** 响应头包含 `Content-Type: application/json`
