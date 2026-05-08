## 1. Core 类型定义

- [x] 1.1 在 `src/core/task.ts` 中新增 `TaskHistoryEntry` 联合类型（created / dispatched / started / progress / completed / failed）
- [x] 1.2 在 `src/core/task.ts` 中新增 `TaskRecord` 接口（id, name, params, status, initiator, createdAt, history）

## 2. Server 端 TaskStore

- [x] 2.1 在 `src/server/server.ts` 中新增 `tasks` Map<string, TaskRecord> 属性
- [x] 2.2 修改 `executeTo` / `executeAny` 方法，dispatch 时创建 TaskRecord 并追加 created + dispatched history entry，通过 notifyWatchers 推送 task:created
- [x] 2.3 修改 `handleExecuteProgress`，追加 progress history entry（同 step 合并），通过 notifyWatchers 推送 task:updated
- [x] 2.4 修改 `handleExecuteResult`，追加 completed/failed history entry，更新 status，通过 notifyWatchers 推送 task:updated
- [x] 2.5 修改 `handleExecuteRequest`（client-to-client），dispatch 时同样创建 TaskRecord
- [x] 2.6 修改 Snapshot 生成（handleRegister），在 snapshot 中加入 `tasks: [...this.tasks.values()]`

## 3. WatcherClient 扩展

- [x] 3.1 在 `src/client/watcher-client.ts` 中扩展 `WatcherSnapshot` 接口，新增 `tasks: TaskRecord[]` 字段
- [x] 3.2 扩展 `WatcherClientEvents`，新增 `task:created` 和 `task:updated` 事件
- [x] 3.3 在 `setupWatcherHandlers` 中新增 `notify:task:created` 和 `notify:task:updated` 的监听与转发

## 4. Monitor 后端

- [x] 4.1 修改 `state-store.ts`，新增 tasks 管理（Map、applySnapshot 含 tasks、applyTaskCreated、applyTaskUpdated 方法）
- [x] 4.2 修改 `api.ts`，新增 `GET /api/tasks` 和 `GET /api/tasks/:id` 端点
- [x] 4.3 修改 `sse.ts`，init 事件包含 tasks 数据，新增 task:created 和 task:updated SSE 事件推送
- [x] 4.4 修改 `index.ts`，监听 watcher 的 task:created 和 task:updated 事件并转发到 StateStore

## 5. Monitor 前端

- [x] 5.1 安装 vue-router 依赖，创建路由配置（/clients 默认页、/tasks 页）
- [x] 5.2 修改 `useSSE.ts`，新增 tasks ref，监听 init/task:created/task:updated SSE 事件
- [x] 5.3 修改 `App.vue`，引入 router-view 和导航栏（Clients / Tasks 切换）
- [x] 5.4 新建 `ClientsPage.vue`，展示 client 列表，点击展开显示关联任务
- [x] 5.5 新建 `TasksPage.vue`，展示所有任务列表，按创建时间倒序，点击展开显示 history 时间线
- [x] 5.6 新建 `TaskHistoryTimeline.vue` 组件，根据 history entry type 渲染不同的时间线节点
- [x] 5.7 新建 `ClientTaskList.vue` 组件，按 client id 筛选关联任务并展示
