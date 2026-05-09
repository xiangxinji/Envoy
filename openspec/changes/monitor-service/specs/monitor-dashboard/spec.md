## ADDED Requirements

### Requirement: 仪表盘首页
Monitor Dashboard SHALL 在 `GET /` 路径返回一个完整的 HTML 页面，可视化展示所有状态信息。

#### Scenario: 访问仪表盘
- **WHEN** 用户在浏览器中访问 Monitor Service 的根路径
- **THEN** 返回 HTML 页面，包含服务概览区、客户端状态列表区、能力列表区

### Requirement: 服务概览展示
仪表盘 SHALL 在页面顶部展示全局概览信息，包括在线客户端数、忙碌客户端数、总能力数。

#### Scenario: 概览信息展示
- **WHEN** 仪表盘页面加载完成
- **THEN** 页面顶部显示统计卡片，包含：在线客户端数/总客户端数、忙碌客户端数、已注册能力数

### Requirement: 客户端状态列表展示
仪表盘 SHALL 展示所有客户端的状态列表，包含 ID、状态（online/busy/offline）、连接时长、队列长度、当前任务信息。

#### Scenario: 客户端列表渲染
- **WHEN** 仪表盘页面加载并成功获取 /api/clients 数据
- **THEN** 以表格或卡片形式展示每个客户端的信息，状态用不同颜色标识（online=绿色、busy=黄色、offline=灰色）

### Requirement: 能力列表展示
仪表盘 SHALL 展示所有已注册的能力列表，包含能力名称、描述、执行模式和优先级。

#### Scenario: 能力列表渲染
- **WHEN** 仪表盘页面加载并成功获取 /api/capabilities 数据
- **THEN** 以列表形式展示每个能力的名称、描述、模式（queue/preemptive）、优先级

### Requirement: 自动刷新
仪表盘 SHALL 每隔 3 秒自动通过 fetch 请求 API 端点更新页面数据，无需用户手动刷新。

#### Scenario: 自动数据更新
- **WHEN** 仪表盘页面保持打开状态
- **THEN** 每 3 秒自动请求 /api/status、/api/clients、/api/capabilities 并更新页面展示内容

### Requirement: 连接状态指示
仪表盘 SHALL 在页面中显示 Monitor 与 Envoy Server 的连接状态。

#### Scenario: 已连接状态
- **WHEN** Monitor 已成功连接到 Envoy Server 并收到 snapshot
- **THEN** 页面显示绿色的"已连接"指示器

#### Scenario: 未连接状态
- **WHEN** Monitor 尚未连接到 Envoy Server 或连接断开
- **THEN** 页面显示红色的"未连接"指示器
