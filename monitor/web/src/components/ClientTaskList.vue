<script setup lang="ts">
import { computed } from 'vue'
import type { TaskRecord } from '../composables/useSSE'

const props = defineProps<{ clientId: string; tasks: TaskRecord[] }>()

function isRelated(task: TaskRecord, clientId: string): boolean {
  return task.history.some((e) => {
    if (e.type === 'dispatched') return e.to === clientId
    if ('by' in e) return e.by === clientId
    return false
  })
}

const relatedTasks = computed(() => props.tasks.filter((t) => isRelated(t, props.clientId)))
</script>

<template>
  <div v-if="relatedTasks.length === 0" class="text-slate-500 text-sm py-2 pl-4">暂无任务记录</div>
  <div v-else class="space-y-1 pl-4">
    <div
      v-for="task in relatedTasks"
      :key="task.id"
      class="flex items-center gap-3 py-1.5 px-3 rounded bg-slate-800/50 text-sm"
    >
      <span class="font-mono text-slate-400 text-xs">{{ task.id }}</span>
      <span class="text-slate-200">{{ task.name }}</span>
      <span
        class="px-1.5 py-0.5 rounded text-xs font-medium"
        :class="{
          'bg-yellow-500/15 text-yellow-400': task.status === 'running',
          'bg-green-500/15 text-green-400': task.status === 'completed',
          'bg-red-500/15 text-red-400': task.status === 'failed',
          'bg-slate-500/15 text-slate-400': task.status === 'pending',
        }"
      >
        {{ task.status === 'running' ? '运行中' : task.status === 'completed' ? '已完成' : task.status === 'failed' ? '失败' : '等待中' }}
      </span>
      <span v-if="task.status === 'running'" class="text-purple-400 text-xs">
        {{ Math.round(task.history.filter(e => e.type === 'progress').slice(-1)[0]?.progress ?? 0) }}%
      </span>
    </div>
  </div>
</template>
