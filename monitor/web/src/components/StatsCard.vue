<script setup lang="ts">
defineProps<{
  label: string
  value: number
  color?: 'default' | 'green' | 'yellow' | 'blue'
}>()

const colorMap: Record<string, string> = {
  default: 'text-slate-100',
  green: 'text-green-400',
  yellow: 'text-yellow-400',
  blue: 'text-blue-400',
}
</script>

<template>
  <div class="bg-slate-800 border border-slate-700 rounded-xl p-5">
    <div class="text-sm text-slate-400 mb-2">{{ label }}</div>
    <div class="text-3xl font-bold" :class="colorMap[color ?? 'default']">
      {{ value }}
    </div>
  </div>
</template>
