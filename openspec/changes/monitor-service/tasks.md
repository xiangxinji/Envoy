## 1. 项目初始化

- [x] 1.1 创建 `examples/monitor/` 目录结构（src/ 子目录）
- [x] 1.2 创建 `examples/monitor/package.json`，添加 hono、@hono/node-server 依赖，配置 workspace 引用根项目
- [x] 1.3 创建 `examples/monitor/tsconfig.json`，继承根 tsconfig 配置

## 2. State Store 实现

- [x] 2.1 创建 `examples/monitor/src/state-store.ts`，实现 StateStore 类
- [x] 2.2 实现 snapshot 事件处理：全量替换 clients Map 和 capabilities 数组
- [x] 2.3 实现 client:online 事件处理：添加/更新客户端状态
- [x] 2.4 实现 client:offline 事件处理：标记客户端为 offline
- [x] 2.5 实现 client:registered 事件处理：更新能力列表
- [x] 2.6 实现查询方法：getAllClients()、getClient(id)、getCapabilities()、getStatus()

## 3. HTTP API 实现

- [x] 3.1 创建 Hono app 并配置 @hono/node-server
- [x] 3.2 实现 `GET /api/status` 端点，返回全局概览
- [x] 3.3 实现 `GET /api/clients` 端点，返回所有客户端列表
- [x] 3.4 实现 `GET /api/clients/:id` 端点，返回单个客户端详情（含 404 处理）
- [x] 3.5 实现 `GET /api/capabilities` 端点，返回所有能力列表

## 4. Dashboard 仪表盘实现

- [x] 4.1 创建 `examples/monitor/src/dashboard.ts`，导出 HTML 模板字符串
- [x] 4.2 实现 HTML 页面布局：概览区、客户端列表区、能力列表区
- [x] 4.3 实现 CSS 样式：状态颜色标识（online=绿、busy=黄、offline=灰）
- [x] 4.4 实现 JS 自动刷新逻辑：每 3 秒 fetch API 更新页面
- [x] 4.5 实现连接状态指示器
- [x] 4.6 实现 `GET /` 端点，返回 dashboard HTML

## 5. 入口与集成

- [x] 5.1 创建 `examples/monitor/src/index.ts`，整合 WatcherClient、StateStore、Hono app
- [x] 5.2 配置 WatcherClient 事件监听，将事件转发到 StateStore
- [x] 5.3 添加启动参数解析（UniOpc Server 地址、Monitor HTTP 端口）
- [x] 5.4 编译验证：确保 TypeScript 编译通过
