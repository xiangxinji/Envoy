## 1. 后端项目初始化

- [x] 1.1 创建 `monitor/server/` 目录结构及 `package.json`（hono、@hono/node-server、uniopc workspace 引用）
- [x] 1.2 创建 `monitor/server/tsconfig.json`
- [x] 1.3 迁移 `examples/monitor/src/state-store.ts` 到 `monitor/server/src/state-store.ts`，增加 EventEmitter 能力用于 SSE 推送
- [x] 1.4 迁移 `examples/monitor/src/api.ts` 到 `monitor/server/src/api.ts`
- [x] 1.5 创建 `monitor/server/src/sse.ts`，实现 SSE 推送端点（GET /sse）
- [x] 1.6 创建 `monitor/server/src/index.ts`，整合 WatcherClient、StateStore、API、SSE、静态文件托管
- [x] 1.7 安装依赖并验证 TypeScript 编译通过

## 2. 前端项目初始化

- [x] 2.1 使用 Vite 创建 Vue 3 + TypeScript 项目 `monitor/web/`
- [x] 2.2 安装配置 Tailwind CSS（tailwind.config.js、postcss.config.js、全局样式）
- [x] 2.3 配置 `vite.config.ts`：开发代理（/api/*、/sse → localhost:3000）

## 3. 前端核心实现

- [x] 3.1 实现 `src/composables/useSSE.ts`：EventSource 连接、响应式状态、init/增量事件处理、自动重连
- [x] 3.2 实现 `src/App.vue`：页面布局（header + main），使用 useSSE 提供数据
- [x] 3.3 实现 `src/components/ConnectionBadge.vue`：连接状态指示器（绿/红）
- [x] 3.4 实现 `src/components/StatsCard.vue`：统计卡片组件
- [x] 3.5 实现 `src/components/ClientTable.vue`：客户端状态表格，带状态颜色标识
- [x] 3.6 实现 `src/components/CapabilityGrid.vue`：能力卡片网格

## 4. 集成与验证

- [x] 4.1 验证前端开发模式：Vite dev server + 后端同时运行，SSE 数据流通
- [x] 4.2 验证前端构建：`npm run build` 输出到 dist/
- [x] 4.3 验证生产模式：后端托管前端静态文件，浏览器访问根路径正常

## 5. 清理

- [x] 5.1 删除 `examples/monitor/` 目录
