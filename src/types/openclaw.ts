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

export type PlatformKey = '58' | 'boss_zhipin' | 'linkedin'

export interface OpenClawSkill {
  id: string
  name: string
  nameZh: string
  description: string
  descriptionZh: string
  taskType: 'auto_publish' | 'resume_screen' | 'auto_source' | 'auto_reply'
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
  status: 'active' | 'needsLogin' | 'verifying' | 'expired'
  cookies?: string
  lastVerified?: string
  lastLogin?: string
  accountName?: string
}

export interface PlatformConfigLocal {
  nickname: string
  boundProfileId: string
  customUrl: string
}
