/**
 * 工作流 API 客户端
 *
 * 负责与 FastAPI 后端通信：启动工作流、取消工作流、SSE 进度订阅。
 */

import {supabase} from '@/lib/supabase'

// ── 类型定义 ─────────────────────────────────────────────

export type WorkflowId = 'publish_job' | 'talent_explore' | 'resume_screen'

export interface WorkflowStartRequest {
  workflow_id: WorkflowId
  tenant_id: string
  user_id?: string

  // 平台与账号
  platform?: string
  platforms?: string[]
  account_id?: string
  platform_account_ids?: Record<string, string>
  account_name?: string

  // 岗位信息
  job_id?: string
  job_title?: string
  job_location?: string
  job_salary_min?: number
  job_salary_max?: number
  job_employment_type?: string
  job_department?: string
  job_description?: string
  job_requirements?: string
  job_benefits?: string

  // 企业信息
  company_name?: string
  company_address?: string
  company_size?: string
  company_overview?: string

  // Supabase 用户认证令牌（后端以用户身份访问 Supabase，遵循 RLS）
  supabase_auth_token?: string

  // 工作流参数
  min_match_score?: number
  max_results?: number
  message_send_limit?: number  // 每次运行最多发送消息数（1-50，默认 10）
  custom_message?: string      // 自定义消息话术（空 = 使用默认）
}

export interface WorkflowStartResponse {
  execution_id: string
  workflow_id: WorkflowId
  status: string
  queued: boolean
  queue_position: number
  blocking_execution_count: number
  message: string
}

export interface StepMeta {
  id: string
  name_zh: string
  requires_openclaw: boolean
  platform?: string
}

export interface WorkflowMetaEvent {
  workflow_id: WorkflowId
  workflow_name: string
  steps: StepMeta[]
  platform?: string
  platforms?: string[]
  multi_platform?: boolean
}

export interface RunStartedEvent {
  execution_id: string
  workflow_id: WorkflowId
  workflow_name: string
}

export interface StepChangeEvent {
  step_id: string
  step_name: string
  status: 'running' | 'done' | 'failed'
  step_index?: number
  total_steps?: number
  platform?: string
  error?: string
}

export interface ProgressEvent {
  step_id: string
  delta: string
  accumulated_text: string
  screenshots?: string[]
}

export interface ScreenshotEvent {
  step_id: string
  screenshot: string
  action: string
  timestamp: string
  artifact_id?: string
}

export interface CompleteEvent {
  result_summary?: Record<string, unknown>
  announcement?: string
  publish_result?: Record<string, unknown>
  screenshots?: string[]
  artifacts?: Array<Record<string, unknown>>
  latest_checkpoint?: Record<string, unknown>
}

export interface ErrorEvent {
  step_id: string
  message: string
}

export interface PlatformChangeEvent {
  platform: string
  platform_name: string
  platform_index: number
  total_platforms: number
}

export interface StepRetryingEvent {
  step_id: string
  step_name: string
  attempt: number
  previous_error?: string
  error_code?: string
}

export interface StepVerifiedEvent {
  step_id: string
  step_name: string
  verified: boolean
  attempt: number
  error_code?: string
  message?: string
  details?: Record<string, unknown>
}

export interface HandoffRequiredEvent {
  step_id: string
  step_name: string
  reason: string
  error_code?: string
  escalation_policy?: string
}

export interface ArtifactEvent {
  artifact_id: string
  run_id: string
  step_id: string
  artifact_type: string
  source: string
  capture_phase: string
  mime_type: string
  storage_key?: string | null
  preview_url?: string | null
  live_url?: string | null
  signed_url?: string | null
  width?: number | null
  height?: number | null
  captured_at: string
  content_url?: string
}

export interface WorkflowTemplateField {
  key: string
  label: string
  description: string
  required: boolean
  scope: string
  field_type: string
}

export interface WorkflowTemplateStep {
  id: string
  name_zh: string
  requires_openclaw: boolean
  retry_max_attempts: number
  screenshot_policy: string
  escalation_policy: string
  template_id?: string | null
  platform_scoped?: boolean
}

