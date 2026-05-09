## Context

当前 `examples/monitor/` 是一个单体应用，WatcherClient + Hono + 内嵌 HTML 都在一个进程里。HTML/CSS/JS 通过模板字符串嵌入 TypeScript，无构建工具、无热更新、无组件化。需要将前端独立出来，后端增加 SSE 实时推送能力。

现有后端代码可直接迁移：state-store.ts、api.ts（需增加 SSE）、index.ts。
现有前端代码（dashboard.ts）将被完全替换为 Vue 3 项目。

## Goals / Non-Goals

**Goals:**
- 将 monitor 移到项目根目录 `monitor/`，前后端分离
- 后端提供 SSE 端点，实时推送 WatcherClient 事件
- 前端用 Vue 3 + Vite + Tailwind CSS 构建独立项目
- 开发时 Vite 代理 API/SSE 到后端
- 生产时 Hono 托管前端静态文件

**Non-Goals:**
- 不修改 Envoy 核心代码
- 不支持历史数据持久化
- 不支持认证/鉴权
- 不使用 WebSocket 做前后端通信（SSE 足够）

## Decisions

### 1. 目录结构：`monitor/server/` + `monitor/web/`

```
monitor/
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts          # 入口
│       ├── state-store.ts    # 状态存储（迁移自 examples）
│       ├── api.ts            # REST API 路由（迁移）
│       └── sse.ts            # SSE 推送端点（新增）
└── web/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── main.ts
        ├── App.vue
        ├── composables/
        │   └── useSSE.ts     # SSE 连接 composable
        └── components/
            ├── ConnectionBadge.vue
            ├── StatsCard.vue
            ├── ClientTable.vue
            └── CapabilityGrid.vue
```

### 2. SSE 推送设计

SSE 端点 `GET /sse`：
- 连接时立即推送当前全量状态（clients + capabilities + status）
- 之后每次 WatcherClient 收到事件，即时推送给所有 SSE 客户端
- 事件类型映射：
  - WatcherClient `snapshot` → SSE `init`（全量状态）
  - WatcherClient `client:online` → SSE `client:online`
  - WatcherClient `client:offline` → SSE `client:offline`
  - WatcherClient `client:registered` → SSE `client:registered`

StateStore 新增事件发射能力，SSE 端点监听 StateStore 事件。

### 3. Hono SSE 实现

使用 Hono 内置的 `streamSSE` 工具函数，维护已连接的 SSE 客户端列表，在 StateStore 事件触发时广播。

### 4. 前端 SSE Composable

`useSSE()` composable：
- 创建 `EventSource` 连接 `/sse`
- 维护响应式状态：`status`、`clients`、`capabilities`、`connected`
- 收到 `init` 事件时全量替换
- 收到增量事件时更新对应数据
- 自动重连

### 5. Vite 开发代理

```ts
// vite.config.ts
server: {
  proxy: {
    '/api': 'http://localhost:3000',
    '/sse': 'http://localhost:3000',
  }
}
```

### 6. 生产构建集成

前端 `npm run build` 输出到 `web/dist/`。后端 Hono 在生产模式下 serve 静态文件：

```ts
import { serveStatic } from '@hono/node-server';
app.use('/*', serveStatic({ root: '../web/dist' }));
```

## Risks / Trade-offs

- **[SSE 连接数限制]** → 浏览器对同域 SSE 连接数有限制（通常 6 个），但监控仪表盘通常只开一个标签页，无影响。
- **[前后端端口不同]** → 开发时 Vite(:5173) 代理到 Hono(:3000)，需要同时启动两个 dev server。用 `concurrently` 或手动启动。
- **[StateStore 事件机制]** → 需要给 StateStore 增加 EventEmitter 能力，从"被动查询"变为"主动推送"。这是对现有 StateStore 的扩展。
