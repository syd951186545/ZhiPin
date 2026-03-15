// ============================================================
// OpenClaw WebSocket Protocol Types
// ============================================================

/** 所有发送到 OpenClaw 的请求消息 */
export interface OpenClawRequest {
  id: string
  action: OpenClawAction
  payload: Record<string, unknown>
  timestamp: string
  auth_token?: string
}

/** 所有来自 OpenClaw 的响应消息 */
export interface OpenClawResponse {
  id: string
  type: 'response' | 'event' | 'heartbeat' | 'error'
  action: string
  status: 'success' | 'failed' | 'progress' | 'pending'
  payload: Record<string, unknown>
  timestamp: string
  error?: { code: string; message: string }
}

// ============================================================
// Action Types
// ============================================================

export type OpenClawAction =
  // Heartbeat
  | 'ping'
  | 'pong'
  // Platform login
  | 'platform.login.manual'
  | 'platform.login.auto'
  | 'platform.login.status'
  | 'platform.verify'
  | 'platform.verify.result'
  // Task management
  | 'task.start'
  | 'task.pause'
  | 'task.resume'
  | 'task.cancel'
  // Task events (server → client)
  | 'task.progress'
  | 'task.complete'
  | 'task.error'
  // Skill management
  | 'skill.list'
  | 'skill.list.result'
  // Browser events
  | 'browser.screenshot'
  // System status
  | 'system.status'
  | 'system.status.result'
  // Raw commands
  | 'raw'

// ============================================================
// Payload Types per Action
// ============================================================

export interface PlatformLoginManualPayload {
  platform: PlatformKey
  profile_id: string
}

export interface PlatformLoginAutoPayload {
  platform: PlatformKey
  cookies: string
}

export interface PlatformLoginStatusPayload {
  platform: PlatformKey
  success: boolean
  cookies?: string
  error?: string
  account_name?: string
}

export interface PlatformVerifyPayload {
  platform: PlatformKey
  cookies: string
}

export interface PlatformVerifyResultPayload {
  platform: PlatformKey
  valid: boolean
  expires_at?: string
}

export interface TaskStartPayload {
  skill_id: string
  task_name: string
  config: Record<string, unknown>
  prompt: string
  platform?: PlatformKey
  job_id?: string
}

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
}

export interface TaskErrorPayload {
  task_id: string
  error_code: string
  error_message: string
}

export interface BrowserScreenshotPayload {
  task_id?: string
  profile_id?: string
  image_base64: string
  timestamp: string
}

export interface SystemStatusPayload {
  cpu_percent: number
  memory_percent: number
  active_tasks: number
  uptime_seconds: number
  version: string
  available_browsers: number
}

// ============================================================
// Connection State
// ============================================================

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

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
