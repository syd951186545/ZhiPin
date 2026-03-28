import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {
  AlertTriangle, Camera, Check, CheckCircle2, Circle, ClipboardCopy, Cpu,
  Eye, FileSearch, Layers, Link as LinkIcon, Loader2, LogIn, Megaphone,
  Play, RefreshCw, Search, ShieldCheck, Square, Trash2, Unplug, UserPlus, X, Zap,
} from 'lucide-react'
import {AnimatePresence, motion} from 'motion/react'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Progress} from '@/components/ui/progress'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Skeleton} from '@/components/ui/skeleton'
import {Slider} from '@/components/ui/slider'
import {Switch} from '@/components/ui/switch'
import {Textarea} from '@/components/ui/textarea'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import AddProfileDialog from '@/components/settings/AddProfileDialog'
import PlatformActionDialog from '@/components/settings/PlatformActionDialog'
import PlatformLoginDialog from '@/components/settings/PlatformLoginDialog'
import TaskMonitorPanel from '@/components/dashboard/TaskMonitorPanel'
import {useAuth} from '@/contexts/AuthContext'
import {usePlatformAccounts} from '@/hooks/usePlatformAccounts'
import {PLATFORMS} from '@/lib/constants'
import {supabase} from '@/lib/supabase'
import {cn} from '@/lib/utils'
import {JobManagementPanel} from '@/pages/Jobs'
import Candidates from '@/pages/Candidates'
import type {PlatformAccountApiRow} from '@/services/platformAccountService'
import {getWorkflowTemplates, testBackendConnection, validateWorkflowTemplate} from '@/services/workflowService'
import type {WorkflowId, WorkflowTemplate} from '@/services/workflowService'
import {useSettingsStore} from '@/stores/useSettingsStore'
import {useWorkflowStore, type ActionNode, type WorkflowExecution} from '@/stores/useWorkflowStore'
import type {Job} from '@/types/database'
import type {PlatformBindingSession} from '@/types/openclaw'

/* ── color helpers ─────────────────────────────────────────── */

