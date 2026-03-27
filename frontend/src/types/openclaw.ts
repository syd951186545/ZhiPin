// ============================================================
// OpenClaw HTTP API Types (OpenResponses API)
// ============================================================

/** 服务状态 */
export type ServiceState = 'idle' | 'ready' | 'error'

/** OpenResponses API 请求体 */
export interface OpenClawResponsesRequest {
  model: string
  input: string
  stream?: boolean
  user?: string
  instructions?: string
}

/** SSE 事件 */
export interface OpenClawSSEEvent {
  event: string
  data: Record<string, unknown>
}

// ============================================================
// Task Event Payloads (内部事件，由 SSE 映射而来)
// ============================================================

export interface TaskProgressPayload {
  task_id: string
  progress: number
  message: string
  details?: Record<string, unknown>
}

export interface TaskCompletePayload {
  task_id: string
  result_summary: {
    jobs_posted?: number
    resumes_screened?: number
    candidates_found?: number
    messages_sent?: number
    match_rate?: number
  }
  full_response?: string
}

export interface TaskErrorPayload {
  task_id: string
  error_code: string
  error_message: string
}

export interface TaskScreenshotPayload {
  task_id: string
  screenshot: string // base64 data URL or image URL
  action?: string
  timestamp: string
}

// ============================================================
// Platform & Skill Types
// ============================================================

export type PlatformKey = '58' | 'boss_zhipin' | 'liepin' | 'zhilian' | '51job' | 'lagou'

export type PlatformLoginMethod = 'phone' | 'qr' | 'password'
export type PlatformLoginState = 'NOT_BOUND' | 'LOGGED_IN' | 'AWAIT_SMS' | 'AWAIT_QR' | 'AWAIT_PASSWORD_2FA' | 'FAILED'
export type PlatformAccountStatus = 'active' | 'needsLogin' | 'verifying' | 'expired'
export type PlatformBindingSessionStatus =
  | 'running'
  | 'awaiting_sms'
  | 'awaiting_qr'
  | 'awaiting_password_2fa'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'cancelled'

export interface OpenClawSkill {
  id: string
  name: string
  nameZh: string
  description: string
  descriptionZh: string
  taskType: 'publish_job' | 'talent_explore' | 'resume_screen' | 'auto_publish' | 'auto_source' | 'auto_reply'
  requiredPlatformLogin: boolean
  configSchema: Record<string, SkillConfigField>
  promptTemplate: string
}

export interface SkillConfigField {
  type: 'string' | 'number' | 'boolean' | 'select' | 'string[]'
  label: string
  labelZh: string
  required?: boolean
  default?: unknown
  options?: { value: string; label: string }[]
}

// ============================================================
// Platform Profile (stored locally)
// ============================================================

export interface PlatformProfile {
  id: string
  name: string
  platform: PlatformKey
  status: PlatformAccountStatus
  cookies?: string
  lastVerified?: string
  lastLogin?: string
  accountName?: string
  platformUrl?: string
  loginMethod?: PlatformLoginMethod
  loginState?: PlatformLoginState
  loginIdentifierMasked?: string
  lastError?: string
  browserSessionKey?: string
  latestBindingSession?: PlatformBindingSession | null
}

export interface PlatformConfigLocal {
  nickname: string
  boundProfileId: string
  customUrl: string
}

export interface PlatformCatalogItem {
  key: PlatformKey
  name: string
  enterprise_url: string
  recommended_login_method: PlatformLoginMethod
  supported_login_methods: PlatformLoginMethod[]
  hints: string[]
}

export interface PlatformBindingSession {
  id: string
  account_id: string
  tenant_id: string
  action: 'bind' | 'verify' | 'unbind'
  status: PlatformBindingSessionStatus
  step_key?: string | null
  openclaw_session_key: string
  latest_screenshot_url?: string | null
  qr_screenshot_url?: string | null
  awaiting_payload_schema?: {
    fields: Array<{key: string; label: string; type: string; required?: boolean}>
  } | null
  retry_count: number
  error_message?: string | null
  output_text?: string | null
  expires_at?: string | null
  created_at?: string
  updated_at?: string
}
