# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Envoy 是一个基于 WebSocket 的 Server/Client 通信框架。Server 作为纯中转调度中心，Client 通过 submit 发起任务、通过 doing 注册处理器、通过 subscribe 接收任务状态通知。

## Tech Stack

- **Runtime**: Node.js >= 18
- **Language**: TypeScript (strict mode)
- **Module System**: ESM (`"type": "module"` in package.json)
- **Target**: ES2022
- **Module Resolution**: Node16
- **WebSocket**: ws ^8.18.0

## Commands

```bash
npm run build        # Compile TypeScript to dist/
npm run dev          # Watch mode compilation
npm start            # Run compiled output
```

## Project Structure

```
packages/
├── core/                    # 核心模块
│   ├── task.ts              # Task / Resource / SubmitOptions 类型定义
│   ├── message.ts           # 消息协议（9 种 MessageType）
│   ├── queue.ts             # 通用 FIFO 队列
│   ├── event-emitter.ts     # 类型安全的事件发射器
│   ├── errors.ts            # 错误类型层级
│   └── index.ts
├── server/                  # 服务端模块（纯中转）
│   ├── server.ts            # Server 主类 — 接收 submit、按 subscribe 分发、收集 result、通知状态变更
│   ├── connection-manager.ts # 连接管理 + 心跳超时
│   ├── transport.ts         # WebSocket 服务端传输层
│   └── index.ts
├── client/                  # 客户端模块
│   ├── client.ts            # Client 主类 — doing / submit / ClientTask 串行队列
│   ├── heartbeat.ts         # 心跳管理
│   ├── transport.ts         # WebSocket 客户端传输层（含自动重连）
│   ├── watcher-client.ts    # 监控观察者客户端
│   └── index.ts
├── teams/                   # Team 协作模块（Leader/Member 资源共享）
│   ├── team.ts              # Team 服务端
│   ├── leader.ts            # Leader 客户端
│   ├── member.ts            # Member 客户端
│   ├── types.ts
│   └── index.ts
└── index.ts                 # 入口文件
```

## Architecture

- **Server**：纯中转，不做业务逻辑。接收 submit → 按 subscribe + mode(serial/parallel) 分发 → 收集 result 追加到 resources → 通知 createBy + subscribe 状态变更
- **Client**：doing 注册处理器，submit 发起任务，内部维护 ClientTask 串行队列
- **Task**：核心数据模型，包含 createBy / subscribe / content / mode / resources
- **Resource**：可扩展资源池，type 区分类型（client-result、connection 等）

## Key Configuration

- TypeScript outputs to `dist/` with source maps, declarations, and declaration maps
- 源码位于 `packages/`
- 入口: `packages/index.ts`
- 包导出: `./server`、`./client`、`./co-work` 子路径