export interface WorkflowTemplate {
  id: WorkflowId
  title: string
  description: string
  multi_platform: boolean
  execution_mode: string
  screenshot_mode: string
  handoff_triggers: string[]
  required_fields: WorkflowTemplateField[]
  steps: WorkflowTemplateStep[]
}

// ── SSE 事件回调 ─────────────────────────────────────────

export interface WorkflowEventHandlers {
  onRunStarted?: (data: RunStartedEvent) => void
  onWorkflowMeta?: (data: WorkflowMetaEvent) => void
  onQueued?: (data: { message: string; queue_position: number; blocking_execution_count: number; blocking_account_ids?: string[] }) => void
  onQueueStatus?: (data: { message: string; queue_position: number; blocking_execution_count: number; blocking_account_ids?: string[] }) => void
  onStepChange?: (data: StepChangeEvent) => void
  onProgress?: (data: ProgressEvent) => void
  onScreenshot?: (data: ScreenshotEvent) => void
  onComplete?: (data: CompleteEvent) => void
  onError?: (data: ErrorEvent) => void
  onPlatformChange?: (data: PlatformChangeEvent) => void
  onCancelled?: (data: { message: string }) => void
  onStepRetrying?: (data: StepRetryingEvent) => void
  onStepVerified?: (data: StepVerifiedEvent) => void
  onHandoffRequired?: (data: HandoffRequiredEvent) => void
  onArtifactCreated?: (data: ArtifactEvent) => void
  onArtifactPersisted?: (data: ArtifactEvent) => void
}

// ── API 客户端 ───────────────────────────────────────────

function parseSseMessage(event: Event | MessageEvent, eventName: string): unknown | null {
  if (!(event instanceof MessageEvent)) {
    // EventSource 原生 error 事件不是 MessageEvent，没有可解析的 data。
    return null
  }

  if (typeof event.data !== 'string') {
    return null
  }

  const payload = event.data.trim()
  if (!payload || payload === 'undefined' || payload === 'null') {
    return null
  }

  try {
    return JSON.parse(payload)
  } catch (error) {
    console.error(`[WorkflowSSE] 解析 ${eventName} 事件失败:`, error)
    return null
  }
}

function getApiBase(): string {
  // 开发环境通过 Vite proxy
  if (import.meta.env.DEV) {
    return '/api/workflow'
  }
  return '/api/workflow'
}

let backendHealthRequest: Promise<{ status: string }> | null = null
const HOST_BROWSER_WARMUP_RETRY_DELAY_MS = 4000
const HOST_BROWSER_WARMUP_HINT = 'OpenClaw host browser 尚未启动'

