## Why

当前监控仪表盘只展示 client 列表和能力列表，缺少任务维度的可视化。用户无法看到任务"谁发起、经过了谁、现在在谁手里"的完整流转链路，也无法按 client 维度查看其任务执行历史。

## What Changes

- 新增 TaskRecord 数据模型，每个任务携带 history 时间线（created → dispatched → started → progress → completed/failed），progress 同一 step 合并更新
- Server 端新增 TaskStore，在任务 dispatch/result/progress 各节点追加 history 记录，并在 Snapshot 中携带 tasks 数据
- WatcherClient 扩展事件监听，支持接收 task 相关通知
- Monitor 后端 StateStore 新增 tasks 管理，新增 /api/tasks、/api/tasks/:id 接口，SSE 新增 task 事件推送
- Monitor 前端引入 vue-router，拆分为 Clients 和 Tasks 两个页面：
  - Clients 页：展示所有 client，展开后显示该 client 参与过的所有任务记录
  - Tasks 页：展示所有任务，展开后显示 history 时间线

## Capabilities

### New Capabilities
- `task-record`: 任务记录数据模型与 Server 端 TaskStore，定义 TaskRecord、TaskHistoryEntry 类型，管理任务生命周期 history 的追加与 progress 合并
- `task-watcher`: WatcherClient 任务事件扩展，接收 Snapshot 中的 tasks 数据及增量 task 事件
- `monitor-task-api`: Monitor 后端任务数据管理，包括 StateStore tasks 存储、REST API、SSE 事件推送
- `monitor-task-ui`: Monitor 前端 Clients/Tasks 双页面布局，client 关联任务展示，task history 时间线展示

### Modified Capabilities

## Impact

- **Core**: `src/core/task.ts` 新增 TaskRecord、TaskHistoryEntry 类型导出
- **Server**: `src/server/server.ts` 新增 TaskStore，修改 dispatch/result/progress 处理逻辑，修改 Snapshot 生成
- **Client**: `src/client/watcher-client.ts` 扩展 WatcherSnapshot 和 WatcherClientEvents
- **Monitor 后端**: `monitor/server/src/` 全部四个文件均需修改（state-store、api、sse、index）
- **Monitor 前端**: `monitor/web/src/` 新增 vue-router，重构 App.vue，新增多个组件
- **无 Breaking Change**: 所有改动为新增能力，不影响现有 API 和消息协议
