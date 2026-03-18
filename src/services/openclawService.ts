import type {
  ServiceState,
  TaskCompletePayload,
  TaskErrorPayload,
  TaskProgressPayload,
  TaskScreenshotPayload,
} from '@/types/openclaw'
import {OPENCLAW_SSE_TIMEOUT} from '@/lib/constants'

// ============================================================
// OpenClaw HTTP + SSE Service (OpenResponses API)
// ============================================================

type EventCallback = (payload: Record<string, unknown>) => void

class OpenClawService {
  private _baseUrl = ''
  private _authToken = ''
  private _agentId = ''
  private _serviceState: ServiceState = 'idle'
  private activeRequests = new Map<string, AbortController>()
  private eventListeners = new Map<string, Set<EventCallback>>()
  private stateListeners = new Set<(state: ServiceState) => void>()

  // ---- State ----

  get serviceState(): ServiceState {
    return this._serviceState
  }

  get isReady(): boolean {
    return this._serviceState === 'ready'
  }

  get baseUrl(): string {
    return this._baseUrl
  }

  get agentId(): string {
    return this._agentId
  }

  private setServiceState(state: ServiceState) {
    this._serviceState = state
    this.stateListeners.forEach((cb) => cb(state))
  }

  onStateChange(callback: (state: ServiceState) => void): () => void {
    this.stateListeners.add(callback)
    return () => this.stateListeners.delete(callback)
  }

  // ---- Configuration ----

  configure(baseUrl: string, agentId?: string, authToken?: string) {
    // 将 ws:// 转换为 http://
    this._baseUrl = baseUrl.replace(/^ws(s?):\/\//, 'http$1://')
    this._authToken = authToken || ''
    if (agentId) this._agentId = agentId

    if (this._baseUrl) {
      this.setServiceState('ready')
    } else {
      this.setServiceState('idle')
    }
  }

  markError() {
    this.setServiceState('error')
  }

  // ---- API Helpers ----

  private getApiUrl(path: string): string {
    // 统一走后端代理，由后端注入 Auth Token
    return `/api/openclaw${path}`
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this._agentId) {
      headers['x-openclaw-agent-id'] = this._agentId
    }
    if (this._authToken) {
      headers.Authorization = `Bearer ${this._authToken}`
    }
    return headers
  }

