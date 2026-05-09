## Context

Envoy 是一个基于 WebSocket 的 Server/Client 通信框架，已有 `WatcherClient` 可作为外部观察者连接到 Server，接收初始 snapshot（所有客户端状态 + 能力列表）和实时事件（client:online/offline/registered）。当前缺少一个独立的 Monitor Service 来把这些信息通过 HTTP API 和 Web 仪表盘暴露出去。

现有能力：
- `WatcherClient`：接收 `snapshot`、`client:online`、`client:offline`、`client:registered` 事件
- `ClientState`：包含 id、status、connectedAt、lastHeartbeat、queueLength、currentTask、uptime、memoryUsage
- `CapabilityDefinition`：包含 name、description、params、mode、priority、timeout 等

## Goals / Non-Goals

**Goals:**
- 提供一个独立进程的 Monitor Service，零侵入 Envoy 核心代码
- 通过 Hono HTTP 框架暴露 REST API 查询服务端和客户端状态
- 提供一个内嵌 HTML 仪表盘页面，可视化展示状态信息
- 自动通过 WatcherClient 维护内存中的最新状态

**Non-Goals:**
- 不修改 Envoy 核心模块的任何代码
- 不支持 WebSocket 推送到前端（首版用 API 轮询即可）
- 不支持历史数据持久化或事件回放
- 不支持认证/鉴权

## Decisions

### 1. 项目结构：`examples/monitor/` 独立子项目

**选择**：在 `examples/monitor/` 下创建独立的 package.json，通过 workspace 引用根项目。

**理由**：Monitor 是 Envoy 的使用示例，放在 examples 下语义清晰。独立 package.json 可以有自己的依赖（hono）而不污染主项目。

**备选**：单独仓库。过于分离，不利于示例演示。

### 2. HTTP 框架：Hono

**选择**：使用 Hono 作为 HTTP 框架。

**理由**：轻量、类型安全、支持多种运行时。用户明确要求。

### 3. 状态管理：内存 Map + 增量更新

**选择**：在 Monitor 进程内存中维护 `Map<string, ClientState>` 和 `CapabilityDefinition[]`，通过 WatcherClient 事件增量更新。

**更新策略**：
- `snapshot` 事件：全量替换
- `client:online`：添加/更新对应 client
- `client:offline`：标记为 offline 或移除
- `client:registered`：更新对应 client 的 capabilities

**理由**：简单直接，无需数据库。Monitor 是临时观察工具，重启后重新连接获取 snapshot 即可。

### 4. 前端：内嵌 HTML + fetch 轮询

**选择**：HTML/CSS/JS 直接内嵌在 TypeScript 代码中（模板字符串），通过 `setInterval` + `fetch` 轮询 API。

**理由**：零构建工具依赖，单文件部署，打开即用。首版不需要实时推送。

**备选**：SSE (Server-Sent Events) 推送。首版不需要，可以后续迭代。

### 5. 文件结构

```
examples/monitor/
├── package.json        # 独立依赖（hono, @hono/node-server）
├── tsconfig.json       # 继承根配置
└── src/
    ├── index.ts        # 入口：启动 Monitor Service
    ├── state-store.ts  # 内存状态存储
    └── dashboard.ts    # HTML 仪表盘模板
```

## Risks / Trade-offs

- **[WatcherClient 断连]** → Monitor 重连后重新获取 snapshot，状态自动恢复。利用 Client 内置的重连机制。
- **[状态延迟]** → 轮询间隔 3 秒，对监控场景足够。事件是实时的，延迟来自前端轮询。
- **[大量客户端]** → 内存存储在数百客户端级别没有问题。超过千级需要考虑分页，首版不做。
