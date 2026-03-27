import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
  AlertTriangle, Camera, Check, CheckCircle2, Circle, ClipboardCopy, Cpu, ExternalLink,
  FileSearch, Layers, Link as LinkIcon, Loader2, LogIn, Megaphone, MoreHorizontal,
  Play, RefreshCw, Search, ShieldCheck, Square, Trash2, Unplug, UserPlus, X, Zap,
} from 'lucide-react'
import {AnimatePresence, motion} from 'motion/react'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import {useWorkflowStore, type ActionNode} from '@/stores/useWorkflowStore'
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
  account.status !== 'expired' && (Boolean(account.browserSessionKey) || ['active', 'verifying'].includes(account.status))
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
  const {activeExecution, lastExecution, backendReady, startWorkflow, cancelWorkflow, setBackendReady, restoreExecution} = useWorkflowStore()
  const safeCompanyProfile = companyProfile || {name: '', address: '', size: '', overview: ''}
  const [jobs, setJobs] = useState<RecruitJobOption[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)

  const [selectedPlatform, setSelectedPlatform] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [platformExecConfigs, setPlatformExecConfigs] = useState<Record<string, {accountId: string; jobId: string}>>({})
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

  const textEndRef = useRef<HTMLDivElement>(null)
  const platformSelectionAutoInitRef = useRef(false)
  const displayExec = activeExecution || lastExecution
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
  const selectablePlatformKeys = useMemo<string[]>(
    () => catalog
      .filter((item) => {
        const config = platformExecConfigs[item.key] || {accountId: '', jobId: ''}
        return Boolean(config.accountId && config.jobId)
      })
      .map((item) => item.key),
    [catalog, platformExecConfigs],
  )
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
  const runningStepLabel = displayExec?.steps.find((step) => step.status === 'running')?.nameZh || '等待下一步执行'
  const resolvedPreparationCount = allPreparationChecks.filter((item) => item.tone === 'pass' || item.tone === 'saved').length
  const blockingPreparationCount = allPreparationChecks.filter((item) => item.tone === 'risk').length

  // stats
  const totalAccounts = accounts.length
  const activeAccounts = accounts.filter((a) => a.status === 'active').length
  const pendingAccounts = totalAccounts - activeAccounts

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
    setSelectedPlatforms((prev) => {
      const filtered = prev.filter((item) => selectablePlatformKeys.includes(item))
      if (!platformSelectionAutoInitRef.current && filtered.length === 0 && selectablePlatformKeys.length) {
        platformSelectionAutoInitRef.current = true
        return selectablePlatformKeys
      }
      return filtered.length === prev.length ? prev : filtered
    })
  }, [catalog.length, selectablePlatformKeys])

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
    textEndRef.current?.scrollIntoView({behavior: 'smooth'})
  }, [displayExec?.accumulatedText])

  const togglePlatformSelection = (platform: string) => {
    setSelectedPlatforms((prev) => prev.includes(platform) ? prev.filter((item) => item !== platform) : [...prev, platform])
  }

  const handleStartWorkflow = useCallback(async (workflowId: WorkflowId) => {
    setWorkflowError(null)

    const runnablePlatforms = selectedPlatforms.filter((platform) => {
      const config = platformExecConfigs[platform]
      return Boolean(config?.accountId && config?.jobId)
    })

    if (runnablePlatforms.length === 0) {
      setWorkflowError('请先选中至少一个平台卡片，并为其配置账号和岗位。')
      return
    }

    const platformAccountIds: Record<string, string> = {}
    for (const platform of runnablePlatforms) {
      const config = platformExecConfigs[platform]
      if (!config?.accountId) {
        setWorkflowError(`平台 ${PLATFORMS[platform as keyof typeof PLATFORMS]?.name || platform} 未配置执行账号，请先选择。`)
        return
      }
      if (!config?.jobId) {
        setWorkflowError(`平台 ${PLATFORMS[platform as keyof typeof PLATFORMS]?.name || platform} 未配置招聘岗位，请先选择。`)
        return
      }
      platformAccountIds[platform] = config.accountId
    }

    const firstPlatform = runnablePlatforms[0]
    const firstJobId = platformExecConfigs[firstPlatform]?.jobId
    const {data: firstJobData, error: firstJobError} = await supabase
      .from('jobs')
      .select('id, title, location, salary_min, salary_max, employment_type, department, description, requirements, benefits')
      .eq('id', firstJobId)
      .single()

    if (firstJobError) {
      setWorkflowError(`加载岗位详情失败：${firstJobError.message}`)
      return
    }

    const firstJob = firstJobData as RecruitJobDetail | null
    if (!firstJob) {
      setWorkflowError('未找到选择的岗位信息，请重新选择。')
      return
    }
    const firstAccountId = platformAccountIds[firstPlatform]
    const firstAccount = accounts.find((a) => a.id === firstAccountId)

    const workflowPayload = {
      workflow_id: workflowId,
      tenant_id: user?.tenantId || '',
      user_id: user?.id || '',
      platform: firstPlatform,
      account_id: firstAccountId,
      account_name: firstAccount?.accountName || firstAccount?.name || '',
      platforms: runnablePlatforms,
      platform_account_ids: platformAccountIds,
      job_id: firstJob.id,
      job_title: firstJob.title,
      job_location: firstJob.location || '',
      job_salary_min: firstJob.salary_min || undefined,
      job_salary_max: firstJob.salary_max || undefined,
      job_employment_type: firstJob.employment_type,
      job_department: firstJob.department || '',
      job_description: firstJob.description || '',
      job_requirements: firstJob.requirements || '',
      job_benefits: firstJob.benefits || '',
      company_name: platformConfigs[firstPlatform]?.nickname || safeCompanyProfile.name || '我们公司',
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
      setWorkflowError(validation.errors[0] || '当前工作流配置未通过校验，请先完成配置。')
      return
    }

    await startWorkflow(workflowPayload)
  }, [accounts, customMessage, matchThreshold, messageSendLimit, platformConfigs, platformExecConfigs, safeCompanyProfile, selectedPlatforms, startWorkflow, user])

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

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(true)
      setTimeout(() => setCopiedText(false), 2000)
    })
  }

  const renderAccountActionButtons = (
    account: PlatformAccountApiRow,
    variant: 'selected' | 'row',
  ) => {
    const latestVerifySession = getLatestVerifySession(account)
    const canReopenVerify = Boolean(latestVerifySession)
    const canVerifyAccount = account.status === 'active'
    const canRebindAccount = account.status === 'expired'
    const canUnbindAccount = account.status === 'active' || account.status === 'verifying'
    const isBoundAccount = isBoundPlatformAccount(account)
    const pending = actionPendingAccountId === account.id
    const size = variant === 'selected' ? 'sm' : 'sm'
    const viewClassName = variant === 'selected' ? 'gap-2' : 'h-7 gap-1.5 px-2.5 text-xs'
    const primaryClassName = variant === 'selected' ? 'gap-2 shadow-sm' : 'h-7 gap-1.5 px-2.5 text-xs shadow-sm'
    const verifyClassName = variant === 'selected'
      ? 'gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950'
      : 'h-7 gap-1.5 border-emerald-200 px-2.5 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950'
    const unbindClassName = variant === 'selected'
      ? 'gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950'
      : 'h-7 gap-1.5 border-red-200 px-2.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950'

    if (!isBoundAccount) {
      return (
        <Button
          size={size}
          className={primaryClassName}
          onClick={() => openBindDialogForAccount(account.id)}
          disabled={pending}
          data-testid={variant === 'selected' ? (canRebindAccount ? 'rebind-account' : 'open-bind-dialog') : undefined}
        >
          <LogIn className={variant === 'selected' ? 'h-3.5 w-3.5' : 'h-3 w-3'}/>
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
            data-testid={variant === 'selected' ? 'reopen-verify-dialog' : `account-view-verify-${account.id}`}
          >
            <Search className={variant === 'selected' ? 'h-3.5 w-3.5' : 'h-3 w-3'}/>
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
            data-testid={variant === 'selected' ? 'verify-account' : undefined}
          >
            <ShieldCheck className={variant === 'selected' ? 'h-3.5 w-3.5' : 'h-3 w-3'}/>
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
            data-testid={variant === 'selected' ? 'unbind-account' : undefined}
          >
            <Unplug className={variant === 'selected' ? 'h-3.5 w-3.5' : 'h-3 w-3'}/>
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
              <p className="mt-0.5 text-sm text-muted-foreground">平台账号绑定、持久登录、招聘工作流统一编排</p>
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
              待绑定 <span className="font-semibold text-foreground">{accountsLoading ? '加载中' : pendingAccounts}</span>
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
              <div className="max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">Execution Prep Zone</p>
                <h3 className="mt-2 text-[28px] font-semibold tracking-tight text-foreground">平台与账号配置</h3>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                  这里不是普通设置页，它是“执行准备区”。账号绑定、验证、默认执行位和风险状态必须先确认，数字员工才会进入稳定执行。
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-background/75 px-3 py-1.5 text-xs text-muted-foreground">
                    <Cpu className="h-3.5 w-3.5 text-primary" />
                    当前平台
                    <span className="font-medium text-foreground">{selectedPlatformLabel}</span>
                  </span>
                  {selectedPlatformCatalog?.enterprise_url && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-3 py-1.5 text-xs text-muted-foreground">
                      <ExternalLink className="h-3.5 w-3.5"/>
                      <span className="max-w-[24rem] truncate">{selectedPlatformCatalog.enterprise_url}</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[24px] border border-border/70 bg-background/82 px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">主执行账号</p>
                  <p className="mt-2 text-base font-semibold text-foreground">{preparedAccount?.name || '待指定'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{preparedAccountStatus.description}</p>
                </div>
                <div className="rounded-[24px] border border-emerald-200/60 bg-emerald-50/70 px-4 py-3 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">已通过检查</p>
                  <p className="mt-2 font-mono text-2xl font-semibold text-emerald-800 dark:text-emerald-100">{resolvedPreparationCount}</p>
                  <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-200/80">登录态、账号与模板已确认</p>
                </div>
                <div className="rounded-[24px] border border-amber-200/70 bg-amber-50/75 px-4 py-3 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">待处理风险</p>
                  <p className="mt-2 font-mono text-2xl font-semibold text-amber-800 dark:text-amber-100">{blockingPreparationCount}</p>
                  <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-200/80">存在阻断项时，不建议直接执行</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <div className="space-y-5">
            <Card className="overflow-hidden border-primary/12 bg-[linear-gradient(165deg,hsl(var(--card)),hsl(var(--primary)/0.08)_50%,transparent_100%)]">
              <CardContent className="p-5 md:p-6">
                {accountsLoading ? (
                  <Skeleton className="h-[22rem] w-full rounded-[28px]"/>
                ) : preparedAccount ? (
                  <div className="space-y-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-xl">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">{selectedPlatformLabel}主执行账号</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <h4 className="text-2xl font-semibold tracking-tight text-foreground">{preparedAccount.name}</h4>
                          {preparationBadge(preparedAccountStatus.label, preparedAccountStatus.tone)}
                        </div>
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">{preparedAccountStatusHint}</p>
                      </div>

                      <div className="rounded-[24px] border border-border/70 bg-background/84 p-4 shadow-sm lg:w-[18rem]">
                        <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">当前平台主执行账号</Label>
                        <Select
                          value={selectedDefaultAccountId || preparedAccount.id}
                          onValueChange={(value) => {
                            updatePlatformConfig(selectedPlatform, {boundProfileId: value})
                            setSelectedAccountId(value)
                          }}
                          disabled={selectedPlatformAccounts.length === 0}
                        >
                          <SelectTrigger className="mt-3 h-11 bg-background/85" data-testid="default-account-select">
                            <SelectValue placeholder="选择默认执行账号"/>
                          </SelectTrigger>
                          <SelectContent>
                            {selectedPlatformAccounts.map((account) => (
                              <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                      <div className="rounded-[24px] border border-border/70 bg-background/84 p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">最近验证</p>
                            <p className="mt-2 text-sm font-medium text-foreground">
                              {formatSessionTime(preparedAccountVerifySession?.updated_at || preparedAccountVerifySession?.created_at)}
                            </p>
                            <p className="mt-1 text-xs leading-6 text-muted-foreground">
                              {verifySessionSummary(preparedAccountVerifySession)}
                            </p>
                          </div>
                          {preparedAccountVerifySession
                            ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9 shrink-0 gap-1.5 rounded-full px-4"
                                onClick={() => reopenActionSession(preparedAccountVerifySession, preparedAccount.id)}
                                data-testid="reopen-verify-dialog"
                              >
                                <Search className="h-3.5 w-3.5"/>查看验证结果
                              </Button>
                            )
                            : preparationBadge('暂无记录', 'idle')}
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-border/70 bg-background/84 p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">默认执行岗位</p>
                        <p className="mt-2 text-sm font-medium text-foreground">{selectedExecJob?.title || '尚未指定执行岗位'}</p>
                        <p className="mt-1 text-xs leading-6 text-muted-foreground">
                          {selectedExecJob ? '当前平台执行时会默认复用该岗位模板。' : '请先到执行页或岗位管理页指定岗位模板。'}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-full px-4" onClick={() => setActiveTab('execute')}>
                            <Play className="h-3.5 w-3.5"/>{selectedExecJob ? '调整执行配置' : '前往执行页设置'}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-9 gap-1.5 rounded-full px-4" onClick={() => setActiveTab('jobs')}>
                            <Cpu className="h-3.5 w-3.5"/>岗位管理
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-primary/12 bg-background/75 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                          登录名 {preparedAccount.accountName || preparedAccount.loginIdentifierMasked || '未填写'}
                        </span>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                          最近会话 {bindingStatus(preparedAccount.latestBindingSession?.status)}
                        </span>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                          浏览器会话 {preparedAccount.browserSessionKey ? '已生成' : '未生成'}
                        </span>
                      </div>
                      <p className="mt-3 text-xs leading-6 text-muted-foreground">
                        建议优先保持“可直接执行”状态。若最近运行出现登录失效，先做
                        <span className="px-1 font-medium text-foreground">重新验证</span>
                        ，仍失败再执行
                        <span className="px-1 font-medium text-foreground">重新绑定</span>。
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {renderAccountActionButtons(preparedAccount, 'selected')}
                      {preparedAccount.status === 'active' && selectedDefaultAccountId !== preparedAccount.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() => {
                            updatePlatformConfig(selectedPlatform, {boundProfileId: preparedAccount.id})
                            setSelectedAccountId(preparedAccount.id)
                          }}
                        >
                          <Check className="h-3.5 w-3.5"/>设为主执行账号
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-border/80 bg-background/60 px-6 py-12 text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border/70 bg-muted/40">
                      <UserPlus className="h-5 w-5 text-muted-foreground"/>
                    </div>
                    <p className="text-base font-medium text-foreground">当前平台还没有主执行账号</p>
                    <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                      先新增一个平台账号并完成绑定，验证通过后再把它设为主执行账号。
                    </p>
                    <Button size="sm" className="mt-5 gap-2" onClick={() => setAddAccountOpen(true)}>
                      <UserPlus className="h-4 w-4"/>新增平台账号
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.07),transparent_72%)] pb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">AI Outreach Brief</p>
                <CardTitle className="mt-2 text-base">AI 主动沟通策略</CardTitle>
                <CardDescription className="mt-1">这里保存执行前的沟通预案。人才探索工作流会优先复用这段话术。</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="rounded-[24px] border border-border/70 bg-background/82 p-4 shadow-sm">
                  <Label htmlFor="platform-config-custom-message" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    主动沟通话术
                  </Label>
                  <Textarea
                    id="platform-config-custom-message"
                    placeholder="例如：您好，我是机灵平台企业招聘负责人，目前在招聘区域运营经理岗位，想先确认您最近是否方便沟通。"
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    rows={6}
                    maxLength={500}
                    className="mt-3 min-h-[11rem] resize-none rounded-[20px] border-border/70 bg-background/90 text-sm leading-7"
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
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.07),transparent_72%)] pb-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">Preflight Review</p>
              <CardTitle className="mt-2 text-base">执行前检查</CardTitle>
              <CardDescription className="mt-1">风险必须先消灭，再让数字员工进入执行。这里展示的是当前平台的阻断项。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {preflightChecks.map((item) => (
                <div key={item.label} className="rounded-[24px] border border-border/70 bg-background/82 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                    </div>
                    {preparationBadge(item.summary, item.tone)}
                  </div>
                </div>
              ))}

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
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.15fr,1.15fr,1fr]">

        {/* Platform Catalog */}
        <Card className="overflow-hidden" data-testid="platform-catalog-panel">
          <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.07),transparent_72%)] pb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">Platform Directory</p>
            <CardTitle className="mt-2 text-base">平台目录</CardTitle>
            <CardDescription className="mt-1">6 个国内主流招聘平台，预置企业端入口。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
            {accountsLoading && catalog.length === 0 ? Array.from({length: 6}).map((_, index) => (
              <div key={index} className="rounded-xl border p-4">
                <Skeleton className="h-16 w-full"/>
              </div>
            )) : catalog.map((item) => {
              const count = accounts.filter((a) => a.platform === item.key).length
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
                    'relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                    isSelected
                      ? `border-transparent bg-gradient-to-br ${colors.gradient} ring-2 ${colors.ring} shadow-sm`
                      : 'border-border hover:border-border/80 hover:shadow-sm',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white', colors.bg)}>
                        {item.name.charAt(0)}
                      </div>
                      <p className="font-medium">{item.name}</p>
                    </div>
                    {isSelected && <Badge variant="outline" className="border-primary/20 bg-background/80 text-primary">当前查看</Badge>}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge className={cn('border-0 text-xs', count ? colors.badge : 'bg-muted text-muted-foreground')}>
                      {count ? `${count} 个账号` : '未添加账号'}
                    </Badge>
                    <Badge variant="outline" className={cn('text-xs', hasActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' : 'text-muted-foreground')}>
                      {hasActive ? '已有可用登录态' : '待绑定'}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                    <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-50"/>
                    <span className="line-clamp-1">{item.enterprise_url}</span>
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
                <CardDescription className="mt-1">同平台多账号并存，每个账号独立持久会话。</CardDescription>
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
                <p className="mt-1 text-xs text-muted-foreground/70">点击上方「新增平台账号」添加</p>
                <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => setAddAccountOpen(true)}>
                  <UserPlus className="h-3.5 w-3.5"/>添加账号
                </Button>
              </div>
            ) : selectedPlatformAccounts.map((account) => {
              const isSelected = selectedAccountId === account.id
              const isActive = account.status === 'active'
              const isDefaultAccount = platformConfigs[selectedPlatform]?.boundProfileId === account.id
              const latestVerifySession = getLatestVerifySession(account)
              const canReopenVerify = Boolean(latestVerifySession)
              const isBoundAccount = isBoundPlatformAccount(account)
              const canVerifyAccount = account.status === 'active'
              const verifyEntryLabel = verifySessionViewLabel(latestVerifySession)
              const verifyActionText = verifySessionActionLabel(latestVerifySession)
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
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" className="flex-1 text-left" onClick={() => setSelectedAccountId(account.id)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{account.name}</p>
                        {statusBadge(account.status)}
                        {isDefaultAccount && <Badge variant="outline" className="text-[10px]">默认执行</Badge>}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                          登录名 {account.accountName || account.loginIdentifierMasked || '未填写'}
                        </span>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                          最近会话 {bindingStatus(account.latestBindingSession?.status)}
                        </span>
                        {isDefaultAccount && (
                          <span className="rounded-full bg-primary/8 px-2.5 py-1 text-[11px] text-primary">
                            将作为当前平台默认执行账号
                          </span>
                        )}
                      </div>
                      {latestVerifySession && (
                        <>
                          <p className="mt-2 text-xs text-muted-foreground">
                            上次验证：{formatSessionTime(latestVerifySession.updated_at || latestVerifySession.created_at)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            验证结果：{trimInlineText(verifySessionSummary(latestVerifySession))}
                          </p>
                        </>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground/80">{accountStatusHint(account)}</p>
                      {account.lastError && <p className="mt-2 text-xs text-red-500">{account.lastError}</p>}
                    </button>

                    <div className="flex items-center gap-1.5">
                      {renderAccountActionButtons(account, 'row')}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" data-testid={`account-actions-${account.id}`}>
                            <MoreHorizontal className="h-4 w-4"/>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          {!isBoundAccount && (
                            <DropdownMenuItem onClick={() => openBindDialogForAccount(account.id)}>
                              <LogIn className="mr-2 h-4 w-4"/>{account.status === 'expired' ? '重新绑定' : '开始绑定'}
                            </DropdownMenuItem>
                          )}
                          {isBoundAccount && (
                            <>
                              {canReopenVerify && latestVerifySession && (
                                <DropdownMenuItem
                                  data-testid={`account-view-verify-${account.id}`}
                                  onClick={() => reopenActionSession(latestVerifySession, account.id)}
                                >
                                  <Search className="mr-2 h-4 w-4"/>{verifyEntryLabel}
                                </DropdownMenuItem>
                              )}
                              {canVerifyAccount && (
                                <DropdownMenuItem
                                  data-testid={`account-verify-${account.id}`}
                                  onClick={() => handleAction('verify', account.id)}
                                  disabled={actionPendingAccountId === account.id}
                                >
                                  <ShieldCheck className="mr-2 h-4 w-4"/>{verifyActionText}
                                </DropdownMenuItem>
                              )}
                              {isActive && (
                                <DropdownMenuItem
                                  data-testid={`account-set-default-${account.id}`}
                                  onClick={() => { updatePlatformConfig(selectedPlatform, {boundProfileId: account.id}); setSelectedAccountId(account.id) }}
                                >
                                  <Check className="mr-2 h-4 w-4"/>设为默认
                                </DropdownMenuItem>
                              )}
                              {(isActive || account.status === 'verifying') && (
                                <>
                                  <DropdownMenuSeparator/>
                                  <DropdownMenuItem
                                    data-testid={`account-unbind-${account.id}`}
                                    className="text-red-600 focus:text-red-600 dark:text-red-400"
                                    onClick={() => handleAction('unbind', account.id)}
                                    disabled={actionPendingAccountId === account.id}
                                  >
                                    <Unplug className="mr-2 h-4 w-4"/>解绑账号
                                  </DropdownMenuItem>
                                </>
                              )}
                            </>
                          )}
                          <DropdownMenuItem
                            data-testid={`account-delete-${account.id}`}
                            className="text-red-600 focus:text-red-600 dark:text-red-400"
                            onClick={async () => {
                              if (!confirm('确定要删除此账号吗？删除后不可恢复。')) return
                              try {
                                await deleteAccount(account.id)
                                await reloadPlatformAccounts()
                              } catch (e) {
                                setWorkflowError(e instanceof Error ? e.message : '删除账号失败')
                              }
                            }}
                            disabled={actionPendingAccountId === account.id}
                          >
                            <Trash2 className="mr-2 h-4 w-4"/>删除账号
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </CardContent>
        </Card>

        {/* Account Evidence Panel */}
        <Card className="overflow-hidden" data-testid="account-task-panel">
          <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.07),transparent_72%)] pb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">Session Evidence</p>
            <CardTitle className="mt-2 text-base">会话证据面板</CardTitle>
            <CardDescription className="mt-1">这里用于查看任一账号的验证证据、浏览器会话键与快捷操作，不再承担主配置入口。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">切换查看账号</Label>
              <Select
                value={selectedAccountId || platformConfigs[selectedPlatform]?.boundProfileId || ''}
                onValueChange={setSelectedAccountId}
                disabled={accountsLoading || selectedPlatformAccounts.length === 0}
              >
                <SelectTrigger className="h-11 bg-background/80"><SelectValue placeholder="选择要查看的账号"/></SelectTrigger>
                <SelectContent>{selectedPlatformAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {accountsLoading ? (
              <div className="rounded-xl border p-4">
                <Skeleton className="h-40 w-full"/>
              </div>
            ) : selectedAccount ? (
              <div
                className="overflow-hidden rounded-[28px] border border-primary/15 bg-[linear-gradient(160deg,hsl(var(--primary)/0.09),transparent_65%)] p-5 shadow-[0_28px_55px_-40px_hsl(var(--primary)/0.9)]"
                data-testid="selected-account-panel"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-xl">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">Selected Account</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold tracking-tight text-foreground">{selectedAccount.name}</p>
                        {statusBadge(selectedAccount.status)}
                        {platformConfigs[selectedPlatform]?.boundProfileId === selectedAccount.id && (
                          <Badge variant="outline" className="border-primary/15 bg-primary/[0.06] text-[10px] text-primary">
                            默认执行
                          </Badge>
                        )}
                        <Badge variant="outline" className="border-primary/15 bg-background/80 text-primary">
                          {selectedAccountIsBound ? '可直接复用' : '需要先绑定'}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{selectedAccountStatusHint}</p>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-background/82 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">平台执行位</p>
                      <p className="mt-2 text-sm font-medium text-foreground">{selectedPlatformLabel}</p>
                      <p className="mt-1 text-xs text-muted-foreground">此账号可作为平台工作流的备选登录入口。</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-primary/12 bg-background/70 px-4 py-3">
                    <p className="text-xs leading-6 text-muted-foreground">
                      验证建议：优先保持“可直接复用”状态。若最近执行出现登录失效，先做
                      <span className="px-1 font-medium text-foreground">重新验证</span>
                      ，仍失败再执行
                      <span className="px-1 font-medium text-foreground">重新绑定</span>。
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border/70 bg-background/82 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">登录信息</p>
                      <p className="mt-2 text-sm font-medium text-foreground">{selectedAccount.accountName || selectedAccount.loginIdentifierMasked || '未填写登录名'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">最近会话：{bindingStatus(selectedAccount.latestBindingSession?.status)}</p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/82 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">最近验证</p>
                      <p className="mt-2 text-sm font-medium text-foreground">{formatSessionTime(selectedLatestVerifySession?.updated_at || selectedLatestVerifySession?.created_at)}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground line-clamp-2">{verifySessionSummary(selectedLatestVerifySession)}</p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/82 p-4 sm:col-span-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">浏览器会话键</p>
                      <p className="mt-2 break-all font-mono text-xs text-foreground">{selectedAccount.browserSessionKey || '未生成'}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {renderAccountActionButtons(selectedAccount, 'selected')}
                  </div>

                  {selectedAccount.latestBindingSession?.latest_screenshot_url && (
                    <button
                      type="button"
                      data-testid="latest-account-screenshot"
                      className="group/img block w-full overflow-hidden rounded-[24px] border border-border/70 bg-background/80 text-left shadow-sm transition-shadow hover:shadow-md"
                      onClick={() => setLightboxSrc(selectedAccount.latestBindingSession?.latest_screenshot_url || null)}
                    >
                      <div className="relative">
                        <img
                          src={selectedAccount.latestBindingSession.latest_screenshot_url}
                          alt="最近任务截图"
                          className="h-40 w-full object-cover object-top transition-transform group-hover/img:scale-[1.02]"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/img:bg-black/10">
                          <Search className="h-6 w-6 text-white opacity-0 transition-opacity group-hover/img:opacity-80"/>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">最近一次验证截图</p>
                          <p className="mt-1 text-xs text-muted-foreground">用于快速确认页面是否仍处于已登录状态。</p>
                        </div>
                        <Badge variant="outline" className="border-border/70 bg-background/80 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          点击放大
                        </Badge>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-border/80 bg-background/55 p-8 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-border/70 bg-muted/50">
                  <Zap className="h-5 w-5 text-muted-foreground"/>
                </div>
                <p className="text-sm font-medium text-foreground">请选择一个账号</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">从中间的账号列表选择一个账号，这里会显示它的验证详情与快捷操作。</p>
              </div>
            )}
          </CardContent>
        </Card>
        </div>
        </TabsContent>

        <TabsContent value="execute" className="space-y-6 mt-0" data-testid="execute-tab">
          {/* Multi-platform Selection */}
          <Card data-testid="execute-platform-selection">
            <CardHeader className="bg-gradient-to-r from-primary/[0.04] to-transparent pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">多平台选择</CardTitle>
                  <CardDescription className="mt-1">为每个平台配置账号和岗位，点击卡片选中参与执行。</CardDescription>
                </div>
                <div className="flex items-center gap-3 mt-1 shrink-0">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    筛选阈值 <span className="ml-1 text-foreground font-bold">{matchThreshold}分</span>
                  </Label>
                  <div className="w-28">
                    <Slider value={[matchThreshold]} onValueChange={([value]) => setMatchThreshold(value)} min={0} max={100} step={5} disabled={!!activeExecution}/>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {accountsLoading && catalog.length === 0 ? Array.from({length: 6}).map((_, index) => (
                  <div key={index} className="rounded-xl border p-4">
                    <Skeleton className="h-40 w-full"/>
                  </div>
                )) : null}
                {catalog.map((item) => {
                  const platformAccounts = accounts.filter((a) => a.platform === item.key && a.status === 'active')
                  const config = platformExecConfigs[item.key] || {accountId: '', jobId: ''}
                  const canSelect = !!(config.accountId && config.jobId)
                  const isSelected = selectedPlatforms.includes(item.key)
                  const colors = pc(item.key)
                  return (
                    <motion.div
                      key={item.key}
                      data-testid={`execute-platform-card-${item.key}`}
                      whileHover={canSelect && !activeExecution ? {scale: 1.01} : undefined}
                      whileTap={canSelect && !activeExecution ? {scale: 0.99} : undefined}
                      onClick={() => canSelect && !activeExecution && togglePlatformSelection(item.key)}
                      className={cn(
                        'relative overflow-hidden rounded-xl border p-4 transition-all duration-200',
                        canSelect && !activeExecution ? 'cursor-pointer' : 'cursor-default',
                        isSelected && canSelect
                          ? `border-transparent bg-gradient-to-br ${colors.gradient} ring-2 ${colors.ring} shadow-md`
                          : canSelect
                            ? 'border-border hover:shadow-sm hover:border-border/60'
                            : 'border-dashed opacity-60',
                      )}
                    >
                      {/* Left accent bar */}
                      <div className={cn('absolute left-0 top-0 h-full w-1 rounded-l-xl transition-opacity', colors.bg, isSelected ? 'opacity-100' : 'opacity-25')}/>

                      {/* Selection check */}
                      <AnimatePresence>
                        {isSelected && (
                          <motion.div
                            initial={{scale: 0, opacity: 0}}
                            animate={{scale: 1, opacity: 1}}
                            exit={{scale: 0, opacity: 0}}
                            className="absolute right-3 top-3"
                          >
                            <div className={cn('flex h-5 w-5 items-center justify-center rounded-full', colors.bg)}>
                              <Check className="h-3 w-3 text-white"/>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="pl-3 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white shrink-0', colors.bg)}>
                            {item.name.charAt(0)}
                          </div>
                          <p className="font-medium text-sm">{item.name}</p>
                        </div>

                        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">执行账号</Label>
                            <Select
                              value={config.accountId || ''}
                              onValueChange={(value) => setPlatformExecConfigs((prev) => ({...prev, [item.key]: {...(prev[item.key] || {}), accountId: value}}))}
                              disabled={!!activeExecution || accountsLoading}
                            >
                              <SelectTrigger className="h-7 text-xs" data-testid={`execute-account-select-${item.key}`}><SelectValue placeholder="选择已绑定账号"/></SelectTrigger>
                              <SelectContent>
                                {accountsLoading
                                  ? <SelectItem value="_loading_accounts" disabled>账号加载中...</SelectItem>
                                  : platformAccounts.length === 0
                                  ? <SelectItem value="_none" disabled>暂无已绑定账号</SelectItem>
                                  : platformAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">招聘岗位</Label>
                            <Select
                              value={config.jobId || ''}
                              onValueChange={(value) => setPlatformExecConfigs((prev) => ({...prev, [item.key]: {...(prev[item.key] || {}), jobId: value}}))}
                              disabled={!!activeExecution || jobsLoading}
                            >
                              <SelectTrigger className="h-7 text-xs" data-testid={`execute-job-select-${item.key}`}><SelectValue placeholder="选择岗位"/></SelectTrigger>
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

                        {!canSelect && (
                          <p className="text-xs text-muted-foreground/60 italic">配置账号和岗位后点击选中</p>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Workflow Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="workflow-cards">
            {workflowCards.map((workflow) => {
              const isThisActive = !!activeExecution && activeExecution.workflowId === workflow.id
              const isOtherActive = !!activeExecution && activeExecution.workflowId !== workflow.id
              const theme = WORKFLOW_THEMES[workflow.id] || WORKFLOW_THEMES.publish_job
              return (
                <motion.div key={workflow.id} whileHover={!isOtherActive ? {y: -2} : undefined} transition={{duration: 0.2}}>
                  <Card
                    data-testid={`workflow-card-${workflow.id}`}
                    className={cn(
                    'overflow-hidden transition-all duration-300',
                    isOtherActive && 'opacity-40',
                    isThisActive && 'ring-2 ring-primary shadow-lg shadow-primary/10',
                  )}>
                    <CardHeader className={cn('bg-gradient-to-r', theme.gradient)}>
                      <div className="flex items-center justify-between gap-2">
                        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', theme.iconBg)}>
                          <workflow.icon className="h-5 w-5 text-primary"/>
                        </div>
                        <div className="flex items-center gap-2">
                          {workflow.multiPlatform && (
                            <Badge variant="outline" className="gap-1 text-xs">
                              <Layers className="h-3 w-3"/>多平台
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[10px]">{workflow.executionMode === 'auto_submit' ? '自动提交' : workflow.executionMode}</Badge>
                        </div>
                      </div>
                      <CardTitle className="text-base">{workflow.title}</CardTitle>
                      <CardDescription className="text-xs leading-relaxed">{workflow.desc}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-3">
                      {isThisActive && (
                        <div className="mb-3 flex items-center gap-2">
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"/>
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"/>
                          </span>
                          <span className="text-xs font-medium text-primary">执行中...</span>
                        </div>
                      )}
                      <p className="mb-3 text-[11px] text-muted-foreground">截图策略：{workflow.screenshotMode === 'direct_url' ? '直接截图链接' : workflow.screenshotMode}</p>
                      {workflow.id === 'talent_explore' && (
                        <div className="mb-3 grid gap-3 sm:grid-cols-2 border-t pt-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="custom-message" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              主动沟通话术
                            </Label>
                            <Textarea
                              id="custom-message"
                              placeholder={`（留空使用默认）例：您好！我是XX公司的招聘负责人，正在招聘前台/服务员，薪资X-XK，想了解一下您是否有意向？`}
                              value={customMessage}
                              onChange={(e) => setCustomMessage(e.target.value)}
                              disabled={!!activeExecution}
                              rows={3}
                              maxLength={500}
                              className="text-xs resize-none"
                            />
                            <p className={cn('text-[11px]', customMessage.length >= 500 ? 'text-destructive font-medium' : customMessage.length >= 450 ? 'text-orange-500' : 'text-muted-foreground')}>{customMessage.length}/500 字符</p>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              每次发送上限 <span className="ml-1 text-foreground font-bold">{messageSendLimit} 条</span>
                            </Label>
                            <div className="flex items-center gap-2">
                              <Slider
                                value={[messageSendLimit]}
                                onValueChange={([v]) => setMessageSendLimit(v)}
                                min={1}
                                max={50}
                                step={1}
                                disabled={!!activeExecution}
                                className="flex-1"
                              />
                              <Input
                                type="number"
                                min={1}
                                max={50}
                                value={messageSendLimit}
                                onChange={(e) => {
                                  const v = Math.max(1, Math.min(50, Number(e.target.value) || 10))
                                  setMessageSendLimit(v)
                                }}
                                disabled={!!activeExecution}
                                className="w-16 text-xs text-center"
                              />
                            </div>
                            <p className="text-[11px] text-muted-foreground">每次运行最多向候选人发送消息数（1-50），超出立即停止。</p>
                          </div>
                        </div>
                      )}
                      <Button
                        data-testid={`workflow-action-${workflow.id}`}
                        className={cn('w-full gap-2', !isThisActive && 'shadow-sm')}
                        variant={isThisActive ? 'destructive' : 'default'}
                        onClick={() => isThisActive ? cancelWorkflow() : handleStartWorkflow(workflow.id)}
                        disabled={(!!activeExecution && !isThisActive) || !backendReady}
                      >
                        {isThisActive ? <><Square className="h-4 w-4"/>停止执行</> : <><Play className="h-4 w-4"/>开始执行</>}
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </div>

          {/* Execution Monitor */}
          {displayExec && (
            <Card className="overflow-hidden border-primary/12 bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--card)))]" data-testid="execution-monitor">
              <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.12),transparent_72%)] pb-5">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">Execution Monitor</p>
                    <CardTitle className="mt-2 text-base">{displayExec.workflowName || '执行监控'}</CardTitle>
                    <CardDescription className="mt-2 text-sm leading-6">
                      {displayExec.error || '实时监控当前执行步骤、截图节点与 AI 完整输出，便于定位失败点和人工接管。'}
                    </CardDescription>
                    <p className="mt-3 text-xs text-muted-foreground">当前焦点步骤：{runningStepLabel}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border/70 bg-background/82 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">完成率</p>
                      <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{progressPercent}%</p>
                      <p className="mt-1 text-xs text-muted-foreground">{completedStepCount}/{Math.max(displayExec.totalSteps, 1)} 步骤完成</p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/82 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">截图节点</p>
                      <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{displayExec.actionNodes.length}</p>
                      <p className="mt-1 text-xs text-muted-foreground">用于核验执行过程的视觉证据</p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/82 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">状态</p>
                      <div className="mt-2">
                        <Badge variant="outline" className="gap-1.5 border-primary/15 bg-primary/[0.06] text-primary">
                          {activeExecution ? <><Loader2 className="h-3 w-3 animate-spin" />执行中</> : '已完成'}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{displayExec.accumulatedText ? '已收到 AI 输出流' : '等待输出返回'}</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 pt-5">
                {executionAuthGuide && (
                  <div className="flex flex-col gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/85 p-4 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>
                      <div className="space-y-1">
                        <p className="font-medium">{executionAuthGuide.title}</p>
                        <p className="text-xs leading-5 text-amber-800/90 dark:text-amber-200/90">{executionAuthGuide.description}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="h-8 gap-1.5" onClick={() => setActiveTab('platform-config')}>
                        <LinkIcon className="h-3.5 w-3.5"/>前往平台和账号配置
                      </Button>
                      <span className="flex items-center text-[11px] text-amber-800/80 dark:text-amber-200/80">
                        建议顺序：重新验证 → 重新绑定 → 回到本页重试
                      </span>
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
                        {displayExec.steps.map((step, idx) => {
                          const isLast = idx === displayExec.steps.length - 1
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
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">关键截图会按执行顺序追加，作为人工核验与回放依据。</p>
                      {displayExec.actionNodes.length === 0 ? (
                        <div className="mt-4 flex h-52 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 text-muted-foreground">
                          <Camera className="mb-2 h-8 w-8 opacity-20"/>
                          <p className="text-xs">等待截图...</p>
                        </div>
                      ) : (
                        <div className="mt-4 max-h-[25rem] space-y-3 overflow-y-auto pr-1 scrollbar-thin">
                          {displayExec.actionNodes.map((node) => (
                            <ExecutionScreenshotCard key={node.id} node={node} onPreview={setLightboxSrc}/>
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
                        {displayExec.accumulatedText && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
                            onClick={() => copyText(displayExec.accumulatedText || '')}
                          >
                            {copiedText ? <Check className="h-3 w-3 text-emerald-500"/> : <ClipboardCopy className="h-3 w-3"/>}
                            {copiedText ? '已复制' : '复制'}
                          </Button>
                        )}
                      </div>
                      <div className="mt-4 h-[25rem] overflow-y-auto rounded-[20px] bg-zinc-950 p-4 font-mono text-xs text-zinc-100 shadow-inner scrollbar-thin">
                        {displayExec.accumulatedText ? (
                          <>
                            <pre className="whitespace-pre-wrap break-words leading-relaxed">{displayExec.accumulatedText}</pre>
                            <div ref={textEndRef}/>
                          </>
                        ) : (
                          <p className="flex items-center gap-2 text-zinc-500">
                            <Loader2 className="h-3 w-3 animate-spin"/>等待 AI 输出...
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <TaskMonitorPanel/>
        </TabsContent>

        <TabsContent value="jobs" className="mt-0"><JobManagementPanel/></TabsContent>
        <TabsContent value="candidates" className="mt-0"><Candidates embedded/></TabsContent>
      </Tabs>

      {/* ── Lightbox ── */}
      <AnimatePresence>
        {lightboxSrc && (
          <motion.div
            key="lightbox"
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
            onClick={() => setLightboxSrc(null)}
          >
            <Button variant="ghost" size="icon" className="absolute right-4 top-4 text-white hover:bg-white/10" onClick={() => setLightboxSrc(null)}>
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
      <AddProfileDialog open={addAccountOpen} onOpenChange={setAddAccountOpen} onCreated={reloadPlatformAccounts}/>
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
