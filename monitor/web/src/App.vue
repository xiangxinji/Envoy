<script setup lang="ts">
import { useSSE } from './composables/useSSE'
import ConnectionBadge from './components/ConnectionBadge.vue'
import StatsCard from './components/StatsCard.vue'
import ClientTable from './components/ClientTable.vue'
import CapabilityGrid from './components/CapabilityGrid.vue'

const { clients, capabilities, status, connected } = useSSE()
</script>

<template>
  <div class="min-h-screen bg-slate-900 text-slate-200">
    <header class="border-b border-slate-700 bg-slate-800 px-6 py-4 flex items-center justify-between">
      <h1 class="text-xl font-semibold text-slate-100">UniOpc Monitor</h1>
      <ConnectionBadge :connected="connected" />
    </header>

    <main class="max-w-6xl mx-auto px-6 py-6 space-y-8">
      <section class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label="客户端总数" :value="status.totalClients" />
        <StatsCard label="在线客户端" :value="status.onlineClients" color="green" />
        <StatsCard label="忙碌客户端" :value="status.busyClients" color="yellow" />
        <StatsCard label="已注册能力" :value="status.totalCapabilities" color="blue" />
      </section>

      <section>
        <h2 class="text-base font-medium text-slate-300 mb-3 pb-2 border-b border-slate-700">客户端状态</h2>
        <ClientTable :clients="clients" />
      </section>

      <section>
        <h2 class="text-base font-medium text-slate-300 mb-3 pb-2 border-b border-slate-700">能力列表</h2>
        <CapabilityGrid :capabilities="capabilities" />
      </section>
    </main>
  </div>
</template>
