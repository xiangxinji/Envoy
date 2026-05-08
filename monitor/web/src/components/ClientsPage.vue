<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ClientState, TaskRecord, CapabilityDefinition } from '../composables/useSSE'
import ClientTaskList from './ClientTaskList.vue'

const props = defineProps<{
  clients: ClientState[]
  capabilities: CapabilityDefinition[]
  tasks: TaskRecord[]
}>()

const expandedClients = ref<Set<string>>(new Set())

const sortedClients = computed(() =>
  [...props.clients].sort((a, b) => {
    const order = { online: 0, busy: 1, offline: 2 }
    return (order[a.status] ?? 3) - (order[b.status] ?? 3)
  })
)

function toggleClient(id: string) {
  if (expandedClients.value.has(id)) {
    expandedClients.value.delete(id)
  } else {
    expandedClients.value.add(id)
  }
}

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
  <section>
    <h2 class="text-base font-medium text-slate-300 mb-3 pb-2 border-b border-slate-700">客户端状态</h2>

    <div v-if="clients.length === 0" class="text-center py-10 text-slate-500 text-sm">
      暂无客户端
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="client in sortedClients"
        :key="client.id"
        class="border border-slate-700 rounded-lg bg-slate-800/30 overflow-hidden"
      >
        <div
          class="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-slate-800/60 transition-colors"
          @click="toggleClient(client.id)"
        >
          <span class="text-slate-500 text-xs transition-transform" :class="{ 'rotate-90': expandedClients.has(client.id) }">▶</span>
          <span class="font-mono text-slate-200">{{ client.id }}</span>
          <span
            class="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium"
            :class="statusStyles[client.status]"
          >
            {{ statusLabels[client.status] }}
          </span>
          <span class="text-slate-400 text-sm">连接: {{ formatUptime(client.uptime) }}</span>
          <span class="text-slate-400 text-sm">队列: {{ client.queueLength }}</span>
          <span v-if="client.currentTask" class="text-slate-400 text-sm">
            当前任务: {{ client.currentTask.taskName }}
          </span>
        </div>

        <div v-if="expandedClients.has(client.id)" class="border-t border-slate-700/50 px-4 py-3">
          <div class="text-xs text-slate-500 mb-2 uppercase tracking-wide">任务记录</div>
          <ClientTaskList :client-id="client.id" :tasks="tasks" />
        </div>
      </div>
    </div>
  </section>
</template>
