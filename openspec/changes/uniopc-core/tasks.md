# Envoy Core Tasks

## Phase 1: 项目骨架 & Core

- [ ] 1.1 初始化单包结构 (package.json + tsconfig.json + subpath exports)
- [ ] 1.2 core: 定义消息协议 (Message, MessageType)
- [ ] 1.3 core: 定义能力注册类型 (CapabilityDefinition, ParamDef)
- [ ] 1.4 core: 定义任务类型 (TaskDefinition, TaskResult, TaskStatus, TaskProgress)
- [ ] 1.5 core: 实现优先级队列 (PriorityQueue)
- [ ] 1.6 core: 实现类型安全事件系统 (EventEmitter)
- [ ] 1.7 core: 定义错误类型

## Phase 2: Transport Layer

- [ ] 2.1 WebSocket Server 封装 (基于 ws 库)
- [ ] 2.2 WebSocket Client 封装 (自动重连 + 指数退避)
- [ ] 2.3 消息序列化/反序列化 (JSON)

## Phase 3: Server Core

- [ ] 3.1 ConnectionManager — 连接管理 & 心跳检测 (解析心跳状态载荷)
- [ ] 3.2 CapabilityRegistry — 能力注册表 (双向映射)
- [ ] 3.3 MessageRouter — 消息路由 & Client-to-Client 中转
- [ ] 3.4 TaskDispatcher — 任务派发 (基于心跳状态的负载均衡)
- [ ] 3.5 Server 主类 — 组装各模块 & 对外 API & 事件发射

## Phase 4: Client Core

- [ ] 4.1 Heartbeat — 定时心跳发送 (携带队列长度、当前任务、进度)
- [ ] 4.2 Capability — 能力注册 (queue & preemptive 模式)
- [ ] 4.3 TaskQueue — 优先级队列 + 挂起/恢复状态机
- [ ] 4.4 TaskExecutor — Generator 协作式执行 + 自动进度上报
- [ ] 4.5 TaskProgress — 进度上报机制 (ctx.report + yield 自动上报)
- [ ] 4.6 Client 主类 — 组装各模块 & 对外 API

## Phase 5: Framework Constraints & Integration

- [ ] 5.1 框架约束: Client 只暴露 Server 连接，无 Client-to-Client API
- [ ] 5.2 框架约束: 所有行为自动上报 (任务生命周期、队列变化)
- [ ] 5.3 端到端集成测试 (Server + 多 Client)
- [ ] 5.4 边界情况处理 (断线重连、超时重试、任务恢复)