const PLATFORM_COLORS: Record<string, {bg: string; text: string; ring: string; gradient: string; badge: string}> = {
  '58':          {bg: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400', ring: 'ring-orange-400/30', gradient: 'from-orange-500/12 to-orange-500/3', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'},
  boss_zhipin:   {bg: 'bg-cyan-500',   text: 'text-cyan-600 dark:text-cyan-400',   ring: 'ring-cyan-400/30',   gradient: 'from-cyan-500/12 to-cyan-500/3',   badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300'},
  liepin:        {bg: 'bg-red-500',    text: 'text-red-600 dark:text-red-400',     ring: 'ring-red-400/30',    gradient: 'from-red-500/12 to-red-500/3',     badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'},
  zhilian:       {bg: 'bg-blue-600',   text: 'text-blue-600 dark:text-blue-400',   ring: 'ring-blue-400/30',   gradient: 'from-blue-600/12 to-blue-600/3',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'},
  '51job':       {bg: 'bg-indigo-500', text: 'text-indigo-600 dark:text-indigo-400',ring: 'ring-indigo-400/30', gradient: 'from-indigo-500/12 to-indigo-500/3', badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'},
  lagou:         {bg: 'bg-emerald-500',text: 'text-emerald-600 dark:text-emerald-400',ring: 'ring-emerald-400/30',gradient: 'from-emerald-500/12 to-emerald-500/3',badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'},
}

const WORKFLOW_THEMES: Record<string, {gradient: string; iconBg: string}> = {
  publish_job:    {gradient: 'from-amber-500/10 via-orange-500/5 to-transparent', iconBg: 'bg-gradient-to-br from-amber-500/20 to-orange-500/10'},
  talent_explore: {gradient: 'from-blue-500/10 via-cyan-500/5 to-transparent', iconBg: 'bg-gradient-to-br from-blue-500/20 to-cyan-500/10'},
  resume_screen:  {gradient: 'from-violet-500/10 via-purple-500/5 to-transparent', iconBg: 'bg-gradient-to-br from-violet-500/20 to-purple-500/10'},
}

const pc = (key: string) => PLATFORM_COLORS[key] || PLATFORM_COLORS['58']
const platformGlyph = (key: string) => {
  switch (key) {
    case 'boss_zhipin': return 'B'
    case '58': return '58'
    case 'liepin': return '猎'
    case 'zhilian': return '智'
    case '51job': return '前'
    case 'lagou': return '拉'
    default: return '平'
  }
}

type RecruitJobOption = Pick<Job, 'id' | 'title'>
type RecruitJobDetail = Pick<
  Job,
  'id' | 'title' | 'location' | 'salary_min' | 'salary_max' | 'employment_type' | 'department' | 'description' | 'requirements' | 'benefits'
>

let recruitJobOptionsCache: RecruitJobOption[] | null = null
let recruitJobOptionsRequest: Promise<RecruitJobOption[]> | null = null

async function loadRecruitJobOptions(): Promise<RecruitJobOption[]> {
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

/* ── constants ─────────────────────────────────────────────── */

const WORKFLOW_CARDS: Array<{
  id: WorkflowId
  title: string
  desc: string
  icon: React.ElementType
  multiPlatform: boolean
}> = [
  {id: 'publish_job', title: '发布招聘公告', desc: '复用已绑定账号，自动填写岗位信息并发布到招聘平台。', icon: Megaphone, multiPlatform: false},
  {id: 'talent_explore', title: '市场人才探索', desc: '进入人才库主动搜索、筛选并沟通匹配候选人。', icon: Search, multiPlatform: false},
  {id: 'resume_screen', title: '简历筛选及AI沟通', desc: '多平台依次复用默认账号，AI 自动筛选简历并沟通。', icon: FileSearch, multiPlatform: true},
]

/* ── status helpers ────────────────────────────────────────── */

const statusBadge = (status: string) => {
  switch (status) {
    case 'active': return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">已绑定</Badge>
    case 'verifying': return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 border-0">处理中</Badge>
    case 'expired': return <Badge variant="destructive">已失效</Badge>
    default: return <Badge variant="outline" className="text-muted-foreground">待绑定</Badge>
  }
}

const bindingStatus = (status?: string | null) => {
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

const formatSessionTime = (value?: string | null) => {
  if (!value) return '暂无'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '暂无' : date.toLocaleString('zh-CN')
}

const verifySessionViewLabel = (session?: PlatformBindingSession | null) => {
  if (!session) return '查看验证'
  return session.status === 'running' ? '查看验证进度' : '查看上次验证结果'
}

const verifySessionActionLabel = (session?: PlatformBindingSession | null) => (
  session ? '重新验证' : '验证登录'
)

const verifySessionSummary = (session?: PlatformBindingSession | null) => {
  if (!session) return '暂无验证记录'
  if (session.status === 'running') return 'OpenClaw 正在后台验证登录状态'
  return session.error_message || bindingStatus(session.status)
}

const trimInlineText = (value: string, max = 48) => {
  if (value.length <= max) return value
  return `${value.slice(0, max)}...`
}

const getLatestVerifySession = (account?: PlatformAccountApiRow | null) => (
  account?.latestBindingSession?.action === 'verify' ? account.latestBindingSession : null
)

const isBoundPlatformAccount = (account: PlatformAccountApiRow) => (
  ['active', 'verifying'].includes(account.status)
)

const accountStatusHint = (account: PlatformAccountApiRow) => {
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

type PreparationTone = 'risk' | 'pass' | 'saved' | 'idle'
type PlatformConfigSection = 'assets' | 'presets'
type ExecutionMode = 'immediate' | 'scheduled'
type ScheduleFrequency = 'daily' | 'weekly'

interface ExecutionGroup {
  id: string
  platform: string
  accountId: string
  jobId: string
}

let executionGroupSeed = 0

function createExecutionGroup(initial?: Partial<Omit<ExecutionGroup, 'id'>>): ExecutionGroup {
  executionGroupSeed += 1
  return {
    id: `exec-group-${executionGroupSeed}`,
    platform: '',
    accountId: '',
    jobId: '',
    ...initial,
  }
}

const PREPARATION_BADGE_STYLES: Record<PreparationTone, string> = {
  risk: 'border-amber-200/80 bg-amber-100/90 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200',
  pass: 'border-emerald-200/80 bg-emerald-100/90 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200',
  saved: 'border-teal-200/80 bg-teal-100/90 text-teal-800 dark:border-teal-900/70 dark:bg-teal-950/40 dark:text-teal-200',
  idle: 'border-border/80 bg-background/88 text-muted-foreground',
}

const preparationBadge = (label: string, tone: PreparationTone) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium tracking-[0.02em]',
      PREPARATION_BADGE_STYLES[tone],
    )}
  >
    {label}
  </span>
)

function getActionNodeImageUrls(node: ActionNode): string[] {
  const deduped = new Set<string>()
  for (const candidate of [...(node.imageUrls || []), node.contentUrl, node.screenshot]) {
    if (typeof candidate !== 'string') continue
    const normalized = candidate.trim()
    if (!normalized) continue
    deduped.add(normalized)
  }
  return Array.from(deduped)
}

function getExecutionAuthGuide(error?: string, accumulatedText?: string) {
  const source = `${error || ''}\n${accumulatedText || ''}`
  if (!/(AUTH_REQUIRED|登录态已失效|需要重新登录|会话失效|重新绑定账号)/.test(source)) {
    return null
  }
  return {
    title: '当前账号登录态已失效',
    description: '请前往「平台和账号配置」，先对该账号执行“重新验证”；如果仍失败，再执行“重新绑定”完成登录后，回到当前页面重新运行工作流。',
  }
}

function getExecutionStatusMeta(execution?: WorkflowExecution | null) {
  if (!execution) {
    return {
      label: '未开始',
      badgeClassName: 'border-border/70 bg-background/90 text-muted-foreground',
    }
  }

  switch (execution.status) {
    case 'cancelling':
      return {
        label: '停止中',
        badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300',
      }
    case 'queued':
      return {
        label: '排队中',
        badgeClassName: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300',
      }
    case 'running':
    case 'starting':
      return {
        label: '执行中',
        badgeClassName: 'border-primary/20 bg-primary/[0.08] text-primary',
      }
    case 'completed':
      return {
        label: '已完成',
        badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300',
      }
    case 'failed':
      return {
        label: '已失败',
        badgeClassName: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300',
      }
    case 'cancelled':
      return {
        label: '已停止',
        badgeClassName: 'border-border/70 bg-background/90 text-muted-foreground',
      }
    default:
      return {
        label: '已结束',
        badgeClassName: 'border-border/70 bg-background/90 text-muted-foreground',
      }
  }
}

function summarizeExecutionOutput(text?: string, error?: string, queueMessage?: string) {
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

interface ExecutionDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  execution: WorkflowExecution | null
  runningStepLabel: string
  progressPercent: number
  completedStepCount: number
  isActive: boolean
  authGuide: ReturnType<typeof getExecutionAuthGuide>
  copiedText: boolean
  onCopyText: (text: string) => void
  onPreview: (src: string) => void
}

function ExecutionDetailDialog({
  open,
  onOpenChange,
  execution,
  runningStepLabel,
  progressPercent,
  completedStepCount,
  isActive,
  authGuide,
  copiedText,
  onCopyText,
  onPreview,
}: ExecutionDetailDialogProps) {
  if (!execution) return null

  const statusMeta = getExecutionStatusMeta(execution)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,1240px)] max-w-6xl overflow-hidden border-primary/12 bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--card)))] p-0">
        <div className="flex max-h-[92vh] flex-col">
          <DialogHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.12),transparent_72%)] px-6 py-5 text-left">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">Execution Detail</p>
                <DialogTitle className="mt-2 text-base">{execution.workflowName || '执行详情'}</DialogTitle>
                <DialogDescription className="mt-2 text-xs leading-6 text-muted-foreground">
                  完整步骤、截图与 AI 输出都集中在这里查看。
                </DialogDescription>
                <p className="mt-3 text-xs text-muted-foreground">当前焦点步骤：{runningStepLabel}</p>
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">{execution.executionId}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/70 bg-background/82 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">完成率</p>
                  <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{progressPercent}%</p>
                  <p className="mt-1 text-xs text-muted-foreground">{completedStepCount}/{Math.max(execution.totalSteps, 1)}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/82 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">截图节点</p>
                  <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{execution.actionNodes.length}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/82 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">状态</p>
                  <div className="mt-2">
                    <Badge variant="outline" className={cn('gap-1.5', statusMeta.badgeClassName)}>
                      {execution.status === 'cancelling' || isActive ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {statusMeta.label}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{execution.accumulatedText ? '已收到 AI 输出流' : '等待输出返回'}</p>
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="overflow-y-auto px-6 py-5">
            <div className="space-y-5">
              {authGuide && (
                <div className="flex flex-col gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/85 p-4 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>
                    <div className="space-y-1">
                      <p className="font-medium">{authGuide.title}</p>
                      <p className="text-xs leading-5 text-amber-800/90 dark:text-amber-200/90">{authGuide.description}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-4 xl:grid-cols-[0.95fr,1fr,1.08fr]">
                <div className="space-y-3" data-testid="execution-steps">
                  <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">步骤时间线</p>
                      <span className="font-mono text-lg font-semibold text-foreground">{progressPercent}%</span>
                    </div>
                    <div className="mt-3">
                      <Progress value={progressPercent} className="h-2" />
                    </div>
                    <div className="mt-4 space-y-0">
                      {execution.steps.map((step, idx) => {
                        const isLast = idx === execution.steps.length - 1
                        return (
                          <div key={step.id} className="relative flex items-start gap-3 pb-4">
                            {!isLast && (
                              <div
                                className={cn(
                                  'absolute left-[9px] top-5 h-[calc(100%-8px)] w-px',
                                  step.status === 'done' ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-border',
                                )}
                              />
                            )}
                            <div className="relative z-10 mt-0.5 shrink-0">
                              {step.status === 'failed' ? (
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"><X className="h-3 w-3 text-red-500"/></div>
                              ) : step.status === 'done' ? (
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500"/></div>
                              ) : step.status === 'running' ? (
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10"><Loader2 className="h-3.5 w-3.5 animate-spin text-primary"/></div>
                              ) : (
                                <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-muted-foreground/20"><Circle className="h-2 w-2 text-muted-foreground/30"/></div>
                              )}
                            </div>
                            <span className={cn('text-sm leading-6', step.status === 'running' ? 'font-medium text-primary' : step.status === 'done' ? 'text-foreground' : 'text-muted-foreground')}>
                              {step.nameZh}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="space-y-3" data-testid="execution-screenshots">
                  <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">截图节点</p>
                    {execution.actionNodes.length === 0 ? (
                      <div className="mt-4 flex h-52 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 text-muted-foreground">
                        <Camera className="mb-2 h-8 w-8 opacity-20"/>
                        <p className="text-xs">等待截图...</p>
                      </div>
                    ) : (
                      <div className="mt-4 max-h-[25rem] space-y-3 overflow-y-auto pr-1 scrollbar-thin">
                        {execution.actionNodes.map((node) => (
                          <ExecutionScreenshotCard key={node.id} node={node} onPreview={onPreview}/>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3" data-testid="execution-output">
                  <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">AI 完整输出</p>
                        <p className="mt-1 text-xs text-muted-foreground">适合直接复制给运营、排障或追溯系统执行决策。</p>
                      </div>
                      {execution.accumulatedText && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
                          onClick={() => onCopyText(execution.accumulatedText || '')}
                        >
                          {copiedText ? <Check className="h-3 w-3 text-emerald-500"/> : <ClipboardCopy className="h-3 w-3"/>}
                          {copiedText ? '已复制' : '复制'}
                        </Button>
                      )}
                    </div>
                    <div className="mt-4 h-[25rem] overflow-y-auto rounded-[20px] bg-zinc-950 p-4 font-mono text-xs text-zinc-100 shadow-inner scrollbar-thin">
                      {execution.accumulatedText ? (
                        <pre className="whitespace-pre-wrap break-words leading-relaxed">{execution.accumulatedText}</pre>
                      ) : (
                        <p className="flex items-center gap-2 text-zinc-500">
                          <Loader2 className="h-3 w-3 animate-spin"/>等待 AI 输出...
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ExecutionScreenshotCard({node, onPreview}: {node: ActionNode; onPreview: (src: string) => void}) {
  const imageUrls = getActionNodeImageUrls(node)
  const imageUrlKey = imageUrls.join('|')
  const [activeIndex, setActiveIndex] = useState(imageUrls.length > 0 ? 0 : -1)

  useEffect(() => {
    setActiveIndex(imageUrls.length > 0 ? 0 : -1)
  }, [node.id, imageUrlKey])

  const activeUrl = activeIndex >= 0 ? imageUrls[activeIndex] : null
  const fallbackUrl = imageUrls[0] || null
  const allAttemptsFailed = !activeUrl && imageUrls.length > 0

  return (
    <div className="overflow-hidden rounded-lg border shadow-sm">
      <div className="relative">
        {activeUrl ? (
          <button
            type="button"
            className="group/shot relative block w-full text-left"
            onClick={() => onPreview(activeUrl)}
          >
            <img
              src={activeUrl}
              alt={node.action}
              className="h-28 w-full object-cover object-top"
              onError={() => setActiveIndex((current) => (current + 1 < imageUrls.length ? current + 1 : -1))}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/shot:bg-black/10">
              <Search className="h-5 w-5 text-white opacity-0 transition-opacity group-hover/shot:opacity-80"/>
            </div>
          </button>
        ) : (
          <div className="flex h-28 flex-col items-center justify-center gap-1 bg-muted/20 px-4 text-center text-muted-foreground">
            <Camera className="h-7 w-7 opacity-30"/>
            <p className="text-xs">截图加载失败</p>
            <p className="text-[11px] opacity-80">已尝试备用链接，可直接打开原图重试。</p>
          </div>
        )}
        {node.artifactId && (
          <div className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
            {node.persisted ? '已落库' : '实时'}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t bg-muted/10 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">{node.action}</p>
          <p className="text-[11px] text-muted-foreground">{node.time}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {activeUrl && (
            <button
              type="button"
              className="text-[11px] font-medium text-primary transition-opacity hover:opacity-80"
              onClick={() => onPreview(activeUrl)}
            >
              查看
            </button>
          )}
          {fallbackUrl && (
            <a
              href={fallbackUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-medium text-muted-foreground transition-opacity hover:text-foreground"
            >
              原图
            </a>
          )}
        </div>
      </div>

      {allAttemptsFailed && (
        <div className="border-t bg-amber-50/80 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-950/20 dark:text-amber-300">
          当前卡片内预览未成功加载，但工作流截图已生成。可点击“原图”直接打开，或刷新页面后重试。
        </div>
      )}
    </div>
  )
}

/* ── main component ────────────────────────────────────────── */

export default function JilingRecruit() {
  const {user} = useAuth()
  const {catalog, accounts, loading: accountsLoading, startVerify, startUnbind, deleteAccount, load: reloadPlatformAccounts} = usePlatformAccounts()
  const {platformConfigs, companyProfile, updatePlatformConfig} = useSettingsStore()
  const {executions, executionOrder, backendReady, startWorkflow, cancelWorkflow, setBackendReady, restoreExecution} = useWorkflowStore()
  const safeCompanyProfile = companyProfile || {name: '', address: '', size: '', overview: ''}
  const [jobs, setJobs] = useState<RecruitJobOption[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)

  const [selectedPlatform, setSelectedPlatform] = useState('')
  const [platformConfigSection, setPlatformConfigSection] = useState<PlatformConfigSection>('assets')
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [platformExecConfigs, setPlatformExecConfigs] = useState<Record<string, {accountId: string; jobId: string}>>({})
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<WorkflowId>('publish_job')
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('immediate')
  const [scheduleFrequency, setScheduleFrequency] = useState<ScheduleFrequency>('daily')
  const [scheduleTime, setScheduleTime] = useState('09:00')
  const [scheduleWeekday, setScheduleWeekday] = useState('1')
  const [executionGroups, setExecutionGroups] = useState<ExecutionGroup[]>(() => [createExecutionGroup()])
  const [matchThreshold, setMatchThreshold] = useState(60)
  const [messageSendLimit, setMessageSendLimit] = useState(10)
  const [customMessage, setCustomMessage] = useState('')
  const [autoVerifyEnabled, setAutoVerifyEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    const stored = window.localStorage.getItem('jiling_recruit_auto_verify_enabled')
    return stored == null ? true : stored === 'true'
  })
  const [addAccountOpen, setAddAccountOpen] = useState(false)
  const [bindDialogOpen, setBindDialogOpen] = useState(false)
  const [bindAccountId, setBindAccountId] = useState<string | null>(null)
  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [actionSession, setActionSession] = useState<PlatformBindingSession | null>(null)
  const [actionSessionMeta, setActionSessionMeta] = useState<{platformName: string; accountName: string} | null>(null)
  const [actionPendingAccountId, setActionPendingAccountId] = useState<string | null>(null)
  const [workflowError, setWorkflowError] = useState<string | null>(null)
  const [workflowTemplates, setWorkflowTemplates] = useState<WorkflowTemplate[]>([])
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [copiedText, setCopiedText] = useState(false)
  const [activeTab, setActiveTab] = useState('execute')
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null)
  const [executionDetailOpen, setExecutionDetailOpen] = useState(false)
  const [launchingWorkflowIds, setLaunchingWorkflowIds] = useState<WorkflowId[]>([])

  const orderedExecutions = useMemo(
    () => executionOrder
      .map((executionId) => executions[executionId])
      .filter((execution): execution is WorkflowExecution => Boolean(execution)),
    [executionOrder, executions],
  )
  const activeExecutions = useMemo(
    () => orderedExecutions.filter((execution) => ['queued', 'starting', 'running', 'cancelling'].includes(execution.status)),
    [orderedExecutions],
  )
  const displayExec = useMemo(() => {
    if (selectedExecutionId && executions[selectedExecutionId]) {
      return executions[selectedExecutionId]
    }
    return orderedExecutions[0] || null
  }, [executions, orderedExecutions, selectedExecutionId])
  const workflowTemplateMap = useMemo(
    () => Object.fromEntries(workflowTemplates.map((template) => [template.id, template])),
    [workflowTemplates],
  )
  const workflowCards = useMemo(() => WORKFLOW_CARDS.map((card) => ({
    ...card,
    title: workflowTemplateMap[card.id]?.title || card.title,
    desc: workflowTemplateMap[card.id]?.description || card.desc,
    multiPlatform: workflowTemplateMap[card.id]?.multi_platform ?? card.multiPlatform,
    executionMode: workflowTemplateMap[card.id]?.execution_mode || 'auto_submit',
    screenshotMode: workflowTemplateMap[card.id]?.screenshot_mode || 'direct_url',
  })), [workflowTemplateMap])
  const selectedPlatformCatalog = useMemo(
    () => catalog.find((item) => item.key === selectedPlatform) || null,
    [catalog, selectedPlatform],
  )
  const selectedPlatformAccounts = useMemo(() => accounts.filter((item) => item.platform === selectedPlatform), [accounts, selectedPlatform])
  const selectedDefaultAccountId = platformConfigs[selectedPlatform]?.boundProfileId || ''
  const selectedDefaultAccount = useMemo(
    () => selectedPlatformAccounts.find((item) => item.id === selectedDefaultAccountId) || null,
    [selectedDefaultAccountId, selectedPlatformAccounts],
  )
  const selectedAccount = useMemo(() => selectedPlatformAccounts.find((item) => item.id === selectedAccountId), [selectedAccountId, selectedPlatformAccounts])
  const selectedLatestVerifySession = useMemo(() => getLatestVerifySession(selectedAccount), [selectedAccount])
  const selectedAccountIsBound = useMemo(() => selectedAccount ? isBoundPlatformAccount(selectedAccount) : false, [selectedAccount])
  const selectedAccountStatusHint = useMemo(() => selectedAccount ? accountStatusHint(selectedAccount) : '请选择一个账号查看详情。', [selectedAccount])
  const selectedExecJobId = platformExecConfigs[selectedPlatform]?.jobId || ''
  const selectedExecJob = useMemo(
    () => jobs.find((item) => item.id === selectedExecJobId) || null,
    [jobs, selectedExecJobId],
  )
  const resolveDefaultAccountForPlatform = useCallback((platform: string) => (
    platformConfigs[platform]?.boundProfileId || accounts.find((account) => account.platform === platform && account.status === 'active')?.id || ''
  ), [accounts, platformConfigs])
  const resolveDefaultJobForPlatform = useCallback((platform: string) => (
    platformExecConfigs[platform]?.jobId || jobs[0]?.id || ''
  ), [jobs, platformExecConfigs])
  const preparedAccount = selectedDefaultAccount || selectedAccount || null
  const preparedAccountVerifySession = useMemo(() => getLatestVerifySession(preparedAccount), [preparedAccount])
  const preparedAccountIsBound = useMemo(() => preparedAccount ? isBoundPlatformAccount(preparedAccount) : false, [preparedAccount])
  const preparedAccountStatusHint = useMemo(
    () => preparedAccount ? accountStatusHint(preparedAccount) : '请选择或新增一个账号完成执行准备。',
    [preparedAccount],
  )
  const preparedAccountStatus = useMemo<{label: string; tone: PreparationTone; description: string}>(() => {
    if (!preparedAccount) {
      return {
        label: '待绑定',
        tone: 'risk',
        description: '当前平台还没有可直接执行的主账号。',
      }
    }
    if (preparedAccount.status === 'verifying') {
      return {
        label: '验证中',
        tone: 'idle',
        description: '系统正在后台核验登录态，请等待结果刷新。',
      }
    }
    if (preparedAccount.status === 'active' && preparedAccountIsBound) {
      return {
        label: '可直接执行',
        tone: 'pass',
        description: '主账号已绑定且登录态可复用，可以进入工作流执行。',
      }
    }
    if (preparedAccount.status === 'expired') {
      return {
        label: '待重新验证',
        tone: 'risk',
        description: '最近登录态已失效，建议先重新验证，必要时重新绑定。',
      }
    }
    return {
      label: '待补齐',
      tone: 'risk',
      description: '主账号尚未完成绑定，暂时不能进入自动执行。',
    }
  }, [preparedAccount, preparedAccountIsBound])
  const strategyPreview = customMessage.trim() || '留空时，将沿用默认主动沟通模板。'
  const autoVerifyCheck = useMemo(
    () => ({
      label: '自动验证开关',
      summary: autoVerifyEnabled ? '开启' : '关闭',
      tone: (autoVerifyEnabled ? 'pass' : 'idle') as PreparationTone,
      detail: autoVerifyEnabled ? '执行前会默认保留自动验证提醒。' : '关闭后，需人工确认登录态是否仍可复用。',
    }),
    [autoVerifyEnabled],
  )
  const preflightChecks = useMemo<Array<{label: string; summary: string; tone: PreparationTone; detail: string}>>(() => ([
    preparedAccount
      ? preparedAccount.status === 'active' && preparedAccountIsBound
        ? {
            label: '登录态可复用',
            summary: '通过',
            tone: 'pass',
            detail: `${preparedAccount.name} 当前处于可复用状态，可直接发起执行。`,
          }
        : preparedAccount.status === 'verifying'
          ? {
              label: '登录态可复用',
              summary: '处理中',
              tone: 'idle',
              detail: '后台正在验证当前账号，请等待核验结果刷新。',
            }
          : {
              label: '登录态可复用',
              summary: '风险',
              tone: 'risk',
              detail: preparedAccountStatusHint,
            }
      : {
          label: '登录态可复用',
          summary: '风险',
          tone: 'risk',
          detail: '还没有指定主执行账号，无法验证登录态。',
        },
    selectedDefaultAccount
      ? {
          label: '默认执行账号',
          summary: '通过',
          tone: 'pass',
          detail: `${selectedDefaultAccount.name} 已被设为当前平台默认执行账号。`,
        }
      : {
          label: '默认执行账号',
          summary: '风险',
          tone: 'risk',
          detail: '请选择一个账号作为主执行入口，避免运行时临时兜底。',
        },
    selectedExecJob
      ? {
          label: '默认执行岗位',
          summary: '通过',
          tone: 'pass',
          detail: `${selectedExecJob.title} 已接入当前平台执行配置。`,
        }
      : {
          label: '默认执行岗位',
          summary: '风险',
          tone: 'risk',
          detail: '当前平台还没有指定岗位模板，执行时会被拦截。',
        },
    customMessage.trim()
      ? {
          label: '主动沟通模板',
          summary: '已保存',
          tone: 'saved',
          detail: '已写入自定义话术，人才探索时会优先复用。',
        }
      : {
          label: '主动沟通模板',
          summary: '默认',
          tone: 'idle',
          detail: '未自定义时，系统会使用默认沟通模板。',
        },
  ]), [customMessage, preparedAccount, preparedAccountIsBound, preparedAccountStatusHint, selectedDefaultAccount, selectedExecJob])
  const allPreparationChecks = useMemo(
    () => [...preflightChecks, autoVerifyCheck],
    [autoVerifyCheck, preflightChecks],
  )
  const selectedWorkflowCard = useMemo(
    () => workflowCards.find((workflow) => workflow.id === selectedWorkflowId) || workflowCards[0] || WORKFLOW_CARDS[0],
    [selectedWorkflowId, workflowCards],
  )
  const accountUsageCount = useMemo(() => {
    const counts = new Map<string, number>()
    executionGroups.forEach((group) => {
      if (!group.accountId) return
      counts.set(group.accountId, (counts.get(group.accountId) || 0) + 1)
    })
    return counts
  }, [executionGroups])
  const executionGroupDiagnostics = useMemo(() => executionGroups.map((group, index) => {
    const account = accounts.find((item) => item.id === group.accountId) || null
    const job = jobs.find((item) => item.id === group.jobId) || null
    const duplicateAccount = Boolean(group.accountId && (accountUsageCount.get(group.accountId) || 0) > 1)
    const missing: string[] = []
    if (!group.platform) missing.push('未选平台')
    if (!group.accountId) missing.push('未选账号')
    if (!group.jobId) missing.push('未选岗位')
    return {
      index,
      group,
      account,
      job,
      duplicateAccount,
      missing,
      complete: missing.length === 0,
      platformLabel: PLATFORMS[group.platform as keyof typeof PLATFORMS]?.name || '未选择平台',
    }
  }), [accountUsageCount, accounts, executionGroups, jobs])
  const completeExecutionGroups = useMemo(
    () => executionGroupDiagnostics.filter((item) => item.complete),
    [executionGroupDiagnostics],
  )
  const draftExecutionGroups = useMemo(
    () => executionGroupDiagnostics.filter((item) => !item.complete),
    [executionGroupDiagnostics],
  )
  const executionReadinessReasons = useMemo(() => {
    const reasons: string[] = []
    if (!backendReady) reasons.push('后端未连接，无法发起执行。')
    if (executionMode === 'scheduled') reasons.push('定期执行的保存与调度下发待后端适配。')
    if (completeExecutionGroups.length === 0) reasons.push('至少配置 1 组完整执行方案，按钮才会解锁。')
    return reasons
  }, [backendReady, completeExecutionGroups.length, executionMode])
  const canStartSelectedWorkflow = executionReadinessReasons.length === 0
  const actionDialogAccount = useMemo(
    () => actionSession ? accounts.find((item) => item.id === actionSession.account_id) || null : null,
    [accounts, actionSession],
  )
  const progressPercent = displayExec ? Math.round((displayExec.steps.filter((step) => step.status === 'done').length / Math.max(displayExec.totalSteps, 1)) * 100) : 0
  const executionAuthGuide = useMemo(
    () => getExecutionAuthGuide(displayExec?.error, displayExec?.accumulatedText),
    [displayExec?.accumulatedText, displayExec?.error],
  )
  const selectedPlatformLabel = PLATFORMS[selectedPlatform as keyof typeof PLATFORMS]?.name || '未选择平台'
  const completedStepCount = displayExec ? displayExec.steps.filter((step) => step.status === 'done').length : 0
  const runningStepLabel = displayExec?.status === 'queued'
    ? displayExec.queueMessage || `同账号排队中，前方还有 ${displayExec.blockingExecutionCount || 0} 个任务`
    : displayExec?.steps.find((step) => step.status === 'running')?.nameZh || '等待下一步执行'
  const activeExecutionCount = activeExecutions.length
  const executionPreviewItems = useMemo(() => orderedExecutions.slice(0, 8), [orderedExecutions])
  const selectedWorkflowRunningExecutions = useMemo(
    () => activeExecutions.filter((execution) => execution.workflowId === selectedWorkflowCard.id),
    [activeExecutions, selectedWorkflowCard.id],
  )
  const selectedWorkflowRunningCount = selectedWorkflowRunningExecutions.length
  const isSelectedWorkflowLaunching = launchingWorkflowIds.includes(selectedWorkflowCard.id)
  const isDisplayExecActive = Boolean(displayExec && ['queued', 'starting', 'running', 'cancelling'].includes(displayExec.status))
  const displayExecStatusMeta = useMemo(() => getExecutionStatusMeta(displayExec), [displayExec])
  const displayExecSummary = useMemo(
    () => summarizeExecutionOutput(displayExec?.accumulatedText, displayExec?.error, displayExec?.queueMessage),
    [displayExec?.accumulatedText, displayExec?.error, displayExec?.queueMessage],
  )
  const displayExecRecentNodes = useMemo(
    () => displayExec?.actionNodes.slice(-2) || [],
    [displayExec],
  )
  const shouldClampExecutionGroupList = executionGroupDiagnostics.length > 3
  const shouldClampExecutionPreviewList = executionPreviewItems.length > 4

  const getExecutionProgress = useCallback((execution: typeof displayExec) => {
    if (!execution) return 0
    return Math.round((execution.steps.filter((step) => step.status === 'done').length / Math.max(execution.totalSteps, 1)) * 100)
  }, [])

  const getExecutionRunningStepLabel = useCallback((execution: typeof displayExec) => (
    execution?.status === 'queued'
      ? execution.queueMessage || `同账号排队中，前方还有 ${execution.blockingExecutionCount || 0} 个任务`
      : execution?.steps.find((step) => step.status === 'running')?.nameZh || execution?.currentPlatform || '等待下一步执行'
  ), [])

  const workflowStatusMap = useMemo(() => {
    const statusMap = Object.fromEntries(workflowCards.map((workflow) => [workflow.id, {
      state: 'idle',
      label: '空闲',
      detail: '尚未开始',
      progress: 0,
    }])) as Record<WorkflowId, {state: string; label: string; detail: string; progress: number}>

    for (const workflow of workflowCards) {
      const runningExecutions = activeExecutions.filter((execution) => execution.workflowId === workflow.id)
      if (runningExecutions.length > 0) {
        const leadExecution = runningExecutions[0]
        const allQueued = runningExecutions.every((execution) => execution.status === 'queued')
        statusMap[workflow.id] = {
          state: runningExecutions.some((execution) => execution.status === 'cancelling')
            ? 'cancelling'
            : allQueued
              ? 'queued'
              : 'running',
          label: allQueued
            ? (runningExecutions.length > 1 ? `排队中 ${runningExecutions.length}` : '排队中')
            : runningExecutions.length > 1
              ? `并行中 ${runningExecutions.length}`
              : (leadExecution.status === 'cancelling' ? '停止中' : '执行中'),
          detail: runningExecutions.length > 1
            ? `${allQueued ? '排队中' : '运行中'} ${runningExecutions.length} 个任务，最近任务：${getExecutionRunningStepLabel(leadExecution)}`
            : getExecutionRunningStepLabel(leadExecution),
          progress: Math.max(...runningExecutions.map((execution) => getExecutionProgress(execution))),
        }
        continue
      }

      const recentExecution = orderedExecutions.find((execution) => execution.workflowId === workflow.id)
      if (!recentExecution) continue

      const recentProgress = getExecutionProgress(recentExecution)
      statusMap[workflow.id] = {
        state: recentExecution.status,
        label: recentExecution.status === 'completed'
          ? '最近成功'
          : recentExecution.status === 'failed'
            ? '最近失败'
            : recentExecution.status === 'cancelled'
              ? '最近停止'
              : recentExecution.status === 'queued'
                ? '最近排队'
              : '最近结束',
        detail: recentExecution.error || recentExecution.queueMessage || recentExecution.currentPlatform || '可查看最近一次详细记录',
        progress: recentExecution.status === 'completed' ? 100 : recentProgress,
      }
    }

    return statusMap
  }, [activeExecutions, getExecutionProgress, getExecutionRunningStepLabel, orderedExecutions, workflowCards])
  const resolvedPreparationCount = allPreparationChecks.filter((item) => item.tone === 'pass' || item.tone === 'saved').length
  const blockingPreparationCount = allPreparationChecks.filter((item) => item.tone === 'risk').length
  const readyPlatformCount = catalog.filter((item) => Boolean(resolveDefaultAccountForPlatform(item.key) && resolveDefaultJobForPlatform(item.key))).length

  // stats
  const totalAccounts = accounts.length
  const activeAccounts = accounts.filter((a) => a.status === 'active').length
  const inactiveAccounts = totalAccounts - activeAccounts
  const activePlatformAssetCount = catalog.filter((item) => accounts.some((account) => account.platform === item.key && account.status === 'active')).length

  useEffect(() => {
    let cancelled = false

    testBackendConnection()
      .then(async () => {
        if (cancelled) return
        setBackendReady(true)
        try {
          await restoreExecution()
        } catch (error) {
          console.error('恢复招聘执行状态失败', error)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBackendReady(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [restoreExecution, setBackendReady])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('jiling_recruit_auto_verify_enabled', String(autoVerifyEnabled))
  }, [autoVerifyEnabled])

  useEffect(() => {
    let cancelled = false

    getWorkflowTemplates()
      .then((items) => {
        if (!cancelled) {
          setWorkflowTemplates(items)
        }
      })
      .catch((error) => {
        console.error('加载工作流模板失败', error)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadJobOptions = async () => {
      setJobsLoading(true)
      try {
        const nextJobs = await loadRecruitJobOptions()
        if (!cancelled) {
          setJobs(nextJobs)
        }
      } catch (error) {
        console.error('加载岗位列表失败', error)
        if (!cancelled) {
          setJobs([])
        }
      } finally {
        if (!cancelled) {
          setJobsLoading(false)
        }
      }
    }

    loadJobOptions()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedPlatform && catalog[0]) setSelectedPlatform(catalog[0].key)
  }, [catalog, selectedPlatform])

  useEffect(() => {
    if (!catalog.length) return
    setPlatformExecConfigs((prev) => {
      const next = {...prev}
      for (const item of catalog) {
        const defaultAccount = platformConfigs[item.key]?.boundProfileId || accounts.find((a) => a.platform === item.key && a.status === 'active')?.id || ''
        const defaultJob = jobs[0]?.id || ''
        next[item.key] = {
          accountId: next[item.key]?.accountId || defaultAccount,
          jobId: next[item.key]?.jobId || defaultJob,
        }
      }
      return next
    })
  }, [catalog, platformConfigs, accounts, jobs])

  useEffect(() => {
    if (!selectedPlatform) return
    const boundId = platformConfigs[selectedPlatform]?.boundProfileId
    const fallbackId = selectedPlatformAccounts[0]?.id || ''
    if (!selectedAccountId || !selectedPlatformAccounts.some((item) => item.id === selectedAccountId)) {
      setSelectedAccountId(boundId || fallbackId)
    }
  }, [platformConfigs, selectedAccountId, selectedPlatform, selectedPlatformAccounts])

  useEffect(() => {
    if (selectedExecutionId && executions[selectedExecutionId]) return
    const nextExecution = activeExecutions[0] || orderedExecutions[0] || null
    if (nextExecution?.executionId) {
      setSelectedExecutionId(nextExecution.executionId)
      return
    }
    if (selectedExecutionId) {
      setSelectedExecutionId(null)
    }
  }, [activeExecutions, executions, orderedExecutions, selectedExecutionId])

  const addExecutionGroup = useCallback((initial?: Partial<Omit<ExecutionGroup, 'id'>>) => {
    setExecutionGroups((prev) => [...prev, createExecutionGroup(initial)])
  }, [])

  const updateExecutionGroup = useCallback((groupId: string, updates: Partial<Omit<ExecutionGroup, 'id'>>) => {
    setExecutionGroups((prev) => prev.map((group) => group.id === groupId ? {...group, ...updates} : group))
  }, [])

  const removeExecutionGroup = useCallback((groupId: string) => {
    setExecutionGroups((prev) => prev.length > 1 ? prev.filter((group) => group.id !== groupId) : prev)
  }, [])

  const duplicateExecutionGroup = useCallback((groupId: string) => {
    const source = executionGroups.find((group) => group.id === groupId)
    if (!source) return
    addExecutionGroup({
      platform: source.platform,
      accountId: '',
      jobId: source.jobId,
    })
  }, [addExecutionGroup, executionGroups])

  const applyPlatformToExecutionGroup = useCallback((groupId: string, platform: string) => {
    updateExecutionGroup(groupId, {
      platform,
      accountId: resolveDefaultAccountForPlatform(platform),
      jobId: resolveDefaultJobForPlatform(platform),
    })
  }, [resolveDefaultAccountForPlatform, resolveDefaultJobForPlatform, updateExecutionGroup])

  const handleStartWorkflow = useCallback(async (workflowId: WorkflowId) => {
    setWorkflowError(null)

    if (!backendReady) {
      setWorkflowError('后端服务未连接，无法发起执行。')
      return
    }

    if (executionMode === 'scheduled') {
      setWorkflowError('定期执行的保存与调度下发待后端适配，当前请先使用立即执行。')
      return
    }

    if (completeExecutionGroups.length === 0) {
      setWorkflowError('请至少补齐 1 组平台、账号、岗位都完整的执行方案。')
      return
    }

    setLaunchingWorkflowIds((prev) => prev.includes(workflowId) ? prev : [...prev, workflowId])

    try {
      const preparedPayloads = await Promise.all(completeExecutionGroups.map(async ({group}, index) => {
        const {data: jobData, error: jobError} = await supabase
          .from('jobs')
          .select('id, title, location, salary_min, salary_max, employment_type, department, description, requirements, benefits')
          .eq('id', group.jobId)
          .single()

        if (jobError) {
          throw new Error(`第 ${index + 1} 组加载岗位详情失败：${jobError.message}`)
        }

        const job = jobData as RecruitJobDetail | null
        if (!job) {
          throw new Error(`第 ${index + 1} 组未找到选择的岗位信息，请重新选择。`)
        }

        const account = accounts.find((item) => item.id === group.accountId)
        if (!account) {
          throw new Error(`第 ${index + 1} 组未找到绑定账号，请重新选择。`)
        }

        const workflowPayload = {
          workflow_id: workflowId,
          tenant_id: user?.tenantId || '',
          user_id: user?.id || '',
          platform: group.platform,
          account_id: group.accountId,
          account_name: account.accountName || account.name || '',
          platforms: [group.platform],
          platform_account_ids: {[group.platform]: group.accountId},
          job_id: job.id,
          job_title: job.title,
          job_location: job.location || '',
          job_salary_min: job.salary_min || undefined,
          job_salary_max: job.salary_max || undefined,
          job_employment_type: job.employment_type,
          job_department: job.department || '',
          job_description: job.description || '',
          job_requirements: job.requirements || '',
          job_benefits: job.benefits || '',
          company_name: platformConfigs[group.platform]?.nickname || safeCompanyProfile.name || '我们公司',
          company_address: safeCompanyProfile.address,
          company_size: safeCompanyProfile.size,
          company_overview: safeCompanyProfile.overview,
          min_match_score: matchThreshold,
          max_results: 30,
          message_send_limit: messageSendLimit,
          custom_message: customMessage,
        }

        const validation = await validateWorkflowTemplate(workflowId, workflowPayload)
        if (!validation.valid) {
          throw new Error(validation.errors[0] || `第 ${index + 1} 组配置未通过校验，请先完成配置。`)
        }

        return workflowPayload
      }))

      const executionIds = await Promise.all(preparedPayloads.map((payload) => startWorkflow(payload)))
      if (executionIds[0]) {
        setSelectedExecutionId(executionIds[0])
      }
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : '启动工作流失败')
    } finally {
      setLaunchingWorkflowIds((prev) => prev.filter((id) => id !== workflowId))
    }
  }, [backendReady, completeExecutionGroups, customMessage, executionMode, matchThreshold, messageSendLimit, platformConfigs, safeCompanyProfile, startWorkflow, user])

  const handleAction = async (type: 'verify' | 'unbind', accountId: string) => {
    if (type === 'verify') {
      const account = accounts.find((item) => item.id === accountId)
      const latestVerifySession = account?.latestBindingSession?.action === 'verify' ? account.latestBindingSession : null
      if (latestVerifySession?.status === 'running') {
        reopenActionSession(latestVerifySession, accountId)
        return
      }
    }

    setActionPendingAccountId(accountId)
    setWorkflowError(null)
    try {
      const session = type === 'verify' ? await startVerify(accountId) : await startUnbind(accountId)
      const account = accounts.find((item) => item.id === accountId)
      setActionSession(session)
      setActionSessionMeta({
        platformName: PLATFORMS[account?.platform as keyof typeof PLATFORMS]?.name || account?.platform || selectedPlatform,
        accountName: account?.name || account?.accountName || '',
      })
      setActionDialogOpen(true)
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : `${type === 'verify' ? '验证' : '解绑'}失败`)
    } finally {
      setActionPendingAccountId(null)
    }
  }

  const reopenActionSession = useCallback((session: PlatformBindingSession, accountId: string) => {
    const account = accounts.find((item) => item.id === accountId)
    setActionSession(session)
    setActionSessionMeta({
      platformName: PLATFORMS[account?.platform as keyof typeof PLATFORMS]?.name || account?.platform || selectedPlatform,
      accountName: account?.name || account?.accountName || '',
    })
    setActionDialogOpen(true)
  }, [accounts, selectedPlatform])

  const openBindDialogForAccount = useCallback((accountId: string) => {
    setBindAccountId(accountId)
    setBindDialogOpen(true)
  }, [])

  const handleAccountCreated = useCallback(async (createdAccount?: PlatformAccountApiRow) => {
    await reloadPlatformAccounts()
    if (createdAccount) {
      setSelectedPlatform(createdAccount.platform)
      setSelectedAccountId(createdAccount.id)
    }
  }, [reloadPlatformAccounts])

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(true)
      setTimeout(() => setCopiedText(false), 2000)
    })
  }

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm('确定要删除此账号吗？删除后不可恢复。')) return
    try {
      await deleteAccount(accountId)
      await reloadPlatformAccounts()
    } catch (e) {
      setWorkflowError(e instanceof Error ? e.message : '删除账号失败')
    }
  }

  const renderAccountActionButtons = (
    account: PlatformAccountApiRow,
    variant: 'selected',
  ) => {
    const latestVerifySession = getLatestVerifySession(account)
    const canReopenVerify = Boolean(latestVerifySession)
    const canVerifyAccount = account.status === 'active'
    const canRebindAccount = account.status === 'expired'
    const canUnbindAccount = account.status === 'active' || account.status === 'verifying'
    const isBoundAccount = isBoundPlatformAccount(account)
    const pending = actionPendingAccountId === account.id
    const size = 'sm'
    const viewClassName = 'gap-2'
    const primaryClassName = 'gap-2 shadow-sm'
    const verifyClassName = 'gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950'
    const unbindClassName = 'gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950'

    if (!isBoundAccount) {
      return (
        <Button
          size={size}
          className={primaryClassName}
          onClick={() => openBindDialogForAccount(account.id)}
          disabled={pending}
          data-testid={canRebindAccount ? 'rebind-account' : 'open-bind-dialog'}
        >
          <LogIn className='h-3.5 w-3.5'/>
          {pending ? '处理中...' : canRebindAccount ? '重新绑定' : '开始绑定'}
        </Button>
      )
    }

    return (
      <>
        {canReopenVerify && latestVerifySession && (
          <Button
            size={size}
            variant="outline"
            className={viewClassName}
            onClick={() => reopenActionSession(latestVerifySession, account.id)}
            data-testid='reopen-verify-dialog'
          >
            <Search className='h-3.5 w-3.5'/>
            {verifySessionViewLabel(latestVerifySession)}
          </Button>
        )}
        {canVerifyAccount && (
          <Button
            size={size}
            variant="outline"
            className={verifyClassName}
            onClick={() => handleAction('verify', account.id)}
            disabled={pending}
            data-testid='verify-account'
          >
            <ShieldCheck className='h-3.5 w-3.5'/>
            {pending ? '验证中...' : verifySessionActionLabel(latestVerifySession)}
          </Button>
        )}
        {canUnbindAccount && (
          <Button
            size={size}
            variant="outline"
            className={unbindClassName}
            onClick={() => handleAction('unbind', account.id)}
            disabled={pending}
            data-testid='unbind-account'
          >
            <Unplug className='h-3.5 w-3.5'/>
            {pending ? '解绑中...' : '解绑账号'}
          </Button>
        )}
      </>
    )
  }

  return (
    <div className="space-y-6" data-testid="jiling-recruit-page">
      {/* ── Header with gradient background ── */}
      <div className="rounded-2xl bg-gradient-to-r from-primary/[0.06] via-primary/[0.03] to-transparent p-6 dark:from-primary/[0.08] dark:via-primary/[0.04]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
              <Cpu className="h-6 w-6 text-primary-foreground"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">机灵招聘</h1>
            </div>
          </div>
        </div>
        {/* Stats row */}
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500"/>
            <span className="text-sm text-muted-foreground">
              已绑定 <span className="font-semibold text-foreground">{accountsLoading ? '加载中' : activeAccounts}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500"/>
            <span className="text-sm text-muted-foreground">
              失效 <span className="font-semibold text-foreground">{accountsLoading ? '加载中' : inactiveAccounts}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-primary/40"/>
            <span className="text-sm text-muted-foreground">
              总账号 <span className="font-semibold text-foreground">{accountsLoading ? '加载中' : totalAccounts}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('inline-block h-2 w-2 rounded-full', backendReady ? 'bg-emerald-500' : 'bg-red-500')}/>
            <span className="text-sm text-muted-foreground">{backendReady ? '后端已连接' : '后端未连接'}</span>
          </div>
        </div>
      </div>

      {/* ── Alerts ── */}
      {!backendReady && (
        <motion.div initial={{opacity: 0, y: -8}} animate={{opacity: 1, y: 0}} className="flex items-center gap-3 rounded-xl border border-yellow-300/50 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-500/20 dark:bg-yellow-950/20 dark:text-yellow-300">
          <AlertTriangle className="h-5 w-5 shrink-0"/>后端服务未连接，请确认 FastAPI 已启动。
        </motion.div>
      )}
      {workflowError && (
        <motion.div initial={{opacity: 0, y: -8}} animate={{opacity: 1, y: 0}} className="flex items-center justify-between gap-4 rounded-xl border border-red-200/50 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-950/20 dark:text-red-300">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0"/>{workflowError}</span>
          <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1.5 border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950 text-xs" onClick={() => { setWorkflowError(null); setActiveTab('platform-config') }}>
            <LinkIcon className="h-3 w-3"/>前往配置
          </Button>
        </motion.div>
      )}

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6" data-testid="jiling-recruit-tabs">
        <TabsList className="h-10 bg-muted/50 p-1">
          <TabsTrigger value="execute" className="gap-1.5 data-[state=active]:shadow-sm" data-testid="tab-execute"><Play className="h-3.5 w-3.5"/>招聘执行</TabsTrigger>
          <TabsTrigger value="candidates" className="gap-1.5 data-[state=active]:shadow-sm"><FileSearch className="h-3.5 w-3.5"/>候选人</TabsTrigger>
          <TabsTrigger value="platform-config" className="gap-1.5 data-[state=active]:shadow-sm" data-testid="tab-platform-config"><LinkIcon className="h-3.5 w-3.5"/>平台和账号配置</TabsTrigger>
          <TabsTrigger value="jobs" className="gap-1.5 data-[state=active]:shadow-sm"><Cpu className="h-3.5 w-3.5"/>岗位管理</TabsTrigger>
        </TabsList>

        {/* ── Platform & Account Config Tab ── */}
        <TabsContent value="platform-config" className="mt-0 space-y-5" data-testid="platform-config-tab">
        <Card className="overflow-hidden border-primary/12 bg-[linear-gradient(135deg,hsl(var(--card)),hsl(var(--primary)/0.08)_38%,transparent_88%)]">
          <CardContent className="p-5 md:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">Platform Assets</p>
                <h3 className="mt-2 text-[28px] font-semibold tracking-tight text-foreground">平台与账号配置</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  统一维护六大平台的账号资产和全局预设。先选平台，再管理账号。
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[24px] border border-border/70 bg-background/82 px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">平台总数</p>
                  <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{catalog.length}</p>
                </div>
                <div className="rounded-[24px] border border-emerald-200/60 bg-emerald-50/70 px-4 py-3 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">生效平台</p>
                  <p className="mt-2 font-mono text-2xl font-semibold text-emerald-800 dark:text-emerald-100">{activePlatformAssetCount}</p>
                </div>
                <div className="rounded-[24px] border border-primary/15 bg-primary/[0.06] px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">生效账号</p>
                  <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{activeAccounts}</p>
                </div>
                <div className="rounded-[24px] border border-amber-200/70 bg-amber-50/75 px-4 py-3 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">失效账号</p>
                  <p className="mt-2 font-mono text-2xl font-semibold text-amber-800 dark:text-amber-100">{inactiveAccounts}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={platformConfigSection} onValueChange={(value) => setPlatformConfigSection(value as PlatformConfigSection)} className="space-y-5">
          <TabsList className="h-10 bg-muted/50 p-1">
            <TabsTrigger value="assets" className="gap-1.5 data-[state=active]:shadow-sm">平台账号资产</TabsTrigger>
            <TabsTrigger value="presets" className="gap-1.5 data-[state=active]:shadow-sm">全局执行预设</TabsTrigger>
          </TabsList>

          <TabsContent value="assets" className="mt-0 space-y-5">
        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_360px]">

        {/* Platform Catalog */}
        <Card className="overflow-hidden" data-testid="platform-catalog-panel">
          <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.07),transparent_72%)] pb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">Platform Picker</p>
            <CardTitle className="mt-2 text-base">选择平台</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2.5 pt-4">
            {accountsLoading && catalog.length === 0 ? Array.from({length: 6}).map((_, index) => (
              <div key={index} className="rounded-2xl border p-3">
                <Skeleton className="h-14 w-full"/>
              </div>
            )) : catalog.map((item) => {
              const count = accounts.filter((a) => a.platform === item.key).length
              const activeCount = accounts.filter((a) => a.platform === item.key && a.status === 'active').length
              const hasActive = accounts.some((a) => a.platform === item.key && a.status === 'active')
              const colors = pc(item.key)
              const isSelected = selectedPlatform === item.key
              return (
                <motion.button
                  key={item.key}
                  type="button"
                  data-testid={`platform-card-${item.key}`}
                  whileHover={{scale: 1.02}}
                  whileTap={{scale: 0.98}}
                  onClick={() => setSelectedPlatform(item.key)}
                  aria-pressed={isSelected}
                  className={cn(
                    'relative overflow-hidden rounded-[22px] border px-3 py-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                    isSelected
                      ? `border-transparent bg-gradient-to-br ${colors.gradient} ring-2 ${colors.ring} shadow-sm`
                      : 'border-border hover:border-border/80 hover:shadow-sm',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className={cn('flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold text-white', colors.bg)}>
                        {platformGlyph(item.key)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{activeCount}/{Math.max(count, 0)} 可用</p>
                      </div>
                    </div>
                    {isSelected && <Badge variant="outline" className="border-primary/20 bg-background/80 text-[10px] text-primary">当前</Badge>}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge className={cn('border-0 text-xs', count ? colors.badge : 'bg-muted text-muted-foreground')}>
                      {count ? `${count} 个账号` : '未添加账号'}
                    </Badge>
                    <Badge variant="outline" className={cn('text-xs', hasActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' : 'text-muted-foreground')}>
                      {hasActive ? '可用' : '待绑定'}
                    </Badge>
                  </div>
                </motion.button>
              )
            })}
          </CardContent>
        </Card>

        {/* Account List */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.07),transparent_72%)] pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">Account Roster</p>
                <CardTitle className="mt-2 text-base">{selectedPlatformLabel}账号列表</CardTitle>
              </div>
              <Button size="sm" className="gap-2 shadow-sm shrink-0" onClick={() => setAddAccountOpen(true)} data-testid="open-add-account-dialog">
                <UserPlus className="h-4 w-4"/>新增平台账号
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {accountsLoading ? (
              Array.from({length: 3}).map((_, index) => (
                <div key={index} className="rounded-xl border p-4">
                  <Skeleton className="h-20 w-full"/>
                </div>
              ))
            ) : selectedPlatformAccounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <UserPlus className="h-5 w-5 text-muted-foreground"/>
                </div>
                <p className="text-sm font-medium text-muted-foreground">当前平台暂无账号</p>
                <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => setAddAccountOpen(true)}>
                  <UserPlus className="h-3.5 w-3.5"/>添加账号
                </Button>
              </div>
            ) : selectedPlatformAccounts.map((account) => {
              const isSelected = selectedAccountId === account.id
              const isDefaultAccount = platformConfigs[selectedPlatform]?.boundProfileId === account.id
              const latestVerifySession = getLatestVerifySession(account)
              const isBoundAccount = isBoundPlatformAccount(account)
              const verificationStateLabel = !isBoundAccount
                ? account.status === 'expired' ? '登录失效' : '未绑定'
                : latestVerifySession
                  ? bindingStatus(latestVerifySession.status)
                  : '已绑定'
              return (
                <motion.div
                  key={account.id}
                  layout
                  initial={{opacity: 0, y: 8}}
                  animate={{opacity: 1, y: 0}}
                  data-testid={`account-row-${account.id}`}
                  className={cn(
                    'group relative overflow-hidden rounded-2xl border p-4 transition-all duration-200',
                    isSelected ? 'border-primary/30 bg-primary/[0.03] shadow-sm shadow-primary/5' : 'border-border hover:shadow-sm hover:border-border/80',
                  )}
                >
                  <button type="button" className="w-full text-left" onClick={() => setSelectedAccountId(account.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground">{account.name}</p>
                          {statusBadge(account.status)}
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] uppercase tracking-[0.16em]',
                              !isBoundAccount
                                ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                                : latestVerifySession?.status === 'running'
                                  ? 'border-primary/20 bg-primary/[0.06] text-primary'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
                            )}
                          >
                            {verificationStateLabel}
                          </Badge>
                          {isDefaultAccount && <Badge variant="outline" className="text-[10px]">默认执行</Badge>}
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">登录名</p>
                            <p className="mt-1 truncate text-sm text-foreground">{account.accountName || account.loginIdentifierMasked || '未填写'}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">最近会话</p>
                            <p className="mt-1 text-sm text-foreground">{bindingStatus(account.latestBindingSession?.status)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">上次验证</p>
                            <p className="mt-1 text-sm text-foreground">{latestVerifySession ? formatSessionTime(latestVerifySession.updated_at || latestVerifySession.created_at) : '-'}</p>
                          </div>
                        </div>
                        {account.lastError && <p className="mt-3 text-xs text-red-500 line-clamp-2">{account.lastError}</p>}
                      </div>
                      {isSelected && <Badge variant="outline" className="text-[10px] text-primary">当前</Badge>}
                    </div>
                  </button>
                </motion.div>
              )
            })}
          </CardContent>
        </Card>

        <Card className="overflow-hidden" data-testid="selected-account-panel">
          <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.07),transparent_72%)] pb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">Selected Account</p>
            <CardTitle className="mt-2 text-base">账号详情</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {selectedAccount ? (
              <>
                <div className="rounded-[22px] border border-border/70 bg-background/85 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-foreground">{selectedAccount.name}</p>
                        {statusBadge(selectedAccount.status)}
                        {platformConfigs[selectedPlatform]?.boundProfileId === selectedAccount.id && (
                          <Badge variant="outline" className="text-[10px]">默认执行</Badge>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        登录名：{selectedAccount.accountName || selectedAccount.loginIdentifierMasked || '未填写'}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">{selectedAccountStatusHint}</p>
                      {selectedAccount.lastError && (
                        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{selectedAccount.lastError}</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {renderAccountActionButtons(selectedAccount, 'selected')}
                    {selectedAccount.status === 'active' && platformConfigs[selectedPlatform]?.boundProfileId !== selectedAccount.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => {
                          updatePlatformConfig(selectedPlatform, {boundProfileId: selectedAccount.id})
                          setSelectedAccountId(selectedAccount.id)
                        }}
                      >
                        <Check className="h-3.5 w-3.5"/>设为默认
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                      onClick={() => handleDeleteAccount(selectedAccount.id)}
                      disabled={actionPendingAccountId === selectedAccount.id}
                    >
                      <Trash2 className="h-3.5 w-3.5"/>删除账号
                    </Button>
                  </div>
                </div>

                <div className="rounded-[22px] border border-border/70 bg-background/85 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">验证状态</p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {selectedAccountIsBound
                          ? selectedLatestVerifySession
                            ? bindingStatus(selectedLatestVerifySession.status)
                            : '已绑定'
                          : selectedAccount.status === 'expired'
                            ? '已失效'
                            : '未绑定'}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] uppercase tracking-[0.16em]',
                        !selectedAccountIsBound
                          ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                          : selectedLatestVerifySession?.status === 'running'
                            ? 'border-primary/20 bg-primary/[0.06] text-primary'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
                      )}
                    >
                      {selectedLatestVerifySession?.status === 'running'
                        ? '验证中'
                        : selectedAccountIsBound
                          ? '可复用'
                          : selectedAccount.status === 'expired'
                            ? '需重绑'
                            : '待绑定'}
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                    <div className="flex items-center justify-between gap-3">
                      <span>最近会话</span>
                      <span>{bindingStatus(selectedAccount.latestBindingSession?.status)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>上次更新时间</span>
                      <span>{formatSessionTime(selectedLatestVerifySession?.updated_at || selectedLatestVerifySession?.created_at || selectedAccount.lastVerified)}</span>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-muted-foreground">
                    {selectedLatestVerifySession
                      ? verifySessionSummary(selectedLatestVerifySession)
                      : selectedAccount.status === 'expired'
                        ? '该账号最近一次登录态已经失效，请重新绑定后再进行验证。'
                        : '当前账号还没有验证记录，完成绑定后即可查看验证结果。'}
                  </p>

                  {selectedLatestVerifySession?.latest_screenshot_url && (
                    <div className="mt-4 overflow-hidden rounded-xl border bg-muted/20">
                      <img
                        src={selectedLatestVerifySession.latest_screenshot_url}
                        alt={`${selectedAccount.name} 最近验证截图`}
                        className="h-48 w-full object-cover object-top"
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[22px] border border-dashed px-6 text-center">
                <Circle className="h-10 w-10 text-muted-foreground/40"/>
                <p className="mt-4 text-sm font-medium text-muted-foreground">请选择一个账号查看详情</p>
                <p className="mt-2 text-xs leading-6 text-muted-foreground/80">
                  右侧会显示当前账号的验证状态、最近结果，以及可执行的绑定/验证/解绑动作。
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        </div>
          </TabsContent>

          <TabsContent value="presets" className="mt-0 space-y-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_360px]">
              <Card className="overflow-hidden">
                <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.07),transparent_72%)] pb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">Global Presets</p>
                  <CardTitle className="mt-2 text-base">全局执行预设</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5 pt-4">
                  <div className="rounded-[24px] border border-border/70 bg-background/82 p-4 shadow-sm">
                    <Label htmlFor="platform-config-custom-message" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      默认主动沟通话术
                    </Label>
                    <Textarea
                      id="platform-config-custom-message"
                      placeholder="例如：您好，我是机灵平台企业招聘负责人，目前在招聘区域运营经理岗位，想先确认您最近是否方便沟通。"
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      rows={7}
                      maxLength={500}
                      className="mt-3 min-h-[12rem] resize-none rounded-[20px] border-border/70 bg-background/90 text-sm leading-7"
                    />
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-xs leading-6 text-muted-foreground">{strategyPreview}</p>
                        <p className={cn('text-[11px]', customMessage.length >= 500 ? 'font-medium text-destructive' : customMessage.length >= 450 ? 'text-amber-600' : 'text-muted-foreground')}>
                          {customMessage.length}/500 字符
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">单次发送上限</span>
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          value={messageSendLimit}
                          onChange={(e) => {
                            const nextValue = Math.max(1, Math.min(50, Number(e.target.value) || 10))
                            setMessageSendLimit(nextValue)
                          }}
                          className="h-9 w-20 rounded-full text-center text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-[24px] border border-border/70 bg-background/82 p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-foreground">{autoVerifyCheck.label}</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{autoVerifyCheck.detail}</p>
                        </div>
                        <Switch checked={autoVerifyEnabled} onCheckedChange={setAutoVerifyEnabled} aria-label="自动验证开关"/>
                      </div>
                      <p className="mt-3 text-xl font-semibold tracking-tight text-foreground">{autoVerifyCheck.summary}</p>
                    </div>

                    <div className="rounded-[24px] border border-border/70 bg-background/82 p-4 shadow-sm">
                      <p className="text-sm font-medium text-foreground">预设将如何生效</p>
                      <ul className="mt-3 space-y-2 text-xs leading-6 text-muted-foreground">
                        <li>执行页新增执行组时，会优先带入平台默认账号和默认岗位。</li>
                        <li>人才探索工作流会自动带入这份默认沟通话术与人数上限。</li>
                        <li>平台页处理的是长期配置，执行页只负责本次运行的即时编排。</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.07),transparent_72%)] pb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">Preset Coverage</p>
                  <CardTitle className="mt-2 text-base">预设覆盖范围</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                  <div className="rounded-[24px] border border-border/70 bg-background/82 p-4 shadow-sm">
                    <p className="text-sm font-medium text-foreground">这里应该配置什么</p>
                    <p className="mt-2 text-xs leading-6 text-muted-foreground">平台绑定账号、平台默认执行账号、平台默认岗位模板、默认沟通话术、默认单次发送上限。</p>
                  </div>
                  <div className="rounded-[24px] border border-border/70 bg-background/82 p-4 shadow-sm">
                    <p className="text-sm font-medium text-foreground">这里不处理什么</p>
                    <p className="mt-2 text-xs leading-6 text-muted-foreground">本次执行到底选哪几个执行组、立即执行还是定期执行、每次运行的临时增删改，都在招聘执行页处理。</p>
                  </div>
                  <div className="rounded-[24px] border border-emerald-200/70 bg-emerald-50/80 p-4 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/20">
                    <p className="text-sm font-medium text-emerald-800 dark:text-emerald-100">当前长期配置完成度</p>
                    <p className="mt-2 font-mono text-2xl font-semibold text-emerald-800 dark:text-emerald-100">{resolvedPreparationCount}</p>
                    <p className="mt-1 text-xs leading-6 text-emerald-700/80 dark:text-emerald-200/80">这代表已经可被执行页自动带入的默认项数量。</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
        </TabsContent>

        <TabsContent value="execute" className="space-y-6 mt-0" data-testid="execute-tab">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_380px]">
            <div className="space-y-6">
              <Card className="overflow-hidden" data-testid="workflow-cards">
                <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.06),transparent_72%)] pb-4">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">Workflow Selector</p>
                      <CardTitle className="mt-2 text-base">三大工作流</CardTitle>
                    </div>
                    <div className="flex items-center gap-3 rounded-full border border-border/70 bg-background/80 px-3 py-2 shadow-sm shrink-0">
                      <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.18em] whitespace-nowrap">
                        筛选阈值 <span className="ml-1 text-foreground font-bold">{matchThreshold}分</span>
                      </Label>
                      <div className="w-24">
                        <Slider value={[matchThreshold]} onValueChange={([value]) => setMatchThreshold(value)} min={0} max={100} step={5}/>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    {workflowCards.map((workflow) => {
                      const theme = WORKFLOW_THEMES[workflow.id] || WORKFLOW_THEMES.publish_job
                      const status = workflowStatusMap[workflow.id]
                      const isSelected = selectedWorkflowCard.id === workflow.id
                      return (
                        <motion.button
                          key={workflow.id}
                          type="button"
                          data-testid={`workflow-card-${workflow.id}`}
                          whileHover={{y: -2}}
                          transition={{duration: 0.2}}
                          onClick={() => setSelectedWorkflowId(workflow.id)}
                          className={cn(
                            'rounded-[28px] border bg-background/88 p-4 text-left transition-all duration-200',
                            isSelected ? 'border-primary/40 shadow-[0_18px_48px_-32px_hsl(var(--primary)/0.55)] ring-1 ring-primary/20' : 'border-border/70 hover:border-border hover:shadow-sm',
                          )}
                        >
                          <div className={cn('inline-flex h-11 w-11 items-center justify-center rounded-2xl', theme.iconBg)}>
                            <workflow.icon className="h-5 w-5 text-primary"/>
                          </div>
                          <div className="mt-4 flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{workflow.title}</p>
                              <p className="mt-1 text-xs leading-6 text-muted-foreground">{workflow.desc}</p>
                            </div>
                            {workflow.multiPlatform && (
                              <Badge variant="outline" className="gap-1 border-border/70 bg-background/82 text-[10px] uppercase tracking-[0.16em]">
                                <Layers className="h-3 w-3"/>多组
                              </Badge>
                            )}
                          </div>
                          <div className="mt-4 space-y-3">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-muted-foreground">当前状态</span>
                              <Badge variant="outline" className={cn(
                                'border text-[10px] uppercase tracking-[0.16em]',
                                status.state === 'running'
                                  ? 'border-primary/30 bg-primary/[0.08] text-primary'
                                  : status.state === 'completed'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                                    : status.state === 'failed'
                                      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
                                      : 'border-border/70 bg-background/82 text-muted-foreground',
                              )}>
                                {status.label}
                              </Badge>
                            </div>
                            <Progress value={status.progress} className="h-2 rounded-full"/>
                            <p className="text-[11px] leading-5 text-muted-foreground">{status.detail}</p>
                          </div>
                        </motion.button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="overflow-hidden border-primary/12 bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--card)))]" data-testid="execution-composer">
                <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.05),transparent_72%)] pb-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">Execution Composer</p>
                      <CardTitle className="mt-2 text-base">{selectedWorkflowCard.title}</CardTitle>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button type="button" onClick={() => setExecutionMode('immediate')} className={cn('rounded-[24px] border px-4 py-3 text-left transition-all', executionMode === 'immediate' ? 'border-primary/35 bg-primary/[0.08] shadow-sm' : 'border-border/70 bg-background/82')}>
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Play className="h-4 w-4 text-primary"/>立即执行
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">通过前端校验后立即发起任务。</p>
                      </button>
                      <button type="button" onClick={() => setExecutionMode('scheduled')} className={cn('rounded-[24px] border px-4 py-3 text-left transition-all', executionMode === 'scheduled' ? 'border-primary/35 bg-primary/[0.08] shadow-sm' : 'border-border/70 bg-background/82')}>
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <RefreshCw className="h-4 w-4 text-primary"/>定期执行
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">先在前端排期，等待后端调度适配。</p>
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5 pt-5">
                  {executionMode === 'scheduled' && (
                    <div className="grid gap-3 rounded-[28px] border border-amber-200/70 bg-amber-50/70 p-4 dark:border-amber-900/40 dark:bg-amber-950/15 md:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-900/70 dark:text-amber-100/80">执行频率</Label>
                        <Select value={scheduleFrequency} onValueChange={(value: ScheduleFrequency) => setScheduleFrequency(value)}>
                          <SelectTrigger className="h-10 rounded-2xl border-amber-200/70 bg-background/95 text-sm shadow-none dark:border-amber-900/40">
                            <SelectValue placeholder="选择频率"/>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">每天</SelectItem>
                            <SelectItem value="weekly">每周</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-900/70 dark:text-amber-100/80">执行时间</Label>
                        <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="h-10 rounded-2xl border-amber-200/70 bg-background/95 text-sm shadow-none dark:border-amber-900/40"/>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-900/70 dark:text-amber-100/80">周执行日</Label>
                        <Select value={scheduleWeekday} onValueChange={setScheduleWeekday} disabled={scheduleFrequency !== 'weekly'}>
                          <SelectTrigger className="h-10 rounded-2xl border-amber-200/70 bg-background/95 text-sm shadow-none dark:border-amber-900/40">
                            <SelectValue placeholder="选择星期"/>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">周一</SelectItem>
                            <SelectItem value="2">周二</SelectItem>
                            <SelectItem value="3">周三</SelectItem>
                            <SelectItem value="4">周四</SelectItem>
                            <SelectItem value="5">周五</SelectItem>
                            <SelectItem value="6">周六</SelectItem>
                            <SelectItem value="0">周日</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {selectedWorkflowCard.id === 'talent_explore' && (
                    <div className="grid gap-4 rounded-[28px] border border-border/70 bg-background/82 p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_280px]">
                      <div className="space-y-2">
                        <Label htmlFor="custom-message" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">本次主动沟通覆盖</Label>
                        <Textarea id="custom-message" placeholder="留空则沿用平台与账号页中的全局预设。" value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} rows={4} maxLength={500} className="rounded-[22px] border-border/70 bg-background/95 text-sm resize-none"/>
                        <p className={cn('text-[11px]', customMessage.length >= 500 ? 'text-destructive font-medium' : customMessage.length >= 450 ? 'text-orange-500' : 'text-muted-foreground')}>
                          {customMessage.length}/500 字符。填写后仅覆盖本次运行。
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">单次发送上限 <span className="ml-1 text-foreground font-bold">{messageSendLimit} 条</span></Label>
                        <div className="rounded-[22px] border border-border/70 bg-background/95 p-4">
                          <Slider value={[messageSendLimit]} onValueChange={([value]) => setMessageSendLimit(value)} min={1} max={50} step={1}/>
                          <div className="mt-4 flex items-center gap-3">
                            <Input type="number" min={1} max={50} value={messageSendLimit} onChange={(e) => { const value = Math.max(1, Math.min(50, Number(e.target.value) || 10)); setMessageSendLimit(value) }} className="h-10 rounded-2xl text-center text-sm"/>
                            <p className="text-[11px] leading-5 text-muted-foreground">限制一次运行内最多发送多少条消息。</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">执行组编排</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">补齐账号与岗位后即可启动，不同账号可同时运行。</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-border/70 bg-background/82 text-[10px] uppercase tracking-[0.16em]">完整 {completeExecutionGroups.length}</Badge>
                      <Badge variant="outline" className="border-border/70 bg-background/82 text-[10px] uppercase tracking-[0.16em]">草稿 {draftExecutionGroups.length}</Badge>
                      <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={() => addExecutionGroup({ platform: selectedPlatform || catalog[0]?.key || '', accountId: selectedPlatform ? resolveDefaultAccountForPlatform(selectedPlatform) : '', jobId: selectedPlatform ? resolveDefaultJobForPlatform(selectedPlatform) : '' })}>
                        <Layers className="h-3.5 w-3.5"/>新增执行组
                      </Button>
                    </div>
                  </div>

                  <div className={cn('space-y-3', shouldClampExecutionGroupList && 'max-h-[36rem] overflow-y-auto pr-1 scrollbar-thin')}>
                    {executionGroupDiagnostics.map((item) => {
                      const platformAccounts = accounts.filter((account) => account.platform === item.group.platform && account.status === 'active')
                      const hasAccounts = platformAccounts.length > 0
                      return (
                        <div key={item.group.id} className="rounded-[28px] border border-border/70 bg-background/86 p-4 shadow-sm">
                          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-muted/30 text-sm font-semibold text-foreground">
                                {String(item.index + 1).padStart(2, '0')}
                              </div>
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-foreground">执行组 {item.index + 1}</p>
                                  <Badge variant="outline" className={cn('border text-[10px] uppercase tracking-[0.16em]', item.complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300' : item.duplicateAccount ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300' : 'border-border/70 bg-background/82 text-muted-foreground')}>
                                    {item.complete ? '完整' : item.duplicateAccount ? '冲突' : '草稿'}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.complete ? `${item.platformLabel} · ${item.account?.name || '已选账号'} · ${item.job?.title || '已选岗位'}` : item.missing.join(' / ')}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={() => duplicateExecutionGroup(item.group.id)}>
                                <ClipboardCopy className="h-3.5 w-3.5"/>复制
                              </Button>
                              <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full text-destructive hover:text-destructive" onClick={() => removeExecutionGroup(item.group.id)} disabled={executionGroups.length <= 1}>
                                <Trash2 className="h-3.5 w-3.5"/>删除
                              </Button>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 lg:grid-cols-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">平台</Label>
                              <Select value={item.group.platform || ''} onValueChange={(value) => applyPlatformToExecutionGroup(item.group.id, value)}>
                                <SelectTrigger className="h-11 rounded-2xl border-border/70 bg-background/95 text-sm shadow-none">
                                  <SelectValue placeholder="选择平台"/>
                                </SelectTrigger>
                                <SelectContent>
                                  {catalog.map((platform) => <SelectItem key={platform.key} value={platform.key}>{platform.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">账号</Label>
                              <Select value={item.group.accountId || ''} onValueChange={(value) => updateExecutionGroup(item.group.id, {accountId: value})} disabled={!item.group.platform || accountsLoading}>
                                <SelectTrigger className="h-11 rounded-2xl border-border/70 bg-background/95 text-sm shadow-none">
                                  <SelectValue placeholder={item.group.platform ? '选择账号' : '先选择平台'}/>
                                </SelectTrigger>
                                <SelectContent>
                                  {accountsLoading
                                    ? <SelectItem value="_loading_accounts" disabled>账号加载中...</SelectItem>
                                    : !item.group.platform
                                      ? <SelectItem value="_platform_first" disabled>请先选择平台</SelectItem>
                                      : platformAccounts.length === 0
                                        ? <SelectItem value="_none" disabled>当前平台暂无可用账号</SelectItem>
                                        : platformAccounts.map((account) => {
                                          const usedByOthers = Boolean(accountUsageCount.get(account.id)) && account.id !== item.group.accountId
                                          return <SelectItem key={account.id} value={account.id}>{account.name}{usedByOthers ? '（同账号串行）' : ''}</SelectItem>
                                        })}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">岗位</Label>
                              <Select value={item.group.jobId || ''} onValueChange={(value) => updateExecutionGroup(item.group.id, {jobId: value})} disabled={jobsLoading}>
                                <SelectTrigger className="h-11 rounded-2xl border-border/70 bg-background/95 text-sm shadow-none">
                                  <SelectValue placeholder="选择岗位"/>
                                </SelectTrigger>
                                <SelectContent>
                                  {jobsLoading
                                    ? <SelectItem value="_loading_jobs" disabled>岗位加载中...</SelectItem>
                                    : jobs.length === 0
                                      ? <SelectItem value="_none" disabled>暂无岗位</SelectItem>
                                      : jobs.map((job) => <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex flex-wrap items-center gap-2 text-[11px]">
                              <Badge variant="outline" className="border-border/70 bg-background/82 text-muted-foreground">平台可重复</Badge>
                              <Badge variant="outline" className={cn('border-border/70 bg-background/82', item.duplicateAccount ? 'text-sky-700 dark:text-sky-300' : 'text-muted-foreground')}>同账号自动排队</Badge>
                              <Badge variant="outline" className="border-border/70 bg-background/82 text-muted-foreground">岗位可重复</Badge>
                            </div>
                            <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => { setSelectedPlatform(item.group.platform || selectedPlatform); setActiveTab('platform-config') }}>
                              <LinkIcon className="h-3.5 w-3.5"/>去平台与账号页补齐长期配置
                            </Button>
                          </div>

                          {!hasAccounts && item.group.platform && (
                            <div className="mt-4 rounded-[22px] border border-amber-200/70 bg-amber-50/75 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                              当前平台还没有可用账号。先到“平台与账号配置”绑定账号，再回到这里编排执行组。
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
              <Card className="overflow-hidden" data-testid="execution-readiness">
                <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.08),transparent_72%)] pb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">Launch Gate</p>
                  <CardTitle className="mt-2 text-base">启动条件</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-5">
                  <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                    <div className="rounded-[24px] border border-border/70 bg-background/82 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">当前工作流</p>
                      <p className="mt-2 text-sm font-semibold text-foreground">{selectedWorkflowCard.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{workflowStatusMap[selectedWorkflowCard.id].detail}</p>
                    </div>
                    <div className="rounded-[24px] border border-border/70 bg-background/82 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">完整执行组</p>
                      <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{completeExecutionGroups.length}</p>
                    </div>
                    <div className="rounded-[24px] border border-border/70 bg-background/82 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">平台长期就绪度</p>
                      <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{readyPlatformCount}/{catalog.length}</p>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-border/70 bg-background/82 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">解锁清单</p>
                      <Badge variant="outline" className={cn('border text-[10px] uppercase tracking-[0.16em]', canStartSelectedWorkflow ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300')}>
                        {canStartSelectedWorkflow ? '可以启动' : '尚未解锁'}
                      </Badge>
                    </div>
                    <div className="mt-4 space-y-3">
                      {executionReadinessReasons.length === 0 ? (
                        <div className="flex items-start gap-3 rounded-[22px] border border-emerald-200/70 bg-emerald-50/75 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>
                          <div>
                            <p className="font-medium">前端校验已通过</p>
                            <p className="mt-1 text-xs leading-5">当前可以直接启动；同账号会自动排队串行，不同账号仍会并行处理。</p>
                          </div>
                        </div>
                      ) : executionReadinessReasons.map((reason, index) => (
                        <div key={`${reason}-${index}`} className="flex items-start gap-3 rounded-[22px] border border-border/70 bg-background/95 px-4 py-3 text-sm">
                          <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"/>
                          <span className="leading-6 text-muted-foreground">{reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    data-testid={`workflow-action-${selectedWorkflowCard.id}`}
                    className="h-12 w-full gap-2 rounded-full"
                    onClick={() => handleStartWorkflow(selectedWorkflowCard.id)}
                    disabled={!canStartSelectedWorkflow || isSelectedWorkflowLaunching}
                  >
                    {executionMode === 'scheduled'
                      ? <><RefreshCw className="h-4 w-4"/>保存并启用定时任务</>
                      : isSelectedWorkflowLaunching
                        ? <><Loader2 className="h-4 w-4 animate-spin"/>正在下发 {completeExecutionGroups.length} 组任务</>
                        : <><Play className="h-4 w-4"/>开始执行（{completeExecutionGroups.length} 组）</>}
                  </Button>
                  {selectedWorkflowRunningCount > 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      当前该工作流仍有 {selectedWorkflowRunningCount} 个进行中或排队中的任务，可在下方任务预览里单独停止。
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="overflow-hidden" data-testid="workflow-progress-overview">
                <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.04),transparent_72%)] pb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">Parallel Overview</p>
                  <CardTitle className="mt-2 text-base">并行进度概览</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                  {workflowCards.map((workflow) => {
                    const status = workflowStatusMap[workflow.id]
                    const theme = WORKFLOW_THEMES[workflow.id] || WORKFLOW_THEMES.publish_job
                    return (
                      <button key={workflow.id} type="button" onClick={() => setSelectedWorkflowId(workflow.id)} className={cn('w-full rounded-[24px] border p-4 text-left transition-all', selectedWorkflowCard.id === workflow.id ? 'border-primary/30 bg-primary/[0.05]' : 'border-border/70 bg-background/82 hover:border-border')}>
                        <div className="flex items-start gap-3">
                          <div className={cn('mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl', theme.iconBg)}>
                            <workflow.icon className="h-4.5 w-4.5 text-primary"/>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-foreground">{workflow.title}</p>
                              <Badge variant="outline" className="border-border/70 bg-background/85 text-[10px] uppercase tracking-[0.16em]">{status.label}</Badge>
                            </div>
                            <Progress value={status.progress} className="mt-3 h-2 rounded-full"/>
                            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{status.detail}</p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </CardContent>
              </Card>
            </div>
          </div>

          {executionPreviewItems.length > 0 && (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_360px]">
              <Card className="overflow-hidden border-primary/12 bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--card)))]" data-testid="execution-running-queue">
                <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.08),transparent_72%)] pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">Execution Preview</p>
                      <CardTitle className="mt-2 text-base">任务执行预览</CardTitle>
                    </div>
                    <Badge variant="outline" className="border-primary/15 bg-primary/[0.06] text-primary">
                      进行中 {activeExecutionCount} / 共 {executionPreviewItems.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className={cn('space-y-3', shouldClampExecutionPreviewList && 'max-h-[38rem] overflow-y-auto pr-1 scrollbar-thin')}>
                    {executionPreviewItems.map((execution) => {
                      const isSelected = displayExec?.executionId === execution.executionId
                      const isCancelling = execution.status === 'cancelling'
                      const isExecutionActive = ['queued', 'starting', 'running', 'cancelling'].includes(execution.status)
                      const progress = getExecutionProgress(execution)
                      const statusMeta = getExecutionStatusMeta(execution)
                      const previewText = summarizeExecutionOutput(execution.accumulatedText, execution.error, execution.queueMessage)
                      return (
                        <div
                          key={execution.executionId}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedExecutionId(execution.executionId)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setSelectedExecutionId(execution.executionId)
                            }
                          }}
                          className={cn(
                            'w-full rounded-[24px] border bg-background/82 p-4 text-left transition-all',
                            isSelected ? 'border-primary/30 bg-primary/[0.05]' : 'border-border/70 hover:border-border',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-foreground">{execution.workflowName || execution.workflowId}</p>
                                <Badge variant="outline" className={cn('text-[10px] uppercase tracking-[0.16em]', statusMeta.badgeClassName)}>
                                  {isExecutionActive ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                                  {statusMeta.label}
                                </Badge>
                              </div>
                              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{getExecutionRunningStepLabel(execution)}</p>
                              <p className="mt-2 text-[11px] leading-5 text-foreground/82">{previewText}</p>
                              <p className="mt-2 font-mono text-[11px] text-muted-foreground">{execution.executionId}</p>
                            </div>
                            {execution.currentPlatform && (
                              <Badge variant="outline" className="border-border/70 bg-background/90 text-[10px]">
                                {execution.currentPlatform}
                              </Badge>
                            )}
                          </div>
                          <Progress value={progress} className="mt-4 h-2 rounded-full"/>
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-[11px] text-muted-foreground">{progress}% · {execution.steps.filter((step) => step.status === 'done').length}/{Math.max(execution.totalSteps, 1)} · 截图 {execution.actionNodes.length}</p>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1.5 rounded-full"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setSelectedExecutionId(execution.executionId)
                                  setExecutionDetailOpen(true)
                                }}
                              >
                                <Eye className="h-3.5 w-3.5"/>详情
                              </Button>
                              {isExecutionActive && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  className="h-8 gap-1.5 rounded-full"
                                  disabled={isCancelling}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    cancelWorkflow(execution.executionId)
                                  }}
                                >
                                  {isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Square className="h-3.5 w-3.5"/>}
                                  {isCancelling ? '停止中' : '停止'}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {displayExec && (
                <Card className="overflow-hidden border-primary/12 bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--card)))]" data-testid="execution-monitor">
                  <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.12),transparent_72%)] pb-5">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">Execution Snapshot</p>
                          <CardTitle className="mt-2 text-base">任务摘要</CardTitle>
                        </div>
                        <Badge variant="outline" className={cn('text-[10px] uppercase tracking-[0.16em]', displayExecStatusMeta.badgeClassName)}>
                          {isDisplayExecActive ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                          {displayExecStatusMeta.label}
                        </Badge>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{displayExec.workflowName || '执行任务'}</p>
                      <p className="text-[11px] text-muted-foreground">当前焦点步骤：{runningStepLabel}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{displayExec.executionId}</p>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-border/70 bg-background/82 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">完成率</p>
                        <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{progressPercent}%</p>
                        <p className="mt-1 text-xs text-muted-foreground">{completedStepCount}/{Math.max(displayExec.totalSteps, 1)}</p>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-background/82 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">截图节点</p>
                        <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{displayExec.actionNodes.length}</p>
                        <p className="mt-1 text-xs text-muted-foreground">当前步骤：{runningStepLabel}</p>
                      </div>
                    </div>

                    {executionAuthGuide && (
                      <div className="rounded-[22px] border border-amber-200/70 bg-amber-50/85 px-4 py-3 text-xs leading-6 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200">
                        <p className="font-medium">{executionAuthGuide.title}</p>
                        <p className="mt-1">{executionAuthGuide.description}</p>
                      </div>
                    )}

                    <div className="rounded-[24px] border border-border/70 bg-background/82 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">最近输出摘要</p>
                      <p className="mt-3 text-sm leading-6 text-foreground/88">{displayExecSummary}</p>
                    </div>

                    <div className="rounded-[24px] border border-border/70 bg-background/82 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">最近截图预览</p>
                      {displayExecRecentNodes.length === 0 ? (
                        <div className="mt-3 flex h-24 items-center justify-center rounded-2xl border border-dashed bg-muted/20 text-xs text-muted-foreground">
                          暂无截图，等待任务返回第一张执行证据。
                        </div>
                      ) : (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {displayExecRecentNodes.map((node) => {
                            const previewUrl = getActionNodeImageUrls(node)[0]
                            return (
                              <button
                                key={node.id}
                                type="button"
                                className="overflow-hidden rounded-2xl border border-border/70 bg-background/90 text-left"
                                onClick={() => previewUrl && setLightboxSrc(previewUrl)}
                              >
                                {previewUrl ? (
                                  <img src={previewUrl} alt={node.action} className="h-24 w-full object-cover object-top"/>
                                ) : (
                                  <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">截图加载中</div>
                                )}
                                <div className="px-3 py-2">
                                  <p className="truncate text-[11px] font-medium text-foreground">{node.action}</p>
                                  <p className="mt-1 text-[10px] text-muted-foreground">{node.time}</p>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button className="h-10 gap-2 rounded-full" onClick={() => setExecutionDetailOpen(true)}>
                        <Eye className="h-4 w-4"/>查看任务详情
                      </Button>
                      {isDisplayExecActive && (
                        <Button
                          variant="destructive"
                          className="h-10 gap-2 rounded-full"
                          onClick={() => cancelWorkflow(displayExec.executionId)}
                          disabled={displayExec.status === 'cancelling'}
                        >
                          {displayExec.status === 'cancelling' ? <Loader2 className="h-4 w-4 animate-spin"/> : <Square className="h-4 w-4"/>}
                          {displayExec.status === 'cancelling' ? '停止中' : '停止该任务'}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <TaskMonitorPanel/>
        </TabsContent>

        <TabsContent value="jobs" className="mt-0"><JobManagementPanel/></TabsContent>
      <TabsContent value="candidates" className="mt-0"><Candidates embedded/></TabsContent>
      </Tabs>

      <ExecutionDetailDialog
        open={executionDetailOpen}
        onOpenChange={setExecutionDetailOpen}
        execution={displayExec}
        runningStepLabel={runningStepLabel}
        progressPercent={progressPercent}
        completedStepCount={completedStepCount}
        isActive={isDisplayExecActive}
        authGuide={executionAuthGuide}
        copiedText={copiedText}
        onCopyText={copyText}
        onPreview={setLightboxSrc}
      />

      {/* ── Lightbox ── */}
      <AnimatePresence>
        {lightboxSrc && (
          <motion.div
            key="lightbox"
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
            onClick={() => setLightboxSrc(null)}
          >
            <Button variant="ghost" size="icon" className="absolute right-4 top-4 z-[81] text-white hover:bg-white/10" onClick={() => setLightboxSrc(null)}>
              <X className="h-5 w-5"/>
            </Button>
            <motion.img
              initial={{scale: 0.9, opacity: 0}}
              animate={{scale: 1, opacity: 1}}
              exit={{scale: 0.9, opacity: 0}}
              src={lightboxSrc}
              alt="截图放大"
              className="max-h-[90vh] max-w-full rounded-xl shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Dialogs ── */}
      <AddProfileDialog open={addAccountOpen} onOpenChange={setAddAccountOpen} defaultPlatform={(selectedPlatform || catalog[0]?.key || 'boss_zhipin') as keyof typeof PLATFORMS} onCreated={handleAccountCreated}/>
      <PlatformLoginDialog open={bindDialogOpen} onOpenChange={setBindDialogOpen} profileId={bindAccountId} onDataChanged={reloadPlatformAccounts}/>
      <PlatformActionDialog
        open={actionDialogOpen}
        onOpenChange={(open) => {
          setActionDialogOpen(open)
          if (!open) {
            setActionSession(null)
            setActionSessionMeta(null)
          }
        }}
        session={actionSession}
        platformName={actionSessionMeta?.platformName}
        accountName={actionSessionMeta?.accountName}
        onDataChanged={reloadPlatformAccounts}
        followupActionLabel={actionSession?.action === 'verify' ? (actionDialogAccount?.status === 'expired' ? '重新绑定' : '重新验证') : undefined}
        onFollowupAction={actionSession?.action === 'verify'
          ? () => {
            if (actionDialogAccount?.status === 'expired') {
              openBindDialogForAccount(actionSession.account_id)
              return
            }
            void handleAction('verify', actionSession.account_id)
          }
          : undefined}
      />
    </div>
  )
}
