/**
 * 工作流 API 客户端
 *
 * 负责与 FastAPI 后端通信：启动工作流、取消工作流、SSE 进度订阅。
 * 替代原来的 openclawService 直接调用 OpenClaw 的逻辑。
 */

// ── 类型定义 ─────────────────────────────────────────────

export type WorkflowId = 'publish_job' | 'talent_explore' | 'resume_screen'

export interface WorkflowStartRequest {
  workflow_id: WorkflowId
  tenant_id: string
  user_id?: string

  // 平台与账号
  platform?: string
  platforms?: string[]
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

  // OpenClaw 配置
  openclaw_base_url?: string
  openclaw_auth_token?: string

  // Supabase 用户认证令牌（后端用于绕过 RLS 写入数据）
  supabase_auth_token?: string

  // 工作流参数
  min_match_score?: number
  max_results?: number
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
  screenshots: string[]
}

export interface ScreenshotEvent {
  step_id: string
  screenshot: string
  action: string
  timestamp: string
}

export interface CompleteEvent {
  result_summary?: Record<string, unknown>
  announcement?: string
  publish_result?: Record<string, unknown>
  screenshots?: string[]
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

// ── SSE 事件回调 ─────────────────────────────────────────

export interface WorkflowEventHandlers {
  onWorkflowMeta?: (data: WorkflowMetaEvent) => void
  onStepChange?: (data: StepChangeEvent) => void
  onProgress?: (data: ProgressEvent) => void
  onScreenshot?: (data: ScreenshotEvent) => void
  onComplete?: (data: CompleteEvent) => void
  onError?: (data: ErrorEvent) => void
  onPlatformChange?: (data: PlatformChangeEvent) => void
  onCancelled?: (data: { message: string }) => void
}

// ── API 客户端 ───────────────────────────────────────────

function getApiBase(): string {
  // 开发环境通过 Vite proxy
  if (import.meta.env.DEV) {
    return '/api/workflow'
  }
  return '/api/workflow'
}

/**
 * 启动工作流
 */
export async function startWorkflow(req: WorkflowStartRequest): Promise<string> {
  const resp = await fetch(`${getApiBase()}/start`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(req),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`启动工作流失败 (${resp.status}): ${text}`)
  }

  const data = await resp.json()
  return data.execution_id
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
    workflow_meta: 'onWorkflowMeta',
    step_change: 'onStepChange',
    progress: 'onProgress',
    screenshot: 'onScreenshot',
    complete: 'onComplete',
    error: 'onError',
    platform_change: 'onPlatformChange',
    cancelled: 'onCancelled',
  }

  for (const [eventName, handlerKey] of Object.entries(eventMap)) {
    eventSource.addEventListener(eventName, (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        const handler = handlers[handlerKey]
        if (handler) {
          ;(handler as (data: unknown) => void)(data)
        }
      } catch (err) {
        console.error(`[WorkflowSSE] 解析 ${eventName} 事件失败:`, err)
      }
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
  const resp = await fetch('/api/health')
  if (!resp.ok) {
    throw new Error('后端服务不可用')
  }
  return resp.json()
}
