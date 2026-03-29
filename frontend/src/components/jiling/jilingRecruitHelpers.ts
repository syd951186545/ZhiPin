/**
 * JilingRecruit 页面工具函数（纯 TS，不含 JSX）
 *
 * 包含：
 *   - 账号/会话状态描述函数
 *   - 执行输出摘要
 *   - 执行分组工厂
 *   - 职位数据按需加载（带缓存）
 */

import {supabase} from '@/lib/supabase'
import type {PlatformAccountApiRow} from '@/services/platformAccountService'
import type {PlatformBindingSession} from '@/types/openclaw'
import type {Job} from '@/types/database'

// ── types ──────────────────────────────────────────────────────

export type RecruitJobOption = Pick<Job, 'id' | 'title'>
export type RecruitJobDetail = Pick<
  Job,
  'id' | 'title' | 'location' | 'salary_min' | 'salary_max' | 'employment_type' | 'department' | 'description' | 'requirements' | 'benefits'
>

export type PreparationTone = 'risk' | 'pass' | 'saved' | 'idle'
export type PlatformConfigSection = 'assets' | 'presets'
export type ExecutionMode = 'immediate' | 'scheduled'
export type ScheduleFrequency = 'daily' | 'weekly'

export interface ExecutionGroup {
  id: string
  platform: string
  accountId: string
  jobId: string
}

// ── job options loader ──────────────────────────────────────────

let recruitJobOptionsCache: RecruitJobOption[] | null = null
let recruitJobOptionsRequest: Promise<RecruitJobOption[]> | null = null

export async function loadRecruitJobOptions(): Promise<RecruitJobOption[]> {
  if (recruitJobOptionsCache) {
    return recruitJobOptionsCache
  }

  if (!recruitJobOptionsRequest) {
    recruitJobOptionsRequest = (async () => {
      try {
        const {data, error} = await supabase
          .from('jobs')
          .select('id, title')
          .order('created_at', {ascending: false})

        if (error) throw error
        const nextJobs = (data || []) as RecruitJobOption[]
        recruitJobOptionsCache = nextJobs
        return nextJobs
      } finally {
        recruitJobOptionsRequest = null
      }
    })()
  }

  return recruitJobOptionsRequest
}

// ── execution group factory ─────────────────────────────────────

let executionGroupSeed = 0

export function createExecutionGroup(initial?: Partial<Omit<ExecutionGroup, 'id'>>): ExecutionGroup {
  executionGroupSeed += 1
  return {
    id: `exec-group-${executionGroupSeed}`,
    platform: '',
    accountId: '',
    jobId: '',
    ...initial,
  }
}

// ── platform account helpers ───────────────────────────────────

export function bindingStatus(status?: string | null) {
  switch (status) {
    case 'running': return '执行中'
    case 'awaiting_sms': return '等待验证码'
    case 'awaiting_qr': return '等待扫码'
    case 'awaiting_password_2fa': return '等待二次验证'
    case 'completed': return '最近成功'
    case 'failed': return '最近失败'
    default: return '暂无会话'
  }
}

export function formatSessionTime(value?: string | null) {
  if (!value) return '暂无'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '暂无' : date.toLocaleString('zh-CN')
}

export const verifySessionViewLabel = (session?: PlatformBindingSession | null) => {
  if (!session) return '查看验证'
  return session.status === 'running' ? '查看验证进度' : '查看上次验证结果'
}

export const verifySessionActionLabel = (session?: PlatformBindingSession | null) => (
  session ? '重新验证' : '验证登录'
)

export const verifySessionSummary = (session?: PlatformBindingSession | null) => {
  if (!session) return '暂无验证记录'
  if (session.status === 'running') return 'OpenClaw 正在后台验证登录状态'
  return session.error_message || bindingStatus(session.status)
}

export const getLatestVerifySession = (account?: PlatformAccountApiRow | null) => (
  account?.latestBindingSession?.action === 'verify' ? account.latestBindingSession : null
)

export const isBoundPlatformAccount = (account: PlatformAccountApiRow) => (
  ['active', 'verifying'].includes(account.status)
)

export function accountStatusHint(account: PlatformAccountApiRow) {
  switch (account.status) {
    case 'active':
      return '登录状态可直接复用，建议定期做一次后台验证。'
    case 'verifying':
      return '系统正在后台处理该账号，请等待当前任务结束。'
    case 'expired':
      return '最近一次验证已失效，需要重新绑定登录态。'
    default:
      return '当前账号还没有可复用的登录态，先完成一次绑定。'
  }
}

// ── text utilities ─────────────────────────────────────────────

export function trimInlineText(value: string, max = 48) {
  if (value.length <= max) return value
  return `${value.slice(0, max)}...`
}

export function summarizeExecutionOutput(text?: string, error?: string, queueMessage?: string) {
  if (error) {
    return trimInlineText(error.replace(/\s+/g, ' ').trim(), 180)
  }

  if (queueMessage) {
    return trimInlineText(queueMessage, 180)
  }

  const lines = (text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== '─'.repeat(36) && !line.startsWith('▶ '))

  if (lines.length === 0) {
    return '系统已创建任务，正在等待步骤输出。'
  }

  return trimInlineText(lines.slice(-3).join(' / '), 180)
}
