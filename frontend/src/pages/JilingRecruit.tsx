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
import {Label} from '@/components/ui/label'
import {Progress} from '@/components/ui/progress'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Skeleton} from '@/components/ui/skeleton'
import {Slider} from '@/components/ui/slider'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import AddProfileDialog from '@/components/settings/AddProfileDialog'
import PlatformLoginDialog from '@/components/settings/PlatformLoginDialog'
import TaskMonitorPanel from '@/components/dashboard/TaskMonitorPanel'
import {useAuth} from '@/contexts/AuthContext'
import {usePlatformAccounts} from '@/hooks/usePlatformAccounts'
import {PLATFORMS} from '@/lib/constants'
import {supabase} from '@/lib/supabase'
import {cn} from '@/lib/utils'
import {JobManagementPanel} from '@/pages/Jobs'
import Candidates from '@/pages/Candidates'
import {getWorkflowTemplates, testBackendConnection, validateWorkflowTemplate} from '@/services/workflowService'
import type {WorkflowId, WorkflowTemplate} from '@/services/workflowService'
import {useSettingsStore} from '@/stores/useSettingsStore'
import {useWorkflowStore} from '@/stores/useWorkflowStore'
import type {Job} from '@/types/database'

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

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500',
  verifying: 'bg-amber-500',
  expired: 'bg-red-500',
  needsLogin: 'bg-zinc-400',
}

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
  const [addAccountOpen, setAddAccountOpen] = useState(false)
  const [bindDialogOpen, setBindDialogOpen] = useState(false)
  const [bindAccountId, setBindAccountId] = useState<string | null>(null)
  const [actionPendingAccountId, setActionPendingAccountId] = useState<string | null>(null)
  const [workflowError, setWorkflowError] = useState<string | null>(null)
  const [workflowTemplates, setWorkflowTemplates] = useState<WorkflowTemplate[]>([])
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [copiedText, setCopiedText] = useState(false)
  const [activeTab, setActiveTab] = useState('execute')

  const textEndRef = useRef<HTMLDivElement>(null)
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
  const selectedPlatformAccounts = useMemo(() => accounts.filter((item) => item.platform === selectedPlatform), [accounts, selectedPlatform])
  const selectedAccount = useMemo(() => selectedPlatformAccounts.find((item) => item.id === selectedAccountId), [selectedAccountId, selectedPlatformAccounts])
  const progressPercent = displayExec ? Math.round((displayExec.steps.filter((step) => step.status === 'done').length / Math.max(displayExec.totalSteps, 1)) * 100) : 0

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
    if (!selectedPlatforms.length && catalog.length) setSelectedPlatforms(catalog.map((item) => item.key))
  }, [catalog, selectedPlatforms.length])

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

    if (selectedPlatforms.length === 0) {
      setWorkflowError('请先选中至少一个平台卡片，并为其配置账号和岗位。')
      return
    }

    const platformAccountIds: Record<string, string> = {}
    for (const platform of selectedPlatforms) {
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

    const firstPlatform = selectedPlatforms[0]
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
      platforms: selectedPlatforms,
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
    }

    const validation = await validateWorkflowTemplate(workflowId, workflowPayload)
    if (!validation.valid) {
      setWorkflowError(validation.errors[0] || '当前工作流配置未通过校验，请先完成配置。')
      return
    }

    await startWorkflow(workflowPayload)
  }, [accounts, matchThreshold, platformConfigs, platformExecConfigs, safeCompanyProfile, selectedPlatforms, startWorkflow, user])

  const handleAction = async (type: 'verify' | 'unbind', accountId: string) => {
    setActionPendingAccountId(accountId)
    setWorkflowError(null)
    setBindAccountId(accountId)
    setBindDialogOpen(true)
    try {
      if (type === 'verify') await startVerify(accountId)
      else await startUnbind(accountId)
    } catch (error) {
      setBindDialogOpen(false)
      setWorkflowError(error instanceof Error ? error.message : `${type === 'verify' ? '验证' : '解绑'}失败`)
    } finally {
      setActionPendingAccountId(null)
    }
  }

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(true)
      setTimeout(() => setCopiedText(false), 2000)
    })
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
        <TabsContent value="platform-config" className="space-y-0 mt-0" data-testid="platform-config-tab">
        <div className="grid gap-5 xl:grid-cols-[1.15fr,1.15fr,1fr]">

        {/* Platform Catalog */}
        <Card className="overflow-hidden" data-testid="platform-catalog-panel">
          <CardHeader className="bg-gradient-to-r from-primary/[0.04] to-transparent">
            <CardTitle className="text-base">平台目录</CardTitle>
            <CardDescription>6 个国内主流招聘平台，预置企业端入口。</CardDescription>
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
                  className={cn(
                    'relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200',
                    isSelected
                      ? `border-transparent bg-gradient-to-br ${colors.gradient} ring-2 ${colors.ring} shadow-sm`
                      : 'border-border hover:border-border/80 hover:shadow-sm',
                  )}
                >
                  {/* Left accent bar */}
                  <div className={cn('absolute left-0 top-0 h-full w-1 rounded-l-xl transition-opacity', colors.bg, isSelected ? 'opacity-100' : 'opacity-0')}/>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white', colors.bg)}>
                        {item.name.charAt(0)}
                      </div>
                      <p className="font-medium">{item.name}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {hasActive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/>}
                      <Badge className={cn('border-0 text-xs', count ? colors.badge : 'bg-muted text-muted-foreground')}>{count}</Badge>
                    </div>
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
          <CardHeader className="bg-gradient-to-r from-primary/[0.04] to-transparent">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{PLATFORMS[selectedPlatform as keyof typeof PLATFORMS]?.name || '平台'} 账号列表</CardTitle>
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
              return (
                <motion.div
                  key={account.id}
                  layout
                  initial={{opacity: 0, y: 8}}
                  animate={{opacity: 1, y: 0}}
                  data-testid={`account-row-${account.id}`}
                  className={cn(
                    'group relative overflow-hidden rounded-xl border p-4 transition-all duration-200',
                    isSelected ? 'border-primary/30 bg-primary/[0.03] shadow-sm' : 'border-border hover:shadow-sm hover:border-border/80',
                  )}
                >
                  {/* Status color bar */}
                  <div className={cn('absolute left-0 top-0 h-full w-1 rounded-l-xl', STATUS_COLORS[account.status] || 'bg-zinc-300 dark:bg-zinc-600')}/>

                  <div className="flex items-start justify-between gap-3">
                    <button type="button" className="flex-1 text-left pl-2" onClick={() => setSelectedAccountId(account.id)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{account.name}</p>
                        {statusBadge(account.status)}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        <span className="text-muted-foreground/60">登录名</span> {account.accountName || account.loginIdentifierMasked || '未填写'}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="text-muted-foreground/60">会话</span> {bindingStatus(account.latestBindingSession?.status)}
                      </p>
                      {account.lastError && <p className="mt-2 text-xs text-red-500">{account.lastError}</p>}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="default"
                        size="sm"
                        className="h-7 gap-1.5 px-2.5 text-xs shadow-sm"
                        onClick={() => { setBindAccountId(account.id); setBindDialogOpen(true) }}
                      >
                        <LogIn className="h-3 w-3"/>绑定
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" data-testid={`account-actions-${account.id}`}>
                            <MoreHorizontal className="h-4 w-4"/>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem
                            data-testid={`account-verify-${account.id}`}
                            onClick={() => handleAction('verify', account.id)}
                            disabled={actionPendingAccountId === account.id}
                          >
                            <ShieldCheck className="mr-2 h-4 w-4"/>验证登录
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            data-testid={`account-set-default-${account.id}`}
                            onClick={() => { updatePlatformConfig(selectedPlatform, {boundProfileId: account.id}); setSelectedAccountId(account.id) }}
                          >
                            <Check className="mr-2 h-4 w-4"/>设为默认
                          </DropdownMenuItem>
                          <DropdownMenuSeparator/>
                          <DropdownMenuItem
                            data-testid={`account-unbind-${account.id}`}
                            className="text-red-600 focus:text-red-600 dark:text-red-400"
                            onClick={() => handleAction('unbind', account.id)}
                            disabled={actionPendingAccountId === account.id}
                          >
                            <Unplug className="mr-2 h-4 w-4"/>解绑账号
                          </DropdownMenuItem>
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

        {/* Account Task Panel */}
        <Card className="overflow-hidden" data-testid="account-task-panel">
          <CardHeader className="bg-gradient-to-r from-primary/[0.04] to-transparent">
            <CardTitle className="text-base">账号任务面板</CardTitle>
            <CardDescription>默认执行账号、绑定/验证/解绑入口。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">当前平台默认执行账号</Label>
              <Select
                value={platformConfigs[selectedPlatform]?.boundProfileId || selectedAccountId || ''}
                onValueChange={(value) => { updatePlatformConfig(selectedPlatform, {boundProfileId: value}); setSelectedAccountId(value) }}
                disabled={accountsLoading || selectedPlatformAccounts.length === 0}
              >
                <SelectTrigger data-testid="default-account-select"><SelectValue placeholder="选择默认执行账号"/></SelectTrigger>
                <SelectContent>{selectedPlatformAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {accountsLoading ? (
              <div className="rounded-xl border p-4">
                <Skeleton className="h-40 w-full"/>
              </div>
            ) : selectedAccount ? (
              <div className="rounded-xl border bg-gradient-to-br from-card to-muted/20 p-4" data-testid="selected-account-panel">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{selectedAccount.name}</p>
                  {statusBadge(selectedAccount.status)}
                </div>
                <div className="mt-3 space-y-1">
                  <p className="text-xs text-muted-foreground">最近会话：{bindingStatus(selectedAccount.latestBindingSession?.status)}</p>
                  <p className="text-xs text-muted-foreground">会话键：<span className="font-mono text-[10px]">{selectedAccount.browserSessionKey || '未生成'}</span></p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" className="gap-2 shadow-sm" onClick={() => { setBindAccountId(selectedAccount.id); setBindDialogOpen(true) }} data-testid="open-bind-dialog">
                    <LogIn className="h-3.5 w-3.5"/>开始绑定
                  </Button>
                  <Button size="sm" variant="outline" className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950" onClick={() => handleAction('verify', selectedAccount.id)} data-testid="verify-account">
                    <ShieldCheck className="h-3.5 w-3.5"/>验证登录
                  </Button>
                  <Button size="sm" variant="outline" className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950" onClick={() => handleAction('unbind', selectedAccount.id)} data-testid="unbind-account">
                    <Unplug className="h-3.5 w-3.5"/>解绑账号
                  </Button>
                </div>

                {selectedAccount.latestBindingSession?.latest_screenshot_url && (
                  <button
                    type="button"
                    data-testid="latest-account-screenshot"
                    className="group/img mt-4 block w-full overflow-hidden rounded-lg border shadow-sm transition-shadow hover:shadow-md"
                    onClick={() => setLightboxSrc(selectedAccount.latestBindingSession?.latest_screenshot_url || null)}
                  >
                    <div className="relative">
                      <img src={selectedAccount.latestBindingSession.latest_screenshot_url} alt="最近任务截图" className="h-36 w-full object-cover object-top transition-transform group-hover/img:scale-[1.02]"/>
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/img:bg-black/10">
                        <Search className="h-6 w-6 text-white opacity-0 transition-opacity group-hover/img:opacity-80"/>
                      </div>
                    </div>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Zap className="h-5 w-5 text-muted-foreground"/>
                </div>
                <p className="text-sm text-muted-foreground">请选择一个账号</p>
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
            <Card className="overflow-hidden" data-testid="execution-monitor">
              <CardHeader className="bg-gradient-to-r from-primary/[0.08] via-primary/[0.04] to-transparent">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">{displayExec.workflowName || '执行监控'}</CardTitle>
                    <CardDescription>{displayExec.error || '实时监控当前执行步骤、截图与完整输出。'}</CardDescription>
                  </div>
                  <Badge variant="outline" className="gap-1.5">
                    {activeExecution ? <><Loader2 className="h-3 w-3 animate-spin"/>执行中</> : '已完成'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="grid gap-6 lg:grid-cols-3">
                  {/* Progress timeline */}
                  <div className="space-y-4" data-testid="execution-steps">
                    <div className="flex items-center justify-between">
                      <Progress value={progressPercent} className="h-2 flex-1"/>
                      <span className="ml-3 text-lg font-bold tabular-nums">{progressPercent}%</span>
                    </div>
                    <div className="relative space-y-0">
                      {displayExec.steps.map((step, idx) => {
                        const isLast = idx === displayExec.steps.length - 1
                        return (
                          <div key={step.id} className="relative flex items-start gap-3 pb-4">
                            {/* Vertical line */}
                            {!isLast && (
                              <div className={cn(
                                'absolute left-[9px] top-5 h-[calc(100%-8px)] w-px',
                                step.status === 'done' ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-border',
                              )}/>
                            )}
                            {/* Node */}
                            <div className="relative z-10 mt-0.5 flex-shrink-0">
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
                            <span className={cn('text-sm', step.status === 'running' ? 'font-medium text-primary' : step.status === 'done' ? 'text-foreground' : 'text-muted-foreground')}>{step.nameZh}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Screenshots */}
                  <div className="space-y-3" data-testid="execution-screenshots">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">截图节点</p>
                    {displayExec.actionNodes.length === 0 ? (
                      <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 text-muted-foreground">
                        <Camera className="mb-2 h-8 w-8 opacity-20"/>
                        <p className="text-xs">等待截图...</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
                        {displayExec.actionNodes.map((node) => (
                          <button key={node.id} type="button" className="group/shot w-full overflow-hidden rounded-lg border shadow-sm transition-shadow hover:shadow-md text-left" onClick={() => setLightboxSrc(node.screenshot || node.contentUrl || null)}>
                            {node.screenshot ? (
                              <div className="relative">
                                <img src={node.screenshot} alt={node.action} className="h-28 w-full object-cover object-top"/>
                                {node.artifactId && (
                                  <div className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                                    {node.persisted ? '已落库' : '实时'}
                                  </div>
                                )}
                                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/shot:bg-black/10">
                                  <Search className="h-5 w-5 text-white opacity-0 transition-opacity group-hover/shot:opacity-80"/>
                                </div>
                              </div>
                            ) : (
                              <div className="p-3 text-xs text-muted-foreground">{node.action}</div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* AI Output */}
                  <div className="space-y-3" data-testid="execution-output">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI 完整输出</p>
                      {displayExec.accumulatedText && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 gap-1.5 px-2 text-xs text-muted-foreground"
                          onClick={() => copyText(displayExec.accumulatedText || '')}
                        >
                          {copiedText ? <Check className="h-3 w-3 text-emerald-500"/> : <ClipboardCopy className="h-3 w-3"/>}
                          {copiedText ? '已复制' : '复制'}
                        </Button>
                      )}
                    </div>
                    <div className="h-64 overflow-y-auto rounded-xl bg-zinc-950 p-4 font-mono text-xs text-zinc-100 shadow-inner scrollbar-thin">
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
    </div>
  )
}
