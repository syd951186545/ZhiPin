import type {
    BrowserScreenshotPayload,
    ConnectionState,
    OpenClawAction,
    OpenClawRequest,
    OpenClawResponse,
    PlatformLoginStatusPayload,
    PlatformVerifyResultPayload,
    SystemStatusPayload,
    TaskCompletePayload,
    TaskErrorPayload,
    TaskProgressPayload,
} from '@/types/openclaw'
import {OPENCLAW_HEARTBEAT_INTERVAL, OPENCLAW_MAX_RECONNECT_ATTEMPTS, OPENCLAW_REQUEST_TIMEOUT,} from '@/lib/constants'

// ============================================================
// OpenClaw WebSocket Service
// ============================================================

type EventCallback = (payload: Record<string, unknown>) => void

interface PendingRequest {
  resolve: (value: OpenClawResponse) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

class OpenClawService {
  private ws: WebSocket | null = null
  private pendingRequests = new Map<string, PendingRequest>()
  private eventListeners = new Map<string, Set<EventCallback>>()
  private stateListeners = new Set<(state: ConnectionState) => void>()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private _connectionState: ConnectionState = 'disconnected'
  private _url = ''
  private _authToken = ''
  private _lastLatency = 0
  private _serverVersion = ''
  private pingTimestamp = 0

  // ---- Connection State ----

  get connectionState(): ConnectionState {
    return this._connectionState
  }

  get isConnected(): boolean {
    return this._connectionState === 'connected'
  }

  get lastLatency(): number {
    return this._lastLatency
  }

  get serverVersion(): string {
    return this._serverVersion
  }

  private setConnectionState(state: ConnectionState) {
    this._connectionState = state
    this.stateListeners.forEach((cb) => cb(state))
  }

  onStateChange(callback: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(callback)
    return () => this.stateListeners.delete(callback)
  }

  // ---- Connection Management ----

  connect(url: string, authToken?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        this.disconnect()
      }

      this._url = url
      this._authToken = authToken || ''
      this.setConnectionState('connecting')

