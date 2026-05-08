<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TaskRecord, ClientState, CapabilityDefinition } from '../composables/useSSE'
import TaskHistoryTimeline from './TaskHistoryTimeline.vue'

const props = defineProps<{
  clients: ClientState[]
  capabilities: CapabilityDefinition[]
  tasks: TaskRecord[]
}>()

const expandedTasks = ref<Set<string>>(new Set())

const sortedTasks = computed(() =>
  [...props.tasks].sort((a, b) => b.createdAt - a.createdAt)
)

function toggleTask(id: string) {
  if (expandedTasks.value.has(id)) {
    expandedTasks.value.delete(id)
  } else {
    expandedTasks.value.add(id)
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

function getTargetClient(task: TaskRecord): string | undefined {
  const dispatched = task.history.find((e) => e.type === 'dispatched')
  return dispatched && 'to' in dispatched ? (dispatched as any).to : undefined
}

const statusStyles: Record<string, string> = {
  pending: 'bg-slate-500/15 text-slate-400',
  running: 'bg-yellow-500/15 text-yellow-400',
  completed: 'bg-green-500/15 text-green-400',
  failed: 'bg-red-500/15 text-red-400',
}

const statusLabels: Record<string, string> = {
  pending: '等待中',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
}
</script>

<template>
  <section>
    <h2 class="text-base font-medium text-slate-300 mb-3 pb-2 border-b border-slate-700">任务列表</h2>

    <div v-if="tasks.length === 0" class="text-center py-10 text-slate-500 text-sm">
      暂无任务
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="task in sortedTasks"
        :key="task.id"
        class="border border-slate-700 rounded-lg bg-slate-800/30 overflow-hidden"
      >
        <div
          class="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-slate-800/60 transition-colors"
          @click="toggleTask(task.id)"
        >
          <span class="text-slate-500 text-xs transition-transform" :class="{ 'rotate-90': expandedTasks.has(task.id) }">▶</span>
          <span class="font-mono text-slate-400 text-xs">{{ task.id }}</span>
          <span class="text-slate-200 font-medium">{{ task.name }}</span>
          <span
            class="px-2 py-0.5 rounded text-xs font-medium"
            :class="statusStyles[task.status]"
          >
            {{ statusLabels[task.status] }}
          </span>
          <span class="text-slate-500 text-sm">发起: {{ task.initiator }}</span>
          <span v-if="getTargetClient(task)" class="text-slate-500 text-sm">执行: {{ getTargetClient(task) }}</span>
          <span class="text-slate-500 text-sm ml-auto">{{ formatTime(task.createdAt) }}</span>
        </div>

        <div v-if="expandedTasks.has(task.id)" class="border-t border-slate-700/50 px-4 py-3">
          <div class="text-xs text-slate-500 mb-2 uppercase tracking-wide">History</div>
          <TaskHistoryTimeline :history="task.history" />
        </div>
      </div>
    </div>
  </section>
</template>