async function getOptionalAuthHeaders(): Promise<Record<string, string> | undefined> {
  try {
    const {data: sessionData} = await supabase.auth.getSession()
    const authToken = sessionData?.session?.access_token
    return authToken ? {Authorization: `Bearer ${authToken}`} : undefined
  } catch (error) {
    console.warn('读取 Supabase 会话失败，改为匿名拉取运行态接口', error)
    return undefined
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function normalizeStartWorkflowError(status: number, text: string): string {
  const fallback = `启动工作流失败 (${status}): ${text}`
  if (!text) return fallback

  try {
    const parsed = JSON.parse(text) as {detail?: unknown}
    if (typeof parsed?.detail === 'string' && parsed.detail.trim()) {
      return `启动工作流失败 (${status}): ${parsed.detail.trim()}`
    }
  } catch {
    // ignore JSON parse failure and use original response body
  }

  return fallback
}

function shouldRetryStartWorkflow(status: number, text: string): boolean {
  return status === 503 && text.includes(HOST_BROWSER_WARMUP_HINT)
}

/**
 * 启动工作流
 */
export async function startWorkflow(req: WorkflowStartRequest): Promise<WorkflowStartResponse> {
  const startRequest = () => fetch(`${getApiBase()}/start`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(req),
  })

  let resp = await startRequest()
  if (!resp.ok) {
    let text = await resp.text().catch(() => '')
    if (shouldRetryStartWorkflow(resp.status, text)) {
      await sleep(HOST_BROWSER_WARMUP_RETRY_DELAY_MS)
      resp = await startRequest()
      if (!resp.ok) {
        text = await resp.text().catch(() => '')
        throw new Error(normalizeStartWorkflowError(resp.status, text))
      }
    } else {
      throw new Error(normalizeStartWorkflowError(resp.status, text))
    }
  }

  return resp.json()
}

/**
 * 取消工作流
 */
export async function cancelWorkflow(executionId: string): Promise<void> {
  await fetch(`${getApiBase()}/cancel/${executionId}`, {
    method: 'POST',
  })
}

/**
 * 订阅工作流 SSE 进度流
 *
 * 返回一个 cleanup 函数用于取消订阅。
 */
export function subscribeWorkflow(
  executionId: string,
  handlers: WorkflowEventHandlers,
): () => void {
  const url = `${getApiBase()}/stream/${executionId}`
  const eventSource = new EventSource(url)

  const eventMap: Record<string, keyof WorkflowEventHandlers> = {
    run_started: 'onRunStarted',
    workflow_meta: 'onWorkflowMeta',
    queued: 'onQueued',
    queue_status: 'onQueueStatus',
    step_change: 'onStepChange',
    progress: 'onProgress',
    screenshot: 'onScreenshot',
    complete: 'onComplete',
    error: 'onError',
    platform_change: 'onPlatformChange',
    cancelled: 'onCancelled',
    step_retrying: 'onStepRetrying',
    step_verified: 'onStepVerified',
    handoff_required: 'onHandoffRequired',
    artifact_created: 'onArtifactCreated',
    artifact_persisted: 'onArtifactPersisted',
  }

  for (const [eventName, handlerKey] of Object.entries(eventMap)) {
    eventSource.addEventListener(eventName, (event) => {
      const handler = handlers[handlerKey]
      if (!handler) return

      const data = parseSseMessage(event, eventName)
      if (data == null) return

      ;(handler as (payload: unknown) => void)(data)
    })
  }

  eventSource.onerror = () => {
    // SSE 断开（正常结束或异常）
    eventSource.close()
  }

  return () => {
    eventSource.close()
  }
}

/**
 * 测试后端连接
 */
export async function testBackendConnection(): Promise<{ status: string }> {
  if (!backendHealthRequest) {
    backendHealthRequest = fetch('/api/health')
      .then(async (resp) => {
        if (!resp.ok) {
          throw new Error('后端服务不可用')
        }
        return resp.json()
      })
      .finally(() => {
        backendHealthRequest = null
      })
  }
  return backendHealthRequest
}

export async function getWorkflowRun(executionId: string): Promise<Record<string, unknown>> {
  const resp = await fetch(`/api/workflow-runs/${executionId}`, {
    headers: await getOptionalAuthHeaders(),
  })
  if (!resp.ok) {
    throw new Error(`加载工作流运行详情失败 (${resp.status})`)
  }
  return resp.json()
}

export async function getArtifact(artifactId: string): Promise<ArtifactEvent> {
  const resp = await fetch(`/api/artifacts/${artifactId}`, {
    headers: await getOptionalAuthHeaders(),
  })
  if (!resp.ok) {
    throw new Error(`加载截图产物失败 (${resp.status})`)
  }
  return resp.json()
}

export async function getWorkflowTemplates(): Promise<WorkflowTemplate[]> {
  const resp = await fetch('/api/workflow-templates')
  if (!resp.ok) {
    throw new Error(`加载工作流模板失败 (${resp.status})`)
  }
  const data = await resp.json()
  return (data.items || []) as WorkflowTemplate[]
}

export async function validateWorkflowTemplate(
  workflowId: WorkflowId,
  payload: Record<string, unknown>,
): Promise<{valid: boolean; errors: string[]; normalized: Record<string, unknown>; template?: WorkflowTemplate}> {
  const resp = await fetch('/api/workflow-templates/validate', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      workflow_id: workflowId,
      payload,
    }),
  })
  if (!resp.ok) {
    throw new Error(`校验工作流模板失败 (${resp.status})`)
  }
  return resp.json()
}

/**
 * 检查 OpenClaw Gateway 连通性（账号验证时调用）
 * 若不可达则抛出错误。
 */
export async function checkOpenClaw(): Promise<void> {
  const resp = await fetch(`${getApiBase()}/check-openclaw`)
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}))
    throw new Error((data as { detail?: string }).detail || 'OpenClaw 不可达')
  }
}
