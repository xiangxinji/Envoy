import { ref, onUnmounted } from 'vue'

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

interface CapabilityDefinition {
  name: string
  description: string
  params: Record<string, unknown>
  mode: 'queue' | 'preemptive'
  priority: number
  timeout?: number
}

interface MonitorStatus {
  totalClients: number
  onlineClients: number
  busyClients: number
  totalCapabilities: number
  connectedAt: number
}

const clients = ref<ClientState[]>([])
const capabilities = ref<CapabilityDefinition[]>([])
const status = ref<MonitorStatus>({
  totalClients: 0,
  onlineClients: 0,
  busyClients: 0,
  totalCapabilities: 0,
  connectedAt: 0,
})
const connected = ref(false)

let es: EventSource | null = null

function connect() {
  if (es) return

  es = new EventSource('/sse')

  es.addEventListener('init', (e) => {
    const data = JSON.parse(e.data)
    clients.value = data.clients ?? []
    capabilities.value = data.capabilities ?? []
    status.value = data.status ?? status.value
    connected.value = true
  })

  es.addEventListener('client:online', (e) => {
    const state = JSON.parse(e.data) as ClientState
    const idx = clients.value.findIndex((c) => c.id === state.id)
    if (idx >= 0) {
      clients.value[idx] = state
    } else {
      clients.value.push(state)
    }
  })

  es.addEventListener('client:offline', (e) => {
    const { id } = JSON.parse(e.data) as { id: string }
    const client = clients.value.find((c) => c.id === id)
    if (client) client.status = 'offline'
  })

  es.addEventListener('client:registered', (e) => {
    const data = JSON.parse(e.data) as {
      clientId: string
      capabilities: CapabilityDefinition[]
    }
    capabilities.value = capabilities.value.filter(
      (c) => !data.capabilities.some((nc) => nc.name === c.name)
    )
    capabilities.value.push(...data.capabilities)
  })

  es.onopen = () => {
    connected.value = true
  }

  es.onerror = () => {
    connected.value = false
    es?.close()
    es = null
    setTimeout(connect, 3000)
  }
}

function disconnect() {
  es?.close()
  es = null
  connected.value = false
}

export function useSSE() {
  connect()
  onUnmounted(disconnect)

  return { clients, capabilities, status, connected }
}
