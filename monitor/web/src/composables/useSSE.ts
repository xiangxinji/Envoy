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

interface TaskRecord {
  id: string
  name: string
  params: Record<string, unknown>
  status: 'pending' | 'running' | 'completed' | 'failed'
  initiator: string
  createdAt: number
  history: TaskHistoryEntry[]
}

export type TaskHistoryEntry =
  | { type: 'created'; at: number; by: string }
  | { type: 'dispatched'; at: number; to: string }
  | { type: 'started'; at: number; by: string }
  | { type: 'progress'; at: number; by: string; step: string | number; progress: number; message?: string }
  | { type: 'completed'; at: number; by: string; result: { success: boolean; data?: unknown; error?: string; duration: number } }
  | { type: 'failed'; at: number; by: string; error: string }

export type { TaskRecord, ClientState, CapabilityDefinition, MonitorStatus }

const clients = ref<ClientState[]>([])
const capabilities = ref<CapabilityDefinition[]>([])
const tasks = ref<TaskRecord[]>([])
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
    tasks.value = data.tasks ?? []
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

  es.addEventListener('task:created', (e) => {
    const task = JSON.parse(e.data) as TaskRecord
    tasks.value.unshift(task)
  })

  es.addEventListener('task:updated', (e) => {
    const task = JSON.parse(e.data) as TaskRecord
    const idx = tasks.value.findIndex((t) => t.id === task.id)
    if (idx >= 0) {
      tasks.value[idx] = task
    } else {
      tasks.value.unshift(task)
    }
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

  return { clients, capabilities, tasks, status, connected }
}
