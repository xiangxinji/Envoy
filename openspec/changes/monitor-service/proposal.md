## Why

UniOpc Server 运行时缺乏外部可观测性——无法在不侵入核心代码的情况下，实时查看服务端状态、客户端连接情况和任务执行情况。需要一个独立的 Monitor Service，作为外部观察者连接到已存在的 UniOpc Server，通过 HTTP API 和 Web 仪表盘暴露运行状态。

## What Changes

- 新增 `examples/monitor/` 独立项目，包含自己的 `package.json` 和入口文件
- 使用 `WatcherClient` 连接到已存在的 UniOpc Server，接收 snapshot 和实时事件
- 在内存中维护一份最新状态（State Store），通过增量事件持续更新
- 使用 Hono 框架暴露 REST API：
  - `GET /api/status` — 全局概览（在线客户端数、能力数、运行时长等）
  - `GET /api/clients` — 所有客户端状态列表
  - `GET /api/clients/:id` — 单个客户端详情
  - `GET /api/capabilities` — 所有已注册能力
- 根路径 `GET /` 返回内嵌 HTML 仪表盘页面，可视化展示客户端状态、能力列表、最近事件流
- 不修改 UniOpc 核心代码，完全基于现有 WatcherClient 能力

## Capabilities

### New Capabilities
- `monitor-state-store`: 基于内存的状态存储，维护来自 WatcherClient 的 snapshot 和增量事件，提供查询接口
- `monitor-http-api`: Hono HTTP API 层，暴露 REST 端点查询状态存储
- `monitor-dashboard`: 内嵌 HTML 仪表盘页面，通过 API 轮询或 fetch 展示实时状态

### Modified Capabilities
（无，不修改现有 UniOpc 核心代码）

## Impact

- **新增代码**: `examples/monitor/` 目录，约 3-4 个文件
- **新增依赖**: `hono`（HTTP 框架），引用本地 UniOpc 包的 `WatcherClient`
- **无破坏性变更**: 不修改任何现有模块
- **运行方式**: 独立进程启动，需要 UniOpc Server 已在运行
