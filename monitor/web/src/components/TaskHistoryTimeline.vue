<script setup lang="ts">
import type { TaskHistoryEntry } from '../composables/useSSE'

defineProps<{ history: TaskHistoryEntry[] }>()

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

const typeConfig: Record<string, { label: string; color: string; icon: string }> = {
  created: { label: '创建', color: 'text-blue-400', icon: '●' },
  dispatched: { label: '分发', color: 'text-cyan-400', icon: '→' },
  started: { label: '开始', color: 'text-yellow-400', icon: '▶' },
  progress: { label: '进度', color: 'text-purple-400', icon: '◎' },
  completed: { label: '完成', color: 'text-green-400', icon: '✓' },
  failed: { label: '失败', color: 'text-red-400', icon: '✗' },
}

function getConfig(type: string) {
  return typeConfig[type] ?? { label: type, color: 'text-slate-400', icon: '·' }
}
</script>

<template>
  <div v-if="history.length === 0" class="text-slate-500 text-sm py-2">暂无历史记录</div>
  <div v-else class="space-y-1 py-1">
    <div
      v-for="(entry, i) in history"
      :key="i"
      class="flex items-start gap-3 text-sm"
    >
      <span class="font-mono text-xs text-slate-500 w-16 shrink-0 pt-0.5">{{ formatTime(entry.at) }}</span>
      <span class="shrink-0 pt-0.5" :class="getConfig(entry.type).color">{{ getConfig(entry.type).icon }}</span>
      <div class="flex flex-wrap items-center gap-x-2">
        <span :class="getConfig(entry.type).color" class="font-medium">{{ getConfig(entry.type).label }}</span>

        <template v-if="entry.type === 'dispatched'">
          <span class="text-slate-500">→</span>
          <span class="font-mono text-slate-300">{{ entry.to }}</span>
        </template>

        <template v-else-if="entry.type === 'started' || entry.type === 'created'">
          <span class="text-slate-400">by</span>
          <span class="font-mono text-slate-300">{{ entry.by }}</span>
        </template>

        <template v-else-if="entry.type === 'progress'">
          <span class="text-slate-400">by</span>
          <span class="font-mono text-slate-300">{{ entry.by }}</span>
          <span class="text-slate-500">step:{{ entry.step }}</span>
          <span class="text-purple-400">{{ Math.round(entry.progress) }}%</span>
          <span v-if="entry.message" class="text-slate-500">{{ entry.message }}</span>
        </template>

        <template v-else-if="entry.type === 'completed'">
          <span class="text-slate-400">by</span>
          <span class="font-mono text-slate-300">{{ entry.by }}</span>
          <span v-if="entry.result.duration" class="text-slate-500">({{ (entry.result.duration / 1000).toFixed(1) }}s)</span>
        </template>

        <template v-else-if="entry.type === 'failed'">
          <span class="text-slate-400">by</span>
          <span class="font-mono text-slate-300">{{ entry.by }}</span>
          <span class="text-red-400">{{ entry.error }}</span>
        </template>
      </div>
    </div>
  </div>
</template>
