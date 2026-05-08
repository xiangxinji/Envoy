## ADDED Requirements

### Requirement: 双页面路由导航
Monitor 前端 SHALL 使用 vue-router 提供 Clients 和 Tasks 两个页面路由。

#### Scenario: 默认页面
- **WHEN** 用户访问根路径 /
- **THEN** 重定向到 /clients 页面

#### Scenario: Clients 页面导航
- **WHEN** 用户点击导航栏 "Clients"
- **THEN** 路由切换到 /clients，展示客户端列表页面

#### Scenario: Tasks 页面导航
- **WHEN** 用户点击导航栏 "Tasks"
- **THEN** 路由切换到 /tasks，展示任务列表页面

### Requirement: Clients 页面展示
Clients 页面 SHALL 展示所有 client，每个 client 可展开查看其参与过的任务记录。

#### Scenario: Client 列表展示
- **WHEN** 用户进入 Clients 页面
- **THEN** 展示所有 client 的 ID、状态、连接时长、队列长度

#### Scenario: Client 任务展开
- **WHEN** 用户点击某个 client 展开其任务记录
- **THEN** 展示该 client 参与过的所有任务（history 中出现该 client id 的任务），显示任务名称、状态、进度

#### Scenario: 任务关联逻辑
- **WHEN** 展示 client 关联的任务
- **THEN** 任务 history 中 dispatched.to、started.by、progress.by、completed.by、failed.by 任一字段匹配该 client id 的任务都 SHALL 被展示

### Requirement: Tasks 页面展示
Tasks 页面 SHALL 展示所有任务，每个任务可展开查看其 history 时间线。

#### Scenario: 任务列表展示
- **WHEN** 用户进入 Tasks 页面
- **THEN** 展示所有任务的 ID、名称、状态、发起方、执行方，按创建时间倒序排列

#### Scenario: 任务 history 展开
- **WHEN** 用户点击某个任务展开其 history
- **THEN** 以时间线形式展示该任务的所有 history entry，包括 type、时间、参与者、附加信息（进度、结果等）

#### Scenario: History entry 渲染
- **WHEN** 渲染 history 时间线
- **THEN** 每个 entry 根据 type 显示不同的视觉标识：
  - created: "创建" + 发起方
  - dispatched: "分发" + 目标 client
  - started: "开始" + 执行 client
  - progress: "进度" + step + 百分比 + message
  - completed: "完成" + 执行 client + 结果摘要
  - failed: "失败" + 执行 client + 错误信息

### Requirement: SSE 数据源扩展
useSSE composable SHALL 新增 tasks 响应式数据源，监听 task:created 和 task:updated SSE 事件。

#### Scenario: SSE init 包含任务数据
- **WHEN** SSE 连接建立并收到 init 事件
- **THEN** tasks ref 被初始化为 init 数据中的 tasks 数组

#### Scenario: SSE task:created 事件
- **WHEN** 收到 SSE task:created 事件
- **THEN** 新任务被添加到 tasks ref 中

#### Scenario: SSE task:updated 事件
- **WHEN** 收到 SSE task:updated 事件
- **THEN** tasks ref 中对应 id 的任务被替换为更新后的数据
