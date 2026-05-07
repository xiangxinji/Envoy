export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>UniOpc Monitor</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    min-height: 100vh;
  }
  header {
    background: #1e293b;
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #334155;
  }
  header h1 {
    font-size: 20px;
    font-weight: 600;
    color: #f1f5f9;
  }
  .connection-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    padding: 4px 12px;
    border-radius: 9999px;
  }
  .connection-badge.connected {
    background: rgba(34,197,94,0.15);
    color: #4ade80;
  }
  .connection-badge.disconnected {
    background: rgba(239,68,68,0.15);
    color: #f87171;
  }
  .connection-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .connected .connection-dot { background: #4ade80; }
  .disconnected .connection-dot { background: #f87171; }

  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px;
  }

  /* Stats Cards */
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }
  .stat-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 20px;
  }
  .stat-card .label {
    font-size: 13px;
    color: #94a3b8;
    margin-bottom: 8px;
  }
  .stat-card .value {
    font-size: 28px;
    font-weight: 700;
    color: #f1f5f9;
  }

  /* Section */
  .section {
    margin-bottom: 24px;
  }
  .section h2 {
    font-size: 16px;
    font-weight: 600;
    color: #cbd5e1;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #334155;
  }

  /* Client Table */
  .client-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }
  .client-table th {
    text-align: left;
    padding: 10px 12px;
    color: #94a3b8;
    font-weight: 500;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #334155;
  }
  .client-table td {
    padding: 10px 12px;
    border-bottom: 1px solid #1e293b;
  }
  .client-table tr:hover td {
    background: #1e293b;
  }

  /* Status Badge */
  .status {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 500;
  }
  .status-online { background: rgba(34,197,94,0.15); color: #4ade80; }
  .status-busy { background: rgba(234,179,8,0.15); color: #facc15; }
  .status-offline { background: rgba(148,163,184,0.15); color: #94a3b8; }

  /* Capability List */
  .cap-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
  }
  .cap-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 16px;
  }
  .cap-card .cap-name {
    font-size: 14px;
    font-weight: 600;
    color: #f1f5f9;
    margin-bottom: 4px;
  }
  .cap-card .cap-desc {
    font-size: 13px;
    color: #94a3b8;
    margin-bottom: 8px;
  }
  .cap-card .cap-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: #64748b;
  }

  .empty-state {
    text-align: center;
    padding: 40px;
    color: #64748b;
    font-size: 14px;
  }
</style>
</head>
<body>
<header>
  <h1>UniOpc Monitor</h1>
  <div id="connectionBadge" class="connection-badge disconnected">
    <span class="connection-dot"></span>
    <span id="connectionText">未连接</span>
  </div>
</header>

<main>
  <div class="stats">
    <div class="stat-card">
      <div class="label">客户端总数</div>
      <div class="value" id="totalClients">-</div>
    </div>
    <div class="stat-card">
      <div class="label">在线客户端</div>
      <div class="value" id="onlineClients">-</div>
    </div>
    <div class="stat-card">
      <div class="label">忙碌客户端</div>
      <div class="value" id="busyClients">-</div>
    </div>
    <div class="stat-card">
      <div class="label">已注册能力</div>
      <div class="value" id="totalCapabilities">-</div>
    </div>
  </div>

  <div class="section">
    <h2>客户端状态</h2>
    <table class="client-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>状态</th>
          <th>连接时长</th>
          <th>队列长度</th>
          <th>当前任务</th>
        </tr>
      </thead>
      <tbody id="clientBody">
        <tr><td colspan="5" class="empty-state">等待连接...</td></tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>能力列表</h2>
    <div class="cap-grid" id="capGrid">
      <div class="empty-state">等待连接...</div>
    </div>
  </div>
</main>

<script>
function formatUptime(ms) {
  if (!ms || ms <= 0) return '-';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return h + 'h ' + (m % 60) + 'm';
  if (m > 0) return m + 'm ' + (s % 60) + 's';
  return s + 's';
}

function setConnected(connected) {
  const badge = document.getElementById('connectionBadge');
  const text = document.getElementById('connectionText');
  badge.className = 'connection-badge ' + (connected ? 'connected' : 'disconnected');
  text.textContent = connected ? '已连接' : '未连接';
}

async function refresh() {
  try {
    const [status, clients, capabilities] = await Promise.all([
      fetch('/api/status').then(r => r.json()),
      fetch('/api/clients').then(r => r.json()),
      fetch('/api/capabilities').then(r => r.json()),
    ]);

    setConnected(status.connectedAt > 0);

    document.getElementById('totalClients').textContent = status.totalClients;
    document.getElementById('onlineClients').textContent = status.onlineClients;
    document.getElementById('busyClients').textContent = status.busyClients;
    document.getElementById('totalCapabilities').textContent = status.totalCapabilities;

    const tbody = document.getElementById('clientBody');
    if (clients.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无客户端</td></tr>';
    } else {
      tbody.innerHTML = clients.map(c => {
        const statusClass = 'status-' + c.status;
        const statusLabel = c.status === 'online' ? '在线' : c.status === 'busy' ? '忙碌' : '离线';
        const uptime = formatUptime(c.uptime);
        const task = c.currentTask
          ? c.currentTask.taskName + (c.currentTask.progress != null ? ' (' + Math.round(c.currentTask.progress) + '%)' : '')
          : '-';
        return '<tr>'
          + '<td>' + c.id + '</td>'
          + '<td><span class="status ' + statusClass + '">' + statusLabel + '</span></td>'
          + '<td>' + uptime + '</td>'
          + '<td>' + c.queueLength + '</td>'
          + '<td>' + task + '</td>'
          + '</tr>';
      }).join('');
    }

    const capGrid = document.getElementById('capGrid');
    if (capabilities.length === 0) {
      capGrid.innerHTML = '<div class="empty-state">暂无能力</div>';
    } else {
      capGrid.innerHTML = capabilities.map(cap =>
        '<div class="cap-card">'
        + '<div class="cap-name">' + cap.name + '</div>'
        + '<div class="cap-desc">' + (cap.description || '-') + '</div>'
        + '<div class="cap-meta">'
        + '<span>模式: ' + cap.mode + '</span>'
        + '<span>优先级: ' + cap.priority + '</span>'
        + (cap.timeout ? '<span>超时: ' + cap.timeout + 'ms</span>' : '')
        + '</div>'
        + '</div>'
      ).join('');
    }
  } catch {
    setConnected(false);
  }
}

refresh();
setInterval(refresh, 3000);
</script>
</body>
</html>`;
}
