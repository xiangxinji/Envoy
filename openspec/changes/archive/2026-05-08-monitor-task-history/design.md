## Context

Envoy 是一个基于 WebSocket 的 Server/Client 通信框架，已有 WatcherClient 机制可以向监控端推送客户端状态和能力变更。当前 Snapshot 只包含 clients 和 capabilities，没有任务数据。Server 端的任务仅通过 `pendingTasks` Map 跟踪 Promise resolver，任务完成后即删除，没有持久化记录。

## Goals / Non-Goals

**Goals:**
- 在 Server 端持久化任务记录，每个任务携带完整的 history 时间线
- 通过现有 WatcherClient 机制将任务数据透传到 Monitor 后端
- Monitor 前端拆分为 Clients / Tasks 双页面，支持按 client 查看关联任务、按 task 查看 history 时间线
- Progress 同一 step 合并更新，避免 history 膨胀

**Non-Goals:**
- 不做任务数据的持久化存储（重启丢失）
- 不做任务历史分页或清理策略（后续迭代）
- 不修改现有消息协议（仅在 Snapshot 中扩展字段、新增 watcher notify subtype）
- 不做任务的手动创建/中止（仅监控展示）

## Decisions

### D1: TaskStore 放在 Server 主类内部

TaskStore 以 Map<string, TaskRecord> 形式内嵌在 Server 类中，不抽取独立模块。

**Why**: 任务创建和状态变更都发生在 Server 的 handleMessage 流程中，内嵌可以避免额外的模块间协调。如果后续需要独立，再抽取不迟。

### D2: Snapshot 方案传递任务数据

使用方案 B——在 WatcherSnapshot 中扩展 tasks 字段，增量事件通过已有的 notifyWatchers 机制推送。

**Why**: 
- 改动最小，复用现有 watcher 通知机制
- Server 端已经在 dispatch/result/progress 节点调用 notifyWatchers
- 只需在这些节点补充任务记录的推送

### D3: History Entry 采用联合类型

TaskHistoryEntry 使用 discriminated union（type 字段区分），覆盖 created / dispatched / started / progress / completed / failed 六种类型。

**Why**: 联合类型可以让前端根据 type 安全地渲染不同的 history 条目，TypeScript 类型推断也更精确。

### D4: Progress 合并策略

同一 task 内 step 值相同的 progress history entry，只保留最新一条。实现方式：每次 push progress 时，查找 history 中是否已有同 step 的 progress entry，有则替换。

**Why**: 一个 step 可能推送几十次 progress（如 0%→1%→2%→...），全量记录会导致 history 迅速膨胀，且中间值对监控无实际意义。

### D5: 前端使用 vue-router 做页面导航

引入 vue-router，Clients 和 Tasks 作为两个独立路由页面。

**Why**: 两个页面数据模型和交互差异大，路由比条件渲染更清晰。当前前端是 Vue 3 + Vite，vue-router 是标配。

### D6: Client 关联任务——所有参与过的 client 都显示

一个 task 的 history 中出现的所有 client id（dispatched.to、started.by、progress.by、completed.by、failed.by）都作为关联方，在 Clients 页面的对应 client 下展示该任务。

**Why**: 用户的明确需求。重试场景下任务可能经过多个 client，每个参与方都应看到。

## Risks / Trade-offs

- **[内存增长]** TaskStore 无上限，长时间运行后内存会持续增长 → 后续迭代添加清理策略（如保留最近 N 条），当前阶段不限制
- **[Snapshot 体积增大]** tasks 全量放入 Snapshot，watcher 连接时传输量增加 → 任务数据通常不会特别大，且只在初始化时传输一次，可接受
- **[Progress 合并丢失中间数据]** 同 step 的 progress 中间值被覆盖 → 符合设计意图，监控只需最新状态
