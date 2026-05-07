## ADDED Requirements

### Requirement: 状态存储初始化
Monitor State Store SHALL 在接收到 WatcherClient 的 `snapshot` 事件时，使用 snapshot 中的 clients 和 capabilities 数据初始化内存状态。

#### Scenario: 收到初始 snapshot
- **WHEN** WatcherClient 发出 `snapshot` 事件，包含 clients 数组和 capabilities 数组
- **THEN** State Store 将 clients 存入内部 Map（key 为 client id），将 capabilities 存入内部数组

### Requirement: 客户端上线状态更新
State Store SHALL 在接收到 `client:online` 事件时，将对应客户端状态添加或更新到内存 Map 中。

#### Scenario: 新客户端上线
- **WHEN** WatcherClient 发出 `client:online` 事件，携带 ClientState 对象
- **THEN** State Store 将该 ClientState 写入 Map，如果已存在则覆盖

### Requirement: 客户端离线状态更新
State Store SHALL 在接收到 `client:offline` 事件时，将对应客户端状态标记为 offline。

#### Scenario: 客户端离线
- **WHEN** WatcherClient 发出 `client:offline` 事件，携带 `{ id: string }` 信息
- **THEN** State Store 将对应客户端的 status 设为 "offline"

### Requirement: 能力注册更新
State Store SHALL 在接收到 `client:registered` 事件时，更新对应客户端的 capabilities 列表。

#### Scenario: 客户端注册新能力
- **WHEN** WatcherClient 发出 `client:registered` 事件，携带 `{ clientId, capabilities }`
- **THEN** State Store 更新全局 capabilities 列表中该客户端对应的能力记录

### Requirement: 全局状态查询
State Store SHALL 提供查询方法，返回当前所有客户端列表、单个客户端详情、所有能力列表和全局概览统计。

#### Scenario: 查询所有客户端
- **WHEN** 调用 `getAllClients()` 方法
- **THEN** 返回 Map 中所有 ClientState 对象的数组

#### Scenario: 查询单个客户端
- **WHEN** 调用 `getClient(id)` 方法且该 id 存在
- **THEN** 返回对应的 ClientState 对象

#### Scenario: 查询不存在的客户端
- **WHEN** 调用 `getClient(id)` 方法且该 id 不存在
- **THEN** 返回 undefined

#### Scenario: 查询全局概览
- **WHEN** 调用 `getStatus()` 方法
- **THEN** 返回包含 totalClients、onlineClients、busyClients、totalCapabilities、connectedAt 的对象
