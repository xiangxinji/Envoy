<script setup lang="ts">
interface CapabilityDefinition {
  name: string
  description: string
  mode: 'queue' | 'preemptive'
  priority: number
  timeout?: number
}

defineProps<{ capabilities: CapabilityDefinition[] }>()
</script>

<template>
  <div v-if="capabilities.length === 0" class="text-center py-10 text-slate-500 text-sm">
    暂无能力
  </div>
  <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
    <div
      v-for="cap in capabilities"
      :key="cap.name"
      class="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors"
    >
      <div class="font-semibold text-slate-100 mb-1">{{ cap.name }}</div>
      <div class="text-sm text-slate-400 mb-3">{{ cap.description || '-' }}</div>
      <div class="flex gap-3 text-xs text-slate-500">
        <span class="px-1.5 py-0.5 rounded bg-slate-700/50">{{ cap.mode }}</span>
        <span>P{{ cap.priority }}</span>
        <span v-if="cap.timeout">{{ cap.timeout }}ms</span>
      </div>
    </div>
  </div>
</template>
