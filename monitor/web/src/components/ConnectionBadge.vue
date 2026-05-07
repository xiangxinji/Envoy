<script setup lang="ts">
defineProps<{ connected: boolean }>()
</script>

<template>
  <div
    class="flex items-center gap-2 text-sm px-3 py-1 rounded-full"
    :class="connected ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'"
  >
    <span
      class="w-2 h-2 rounded-full"
      :class="connected ? 'bg-green-400' : 'bg-red-400'"
    />
    {{ connected ? '已连接' : '未连接' }}
  </div>
</template>
