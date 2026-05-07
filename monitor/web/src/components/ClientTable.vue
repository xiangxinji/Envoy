<script setup lang="ts">
import { computed } from 'vue'

interface ClientState {
  id: string
  status: 'online' | 'offline' | 'busy'
  connectedAt: number
  lastHeartbeat: number
  queueLength: number
  currentTask?: { taskId: string; taskName: string; progress?: number }
  uptime: number
  memoryUsage?: number
}

const props = defineProps<{ clients: ClientState[] }>()

const sortedClients = computed(() =>
  [...props.clients].sort((a, b) => {
    const order = { online: 0, busy: 1, offline: 2 }
    return (order[a.status] ?? 3) - (order[b.status] ?? 3)
  })
)

function formatUptime(ms: number): string {
  if (!ms || ms <= 0) return '-'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

const statusStyles: Record<string, string> = {
  online: 'bg-green-500/15 text-green-400',
  busy: 'bg-yellow-500/15 text-yellow-400',
  offline: 'bg-slate-500/15 text-slate-400',
}

const statusLabels: Record<string, string> = {
  online: '在线',
  busy: '忙碌',
  offline: '离线',
}
</script>

<template>
  <div v-if="clients.length === 0" class="text-center py-10 text-slate-500 text-sm">
    暂无客户端
  </div>
  <div v-else class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-xs text-slate-400 uppercase tracking-wide">
          <th class="pb-3 pr-4">ID</th>
          <th class="pb-3 pr-4">状态</th>
          <th class="pb-3 pr-4">连接时长</th>
          <th class="pb-3 pr-4">队列</th>
          <th class="pb-3">当前任务</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="client in sortedClients"
          :key="client.id"
          class="border-t border-slate-800 hover:bg-slate-800/50 transition-colors"
        >
          <td class="py-3 pr-4 font-mono text-slate-200">{{ client.id }}</td>
          <td class="py-3 pr-4">
            <span
              class="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium"
              :class="statusStyles[client.status]"
            >
              {{ statusLabels[client.status] }}
            </span>
          </td>
          <td class="py-3 pr-4 text-slate-400">{{ formatUptime(client.uptime) }}</td>
          <td class="py-3 pr-4 text-slate-400">{{ client.queueLength }}</td>
          <td class="py-3 text-slate-400">
            <template v-if="client.currentTask">
              {{ client.currentTask.taskName }}
              <span v-if="client.currentTask.progress != null" class="text-blue-400">
                ({{ Math.round(client.currentTask.progress) }}%)
              </span>
            </template>
            <template v-else>-</template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
