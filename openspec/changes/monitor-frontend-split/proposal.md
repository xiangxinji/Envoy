## Why

当前 monitor 放在 `examples/monitor/` 中，HTML/CSS/JS 全部内嵌在 TypeScript 模板字符串里，维护困难且无法享受现代前端开发体验。需要将其移至项目根目录 `monitor/`，采用前后端分离架构，后端提供 REST API + SSE 实时推送，前端使用 Vue 3 构建独立的监控仪表盘。

## What Changes

- 新增 `monitor/server/` 目录：从 `examples/monitor/` 迁移后端代码，新增 SSE 端点推送实时事件
- 新增 `monitor/web/` 目录：Vue 3 + Vite + Tailwind CSS 前端项目
- 后端 SSE 推送事件：`status`（全局概览）、`client:online`、`client:offline`、`client:registered`、`connected`/`disconnected`
- 前端通过 SSE 接收实时数据，Vue 响应式自动更新组件
- 前端组件：ConnectionBadge、StatsCard、ClientTable、CapabilityGrid
- 开发时 Vite dev server 代理 API/SSE 请求到后端，生产构建由 Hono 托管静态文件
- 删除旧的 `examples/monitor/` 目录

## Capabilities

### New Capabilities
- `monitor-sse`: SSE 实时推送端点，将 WatcherClient 接收到的事件转发给前端
- `monitor-web-frontend`: Vue 3 + Vite + Tailwind CSS 前端仪表盘项目，通过 SSE 消费实时数据

### Modified Capabilities
（无，本次为全新结构替换旧 examples/monitor/）

## Impact

- **新增目录**: `monitor/server/`（后端）、`monitor/web/`（前端）
- **新增依赖**: Vue 3、Vite、Tailwind CSS、@hono/node-server、hono
- **删除目录**: `examples/monitor/`
- **无破坏性变更**: 不影响 Envoy 核心模块（src/）