  async fetchInfo(): Promise<{ agentId: string; baseUrl: string }> {
    const response = await fetch('/api/openclaw/info')
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`获取 OpenClaw 配置失败 (${response.status}): ${errorText}`)
    }
    const data = await response.json()
    return {
      agentId: data.agent_id || '',
      baseUrl: data.base_url || '',
    }
  }

  // ---- Start Task (SSE Streaming) ----

  async startTask(params: {
    prompt: string
    sessionId: string
    taskId: string
  }): Promise<void> {
    const controller = new AbortController()
    this.activeRequests.set(params.taskId, controller)

    // 设置超时
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, OPENCLAW_SSE_TIMEOUT)

    try {
      const response = await fetch(this.getApiUrl('/v1/responses'), {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: 'openclaw',
          input: params.prompt,
          stream: true,
          user: params.sessionId,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        if (response.status === 401 || response.status === 403) {
          throw new Error('认证失败，请检查后端 OpenClaw Token')
        }
        throw new Error(`请求失败 (${response.status}): ${errorText}`)
      }

      if (!response.body) {
        throw new Error('响应体为空，无法读取 SSE 流')
      }

      // 解析 SSE 流
      await this.parseSSEStream(response.body, params.taskId)

    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // 用户主动取消或超时
        this.emit('task.error', {
          task_id: params.taskId,
          error_code: 'CANCELLED',
          error_message: '任务已取消',
        } as unknown as Record<string, unknown>)
      } else {
        this.emit('task.error', {
          task_id: params.taskId,
          error_code: 'REQUEST_FAILED',
          error_message: (err as Error).message || '请求失败',
        } as unknown as Record<string, unknown>)
      }
    } finally {
      clearTimeout(timeoutId)
      this.activeRequests.delete(params.taskId)
    }
  }

  // ---- Cancel Task ----

  cancelTask(taskId: string) {
    const controller = this.activeRequests.get(taskId)
    if (controller) {
      controller.abort()
      this.activeRequests.delete(taskId)
    }
  }

  // ---- SSE Parser ----

  private async parseSSEStream(body: ReadableStream<Uint8Array>, taskId: string) {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullResponse = ''

    try {
      while (true) {
        const {done, value} = await reader.read()
        if (done) break

        buffer += decoder.decode(value, {stream: true})

        // SSE 事件以 \n\n 分隔
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || '' // 最后一部分可能不完整

        for (const part of parts) {
          const event = this.parseSSEEvent(part)
          if (!event) continue

          this.handleSSEEvent(event, taskId, fullResponse)

          // 累积文本响应
          if (event.event === 'response.output_text.delta') {
            const delta = (event.data as Record<string, unknown>).delta as string
            if (delta) fullResponse += delta
          }
        }
      }

      // 流正常结束，发送完成事件
      this.emit('task.complete', {
        task_id: taskId,
        result_summary: {},
        full_response: fullResponse,
      } as unknown as Record<string, unknown>)

    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        this.emit('task.error', {
          task_id: taskId,
          error_code: 'STREAM_ERROR',
          error_message: (err as Error).message || 'SSE 流读取失败',
        } as unknown as Record<string, unknown>)
      }
    } finally {
      reader.releaseLock()
    }
  }

  private parseSSEEvent(raw: string): { event: string; data: Record<string, unknown> } | null {
    let eventType = 'message'
    let dataStr = ''

    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataStr += line.slice(5).trim()
      }
    }

    if (!dataStr) return null

    try {
      return {event: eventType, data: JSON.parse(dataStr)}
    } catch {
      return {event: eventType, data: {raw: dataStr}}
    }
  }

  private handleSSEEvent(
    event: { event: string; data: Record<string, unknown> },
    taskId: string,
    accumulatedText: string,
  ) {
    switch (event.event) {
      case 'response.output_text.delta': {
        const delta = event.data.delta as string || ''
        this.emit('task.progress', {
          task_id: taskId,
          progress: -1, // -1 表示无法确定进度百分比，UI 应显示为不确定状态
          message: delta,
          details: {accumulated: accumulatedText + delta},
        } as unknown as Record<string, unknown>)
        break
      }

      case 'response.completed': {
        // 由 parseSSEStream 的 finally 统一处理
        break
      }

      case 'response.failed': {
        const error = event.data.error as Record<string, unknown> | undefined
        this.emit('task.error', {
          task_id: taskId,
          error_code: (error?.type as string) || 'RESPONSE_FAILED',
          error_message: (error?.message as string) || 'Agent 执行失败',
        } as unknown as Record<string, unknown>)
        break
      }

      default: {
        // 检测截图数据并发出截图事件
        this.checkAndEmitScreenshot(event.data, taskId)
        // 其他事件通过通配符监听器广播
        this.emit(event.event, {...event.data, _taskId: taskId})
        break
      }
    }
  }

  /** 检测 SSE 事件数据中的截图并发出 task.screenshot 事件 */
  private checkAndEmitScreenshot(data: Record<string, unknown>, taskId: string) {
    // 处理 computer_call_output 类型（OpenAI computer use format）
    if (data.type === 'computer_call_output') {
      const output = data.output as Record<string, unknown> | undefined
      if (output?.type === 'computer_screenshot' && output?.image_url) {
        this.emit('task.screenshot', {
          task_id: taskId,
          screenshot: output.image_url as string,
          action: (data.action as string) || '操作截图',
          timestamp: new Date().toISOString(),
        } as unknown as Record<string, unknown>)
        return
      }
    }
    // 处理直接含有 screenshot 字段的事件
    const screenshotUrl = (data.screenshot || data.image_url) as string | undefined
    if (screenshotUrl) {
      this.emit('task.screenshot', {
        task_id: taskId,
        screenshot: screenshotUrl,
        action: (data.action as string) || '截图',
        timestamp: new Date().toISOString(),
      } as unknown as Record<string, unknown>)
    }
  }

  // ---- Event Emitter ----

  private emit(action: string, payload: Record<string, unknown>) {
    const listeners = this.eventListeners.get(action)
    if (listeners) {
      listeners.forEach((cb) => cb(payload))
    }

    // 广播到通配符监听器
    const wildcardListeners = this.eventListeners.get('*')
    if (wildcardListeners) {
      wildcardListeners.forEach((cb) => cb({...payload, _action: action}))
    }
  }

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

  onTaskScreenshot(callback: (data: TaskScreenshotPayload) => void): () => void {
    return this.on('task.screenshot', (payload) => callback(payload as unknown as TaskScreenshotPayload))
  }
}

// Singleton
export const openclawService = new OpenClawService()
