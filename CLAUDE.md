# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UniOpc 是一个基于 WebSocket 的 Server/Client 通信框架，支持任务调度、能力注册、心跳检测等功能。

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
src/
├── core/           # 核心模块
│   ├── message.ts      # 消息类型定义与序列化
│   ├── capability.ts   # 能力定义接口
│   ├── task.ts         # 任务定义与状态
│   ├── queue.ts        # 优先队列实现
│   ├── event-emitter.ts # 事件发射器
│   └── errors.ts       # 错误类型定义
├── server/         # 服务端模块
│   ├── server.ts       # Server 主类
│   ├── transport.ts    # WebSocket 传输层
│   ├── connection-manager.ts # 连接管理
│   ├── capability-registry.ts # 能力注册
│   ├── task-dispatcher.ts    # 任务调度
│   └── message-router.ts     # 消息路由
├── client/         # 客户端模块
│   ├── client.ts       # Client 主类
│   ├── transport.ts    # WebSocket 传输层
│   ├── heartbeat.ts    # 心跳检测
│   ├── capability.ts   # 能力执行
│   ├── task-queue.ts   # 任务队列
│   └── task-executor.ts # 任务执行器
└── index.ts        # 入口文件，导出 Server/Client

examples/           # 示例代码
├── basic.ts            # 基础连接与能力注册
├── heartbeat.ts        # 心跳检测与超时离线
├── timeout.ts          # 任务超时处理
├── retry.ts            # 任务重试机制
├── preemptive.ts       # 任务抢占
├── generator.ts        # Generator 执行模式
├── reconnect.ts        # 断线自动重连
├── load-balance.ts     # 多客户端负载均衡
├── priority-queue.ts   # 优先级队列调度
├── error-handling.ts   # 错误处理
├── notification.ts     # 通知机制
└── client-to-client.ts # 客户端间通信
```

## Key Exports

- `Server` / `ServerOptions` — 服务端主类及配置
- `Client` / `ClientOptions` — 客户端主类及配置

## Architecture

- **Core**: 定义消息协议、任务模型、能力接口等基础类型
- **Server**: 管理客户端连接、注册能力、调度任务
- **Client**: 连接服务端、执行能力、管理任务队列
- **Transport**: 基于 WebSocket 的双向通信层

## Key Configuration

- TypeScript outputs to `dist/` with source maps, declarations, and declaration maps
- 所有源码位于 `src/`
- 入口: `src/index.ts`
- 包导出: `./server` 和 `./client` 两个子路径