      try {
        const ws = new WebSocket(url)

        const connectTimeout = setTimeout(() => {
          ws.close()
          this.setConnectionState('disconnected')
          reject(new Error('连接超时'))
        }, 10000)

        ws.onopen = () => {
          clearTimeout(connectTimeout)
          console.log('[OpenClaw] 连接已建立:', url)
          this.ws = ws
          this.reconnectAttempts = 0
          this.setConnectionState('connected')
          this.startHeartbeat()
          resolve()
        }

        ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        ws.onclose = (event) => {
          clearTimeout(connectTimeout)
          console.log('[OpenClaw] 连接已断开:', event.code, event.reason)
          this.ws = null
          this.stopHeartbeat()

          if (this._connectionState !== 'disconnected') {
            this.handleReconnect()
          }
        }

        ws.onerror = (error) => {
          console.error('[OpenClaw] 连接错误:', error)
          // onclose will be called after onerror
        }
      } catch (err) {
        this.setConnectionState('disconnected')
        reject(err)
      }
    })
  }

  disconnect() {
    this.stopHeartbeat()
    this.clearReconnectTimer()
    this.reconnectAttempts = 0

    if (this.ws) {
      this.ws.onclose = null // prevent reconnect
      this.ws.close()
      this.ws = null
    }

    // Reject all pending requests
    this.pendingRequests.forEach((req) => {
      clearTimeout(req.timer)
      req.reject(new Error('连接已断开'))
    })
    this.pendingRequests.clear()

    this.setConnectionState('disconnected')
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.pingTimestamp = Date.now()
        this.sendRaw({
          id: crypto.randomUUID(),
          action: 'ping',
          payload: {},
          timestamp: new Date().toISOString(),
        })
      }
    }, OPENCLAW_HEARTBEAT_INTERVAL)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts >= OPENCLAW_MAX_RECONNECT_ATTEMPTS) {
      console.log('[OpenClaw] 达到最大重连次数，停止重连')
      this.setConnectionState('disconnected')
      return
    }

    this.setConnectionState('reconnecting')
    this.reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000) // exponential backoff, max 30s

    console.log(`[OpenClaw] ${delay / 1000}秒后尝试第${this.reconnectAttempts}次重连...`)
    this.reconnectTimer = setTimeout(() => {
      this.connect(this._url, this._authToken).catch(() => {
        // will trigger handleReconnect again via onclose
      })
    }, delay)
  }

  // ---- Message Handling ----

  private handleMessage(raw: string) {
    let data: OpenClawResponse
    try {
      data = JSON.parse(raw)
    } catch {
      console.warn('[OpenClaw] 消息解析失败:', raw)
      return
    }

    // Handle heartbeat
    if (data.action === 'pong' || data.type === 'heartbeat') {
      if (this.pingTimestamp > 0) {
        this._lastLatency = Date.now() - this.pingTimestamp
        this.pingTimestamp = 0
      }
      if (data.payload?.version) {
        this._serverVersion = data.payload.version as string
      }
      return
    }

    // Handle pending request response
    if (data.type === 'response' && data.id) {
      const pending = this.pendingRequests.get(data.id)
      if (pending) {
        clearTimeout(pending.timer)
        this.pendingRequests.delete(data.id)
        if (data.status === 'failed') {
          pending.reject(new Error(data.error?.message || '请求失败'))
        } else {
          pending.resolve(data)
        }
        return
      }
    }

    // Handle events (broadcast to listeners)
    const listeners = this.eventListeners.get(data.action)
    if (listeners) {
      listeners.forEach((cb) => cb(data.payload))
    }

    // Also broadcast to wildcard listeners
    const wildcardListeners = this.eventListeners.get('*')
    if (wildcardListeners) {
      wildcardListeners.forEach((cb) => cb({ ...data.payload, _action: data.action, _raw: data }))
    }
  }

  // ---- Send Methods ----

  private sendRaw(message: OpenClawRequest) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  sendRequest(action: OpenClawAction, payload: Record<string, unknown> = {}, timeoutMs = OPENCLAW_REQUEST_TIMEOUT): Promise<OpenClawResponse> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket 未连接'))
        return
      }

      const id = crypto.randomUUID()
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`请求超时 (${timeoutMs}ms): ${action}`))
      }, timeoutMs)

      this.pendingRequests.set(id, { resolve, reject, timer })

      const request: OpenClawRequest = {
        id,
        action,
        payload,
        timestamp: new Date().toISOString(),
        auth_token: this._authToken || undefined,
      }

      this.sendRaw(request)
    })
  }

  /** 发送消息，不等待响应（fire-and-forget） */
  sendCommand(action: OpenClawAction, payload: Record<string, unknown> = {}) {
    const request: OpenClawRequest = {
      id: crypto.randomUUID(),
      action,
      payload,
      timestamp: new Date().toISOString(),
      auth_token: this._authToken || undefined,
    }
    this.sendRaw(request)
  }

  // ---- Event Subscription ----

  on(action: string, callback: EventCallback): () => void {
    if (!this.eventListeners.has(action)) {
      this.eventListeners.set(action, new Set())
    }
    this.eventListeners.get(action)!.add(callback)
    return () => this.off(action, callback)
  }

  off(action: string, callback: EventCallback) {
    this.eventListeners.get(action)?.delete(callback)
  }

  // ---- High-Level API ----

  async testConnection(): Promise<{ latency: number; version: string; status: string }> {
    const start = Date.now()
    const response = await this.sendRequest('system.status', {}, 5000)
    const latency = Date.now() - start
    const payload = response.payload as Partial<SystemStatusPayload>
    return {
      latency,
      version: payload.version || 'unknown',
      status: `CPU: ${payload.cpu_percent || 0}% | 内存: ${payload.memory_percent || 0}% | 活跃任务: ${payload.active_tasks || 0}`,
    }
  }

  async startManualLogin(platform: string, profileId: string): Promise<void> {
    await this.sendRequest('platform.login.manual', { platform, profile_id: profileId }, 60000) // 60s timeout for manual login start
  }

  async autoLogin(platform: string, cookies: string): Promise<{ success: boolean; cookies?: string }> {
    const response = await this.sendRequest('platform.login.auto', { platform, cookies }, 30000)
    const payload = response.payload as Partial<PlatformLoginStatusPayload>
    return { success: payload.success ?? false, cookies: payload.cookies }
  }

  async verifyPlatformSession(platform: string, cookies: string): Promise<{ valid: boolean }> {
    const response = await this.sendRequest('platform.verify', { platform, cookies }, 15000)
    const payload = response.payload as Partial<PlatformVerifyResultPayload>
    return { valid: payload.valid ?? false }
  }

  async startTask(payload: {
    skill_id: string
    task_name: string
    config: Record<string, unknown>
    prompt: string
    platform?: string
    job_id?: string
  }): Promise<{ taskId: string }> {
    const response = await this.sendRequest('task.start', payload, 30000)
    return { taskId: (response.payload.task_id as string) || response.id }
  }

  async pauseTask(taskId: string): Promise<void> {
    await this.sendRequest('task.pause', { task_id: taskId })
  }

  async resumeTask(taskId: string): Promise<void> {
    await this.sendRequest('task.resume', { task_id: taskId })
  }

  async cancelTask(taskId: string): Promise<void> {
    await this.sendRequest('task.cancel', { task_id: taskId })
  }

  async getSystemStatus(): Promise<SystemStatusPayload> {
    const response = await this.sendRequest('system.status', {})
    return response.payload as unknown as SystemStatusPayload
  }

  // ---- Event Type Helpers ----

  onTaskProgress(callback: (data: TaskProgressPayload) => void): () => void {
    return this.on('task.progress', (payload) => callback(payload as unknown as TaskProgressPayload))
  }

  onTaskComplete(callback: (data: TaskCompletePayload) => void): () => void {
    return this.on('task.complete', (payload) => callback(payload as unknown as TaskCompletePayload))
  }

  onTaskError(callback: (data: TaskErrorPayload) => void): () => void {
    return this.on('task.error', (payload) => callback(payload as unknown as TaskErrorPayload))
  }

  onLoginStatus(callback: (data: PlatformLoginStatusPayload) => void): () => void {
    return this.on('platform.login.status', (payload) => callback(payload as unknown as PlatformLoginStatusPayload))
  }

  onScreenshot(callback: (data: BrowserScreenshotPayload) => void): () => void {
    return this.on('browser.screenshot', (payload) => callback(payload as unknown as BrowserScreenshotPayload))
  }
}

// Singleton
export const openclawService = new OpenClawService()
