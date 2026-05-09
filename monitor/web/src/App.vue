<script setup lang="ts">
import { useSSE } from './composables/useSSE'
import ConnectionBadge from './components/ConnectionBadge.vue'
import StatsCard from './components/StatsCard.vue'

const { clients, capabilities, tasks, status, connected } = useSSE()
</script>

<template>
  <div class="min-h-screen bg-slate-900 text-slate-200">
    <header class="border-b border-slate-700 bg-slate-800 px-6 py-4 flex items-center justify-between">
      <h1 class="text-xl font-semibold text-slate-100">Envoy Monitor</h1>
      <ConnectionBadge :connected="connected" />
    </header>

    <nav class="border-b border-slate-700 bg-slate-800/50 px-6 flex gap-1">
      <router-link
        to="/clients"
        class="px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors"
        active-class="bg-slate-900 text-slate-100"
        inactive-class="text-slate-400 hover:text-slate-200 hover:bg-slate-800"
      >
        Clients
      </router-link>
      <router-link
        to="/tasks"
        class="px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors"
        active-class="bg-slate-900 text-slate-100"
        inactive-class="text-slate-400 hover:text-slate-200 hover:bg-slate-800"
      >
        Tasks
      </router-link>
    </nav>

    <main class="max-w-6xl mx-auto px-6 py-6">
      <section class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatsCard label="客户端总数" :value="status.totalClients" />
        <StatsCard label="在线客户端" :value="status.onlineClients" color="green" />
        <StatsCard label="忙碌客户端" :value="status.busyClients" color="yellow" />
        <StatsCard label="已注册能力" :value="status.totalCapabilities" color="blue" />
      </section>

      <router-view
        :clients="clients"
        :capabilities="capabilities"
        :tasks="tasks"
      />
    </main>
  </div>
</template>
