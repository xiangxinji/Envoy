## 1. 项目结构

- [x] 1.1 创建 `co-work/` 目录
- [x] 1.2 在 `src/index.ts` 中添加 co-work 模块导出

## 2. 核心类型定义

- [x] 2.1 创建 `co-work/types.ts`，定义 ResourceChange、ResourceQuery、ResourceAck 等资源操作相关类型
- [x] 2.2 定义 TeamOptions、LeaderOptions、MemberOptions 配置接口

## 3. Team 类实现

- [x] 3.1 创建 `co-work/team.ts`，实现 Team 类封装 Server，支持 resourceRoot 配置
- [x] 3.2 实现资源路径校验（防止目录遍历：拒绝 `..`、绝对路径、null 字节）
- [x] 3.3 实现文件系统资源 CRUD：create/update、delete、list、get
- [x] 3.4 实现启动时扫描 resourceRoot 目录索引已有资源
- [x] 3.5 实现角色追踪：记录每个 client 的 role（leader/member）
- [x] 3.6 实现 notify 消息路由：处理 resource:register、resource:delete、resource:query
- [x] 3.7 实现角色权限校验：resource:register 和 resource:delete 仅允许 leader
- [x] 3.8 实现资源变更广播：Leader 操作后向所有 Member 推送 resource:changed

## 4. Leader 类实现

- [x] 4.1 创建 `co-work/leader.ts`，实现 Leader 类封装 Client
- [x] 4.2 实现 Leader 连接时发送 role: "leader" 标记
- [x] 4.3 实现 registerResource(path, content) 方法
- [x] 4.4 实现 deleteResource(path) 方法
- [x] 4.5 实现 resource:ack 响应监听，返回操作结果

## 5. Member 类实现

- [x] 5.1 创建 `co-work/member.ts`，实现 Member 类封装 Client
- [x] 5.2 实现 Member 连接时发送 role: "member" 标记
- [x] 5.3 实现 listResources() 方法——查询资源路径列表
- [x] 5.4 实现 getResource(path) 方法——查询资源内容
- [x] 5.5 实现 resource:changed 通知监听，触发本地 resource-changed 事件

## 6. 导出与构建

- [x] 6.1 在 `co-work/index.ts` 中导出 Team、Leader、Member 及所有类型，再由 `src/index.ts` 统一导出
- [x] 6.2 验证 TypeScript 编译通过
- [x] 6.3 创建基础示例文件 `examples/co-work-basic.ts` 演示完整流程
