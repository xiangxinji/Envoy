## ADDED Requirements

### Requirement: Vue 3 + Vite + Tailwind 项目结构
Monitor Web SHALL 初始化为 Vue 3 + Vite + Tailwind CSS 项目，位于 `monitor/web/` 目录。

#### Scenario: 项目可构建
- **WHEN** 在 `monitor/web/` 目录运行 `npm run build`
- **THEN** Vite 将前端构建输出到 `dist/` 目录，无报错

### Requirement: SSE 数据连接
Monitor Web SHALL 通过 `useSSE()` composable 建立 SSE 连接，维护响应式状态。

#### Scenario: SSE 连接并接收初始数据
- **WHEN** 页面加载且 SSE 连接成功
- **THEN** composable 的 `status`、`clients`、`capabilities` 响应式变量被填充初始数据

#### Scenario: SSE 增量更新
- **WHEN** 收到 SSE `client:online` 事件
- **THEN** `clients` 响应式数组中对应客户端被更新或新增

### Requirement: 连接状态指示器
Monitor Web SHALL 在页面头部显示与 Envoy Server 的连接状态。

#### Scenario: 已连接
- **WHEN** SSE 连接处于 OPEN 状态
- **THEN** 显示绿色"已连接"徽章

#### Scenario: 未连接
- **WHEN** SSE 连接处于 CLOSED 或 CONNECTING 状态
- **THEN** 显示红色"未连接"徽章

### Requirement: 统计卡片展示
Monitor Web SHALL 在页面顶部以卡片形式展示全局统计信息。

#### Scenario: 统计卡片渲染
- **WHEN** 页面加载且有状态数据
- **THEN** 展示卡片：客户端总数、在线客户端数、忙碌客户端数、已注册能力数

### Requirement: 客户端列表展示
Monitor Web SHALL 以表格展示所有客户端状态。

#### Scenario: 客户端表格渲染
- **WHEN** 有客户端数据
- **THEN** 表格列包含：ID、状态（online/busy/offline 带颜色标识）、连接时长、队列长度、当前任务

### Requirement: 能力列表展示
Monitor Web SHALL 以卡片网格展示所有已注册能力。

#### Scenario: 能力卡片渲染
- **WHEN** 有能力数据
- **THEN** 每个能力卡片显示：名称、描述、执行模式、优先级

### Requirement: Vite 开发代理
Monitor Web 的 Vite dev server SHALL 配置代理，将 `/api/*` 和 `/sse` 请求转发到后端。

#### Scenario: API 代理
- **WHEN** 开发模式下前端请求 `/api/status`
- **THEN** Vite 将请求代理到 `http://localhost:3000/api/status`

### Requirement: 生产静态文件托管
Monitor Web 构建产物 SHALL 由后端 Hono 托管为静态文件。

#### Scenario: 生产访问
- **WHEN** 生产模式下浏览器访问根路径 `/`
- **THEN** Hono 返回前端构建的 `index.html`
