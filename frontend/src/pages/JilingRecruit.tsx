import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {AlertTriangle, Circle, Cpu, Link as LinkIcon, Loader2, LogIn, Search, ShieldCheck, Unplug, UserPlus, X} from 'lucide-react'
import {AnimatePresence, motion} from 'motion/react'
import {Button} from '@/components/ui/button'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import AddProfileDialog from '@/components/settings/AddProfileDialog'
import PlatformActionDialog from '@/components/settings/PlatformActionDialog'
import PlatformLoginDialog from '@/components/settings/PlatformLoginDialog'
import {Badge} from '@/components/ui/badge'
import PlatformConfigTab from '@/components/jiling/PlatformConfigTab'
import ExecutionTab, {type ExecutionTabHandlers} from '@/components/jiling/ExecutionTab'
import {usePlatformConfigModel, type RecruitPlatformCatalogItem} from '@/components/jiling/usePlatformConfigModel'
import {useExecutionComposerModel} from '@/components/jiling/useExecutionComposerModel'
import {WORKFLOW_THEMES} from '@/components/jiling/jilingRecruitShared'
import {useAuth} from '@/contexts/AuthContext'
import {useI18n} from '@/contexts/I18nContext'
import {usePlatformAccounts} from '@/hooks/usePlatformAccounts'
import {PLATFORMS} from '@/lib/constants'
import {supabase} from '@/lib/supabase'
import {cn} from '@/lib/utils'
import Candidates from '@/pages/Candidates'
import {JobManagementPanel} from '@/pages/Jobs'
import type {PlatformAccountApiRow} from '@/services/platformAccountService'
import {getWorkflowTemplates, testBackendConnection, validateWorkflowTemplate, type WorkflowId, type WorkflowTemplate} from '@/services/workflowService'
import {useSettingsStore} from '@/stores/useSettingsStore'
import {useWorkflowStore} from '@/stores/useWorkflowStore'
import type {PlatformBindingSession} from '@/types/openclaw'
import {ExecutionDetailDialog, getExecutionAuthGuide} from '@/components/jiling/ExecutionDetailDialog'
import {
  loadRecruitJobOptions,
  createExecutionGroup,
  getLatestVerifySession,
  isBoundPlatformAccount,
  verifySessionActionLabel,
  verifySessionViewLabel,
  type ExecutionGroup,
  type ExecutionMode,
  type PlatformConfigSection,
  type RecruitJobDetail,
  type RecruitJobOption,
  type ScheduleFrequency,
} from '@/components/jiling/jilingRecruitHelpers'

export default function JilingRecruit() {
  const {t} = useI18n()
  const {user} = useAuth()
  const {
    catalog,
    accounts,
    loading: accountsLoading,
    startVerify,
    startUnbind,
    deleteAccount,
    load: reloadPlatformAccounts,
  } = usePlatformAccounts()
  const {platformConfigs, companyProfile, updatePlatformConfig} = useSettingsStore()
  const {
    executions,
    executionOrder,
    backendReady,
    startWorkflow,
    cancelWorkflow,
    setBackendReady,
    restoreExecution,
  } = useWorkflowStore()
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

  const platformCatalog = catalog as RecruitPlatformCatalogItem[]
  const platformModel = usePlatformConfigModel({
    catalog: platformCatalog,
    accounts,
    accountsLoading,
    platformConfigs,
    selectedPlatform,
    selectedAccountId,
    platformExecConfigs,
    jobs,
    customMessage,
    autoVerifyEnabled,
  })
  const executionModel = useExecutionComposerModel({
    t,
    workflowTemplates,
    catalog: platformCatalog,
    accounts,
    accountsLoading,
    jobs,
    jobsLoading,
    executions,
    executionOrder,
    selectedExecutionId,
    selectedWorkflowId,
    executionGroups,
    launchingWorkflowIds,
    selectedPlatform,
    backendReady,
    executionMode,
    platformConfigs,
    platformExecConfigs,
  })

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
        if (!cancelled) setBackendReady(false)
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
        if (!cancelled) setWorkflowTemplates(items)
      })
      .catch((error) => console.error('加载工作流模板失败', error))
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
        if (!cancelled) setJobs(nextJobs)
      } catch (error) {
        console.error('加载岗位列表失败', error)
        if (!cancelled) setJobs([])
      } finally {
        if (!cancelled) setJobsLoading(false)
      }
    }
    void loadJobOptions()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedPlatform && platformCatalog[0]) setSelectedPlatform(platformCatalog[0].key)
  }, [platformCatalog, selectedPlatform])

  useEffect(() => {
    if (!platformCatalog.length) return
    setPlatformExecConfigs((prev) => {
      const next = {...prev}
      for (const item of platformCatalog) {
        const defaultAccount = platformConfigs[item.key]?.boundProfileId || accounts.find((account) => account.platform === item.key && account.status === 'active')?.id || ''
        const defaultJob = jobs[0]?.id || ''
        next[item.key] = {
          accountId: next[item.key]?.accountId || defaultAccount,
          jobId: next[item.key]?.jobId || defaultJob,
        }
      }
      return next
    })
  }, [accounts, jobs, platformCatalog, platformConfigs])

  useEffect(() => {
    if (!selectedPlatform) return
    const boundId = platformConfigs[selectedPlatform]?.boundProfileId
    const fallbackId = platformModel.selectedPlatformAccounts[0]?.id || ''
    if (!selectedAccountId || !platformModel.selectedPlatformAccounts.some((item) => item.id === selectedAccountId)) {
      setSelectedAccountId(boundId || fallbackId)
    }
  }, [platformConfigs, platformModel.selectedPlatformAccounts, selectedAccountId, selectedPlatform])

  useEffect(() => {
    if (selectedExecutionId && executions[selectedExecutionId]) return
    const nextExecution = executionModel.activeExecutions[0] || executionModel.orderedExecutions[0] || null
    if (nextExecution?.executionId) {
      setSelectedExecutionId(nextExecution.executionId)
      return
    }
    if (selectedExecutionId) setSelectedExecutionId(null)
  }, [executionModel.activeExecutions, executionModel.orderedExecutions, executions, selectedExecutionId])

  useEffect(() => {
    if (!selectedPlatform) return
    setExecutionGroups((prev) => {
      if (prev.length !== 1) return prev

      const [currentGroup] = prev
      const resolvedPlatform = currentGroup.platform || selectedPlatform
      const availableAccountIds = new Set(accounts.map((account) => account.id))
      const availableJobIds = new Set(jobs.map((job) => job.id))
      const nextAccountId = currentGroup.accountId && availableAccountIds.has(currentGroup.accountId)
        ? currentGroup.accountId
        : executionModel.resolveDefaultAccountForPlatform(resolvedPlatform)
      const nextJobId = currentGroup.jobId && availableJobIds.has(currentGroup.jobId)
        ? currentGroup.jobId
        : executionModel.resolveDefaultJobForPlatform(resolvedPlatform)

      if (
        currentGroup.platform === resolvedPlatform
        && currentGroup.accountId === nextAccountId
        && currentGroup.jobId === nextJobId
      ) {
        return prev
      }

      return [{
        ...currentGroup,
        platform: resolvedPlatform,
        accountId: nextAccountId,
        jobId: nextJobId,
      }]
    })
  }, [
    accounts,
    executionModel,
    jobs,
    selectedPlatform,
  ])

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
    addExecutionGroup({platform: source.platform, accountId: '', jobId: source.jobId})
  }, [addExecutionGroup, executionGroups])
  const applyPlatformToExecutionGroup = useCallback((groupId: string, platform: string) => {
    updateExecutionGroup(groupId, {
      platform,
      accountId: executionModel.resolveDefaultAccountForPlatform(platform),
      jobId: executionModel.resolveDefaultJobForPlatform(platform),
    })
  }, [executionModel, updateExecutionGroup])

  const handleStartWorkflow = useCallback(async (workflowId: WorkflowId) => {
    setWorkflowError(null)
    if (!backendReady) return setWorkflowError('后端服务未连接，无法发起执行。')
    if (executionMode === 'scheduled') return setWorkflowError('定期执行的保存与调度下发待后端适配，当前请先使用立即执行。')
    if (executionModel.completeExecutionGroups.length === 0) return setWorkflowError('请至少补齐 1 组平台、账号、岗位都完整的执行方案。')

    setLaunchingWorkflowIds((prev) => prev.includes(workflowId) ? prev : [...prev, workflowId])
    try {
      const preparedPayloads = await Promise.all(executionModel.completeExecutionGroups.map(async ({group}, index) => {
        const {data: jobData, error: jobError} = await supabase
          .from('jobs')
          .select('id, title, location, salary_min, salary_max, employment_type, department, description, requirements, benefits')
          .eq('id', group.jobId)
          .single()
        if (jobError) throw new Error(`第 ${index + 1} 组加载岗位详情失败：${jobError.message}`)
        const job = jobData as RecruitJobDetail | null
        if (!job) throw new Error(`第 ${index + 1} 组未找到选择的岗位信息，请重新选择。`)
        const account = accounts.find((item) => item.id === group.accountId)
        if (!account) throw new Error(`第 ${index + 1} 组未找到绑定账号，请重新选择。`)

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
        if (!validation.valid) throw new Error(validation.errors[0] || `第 ${index + 1} 组配置未通过校验，请先完成配置。`)
        return workflowPayload
      }))

      const executionIds = await Promise.all(preparedPayloads.map((payload) => startWorkflow(payload)))
      if (executionIds[0]) setSelectedExecutionId(executionIds[0])
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : '启动工作流失败')
    } finally {
      setLaunchingWorkflowIds((prev) => prev.filter((id) => id !== workflowId))
    }
  }, [accounts, backendReady, customMessage, executionMode, executionModel.completeExecutionGroups, matchThreshold, messageSendLimit, platformConfigs, safeCompanyProfile, startWorkflow, user])

  const reopenActionSession = useCallback((session: PlatformBindingSession, accountId: string) => {
    const account = accounts.find((item) => item.id === accountId)
    setActionSession(session)
    setActionSessionMeta({
      platformName: PLATFORMS[account?.platform as keyof typeof PLATFORMS]?.name || account?.platform || selectedPlatform,
      accountName: account?.name || account?.accountName || '',
    })
    setActionDialogOpen(true)
  }, [accounts, selectedPlatform])
  const handleAction = useCallback(async (type: 'verify' | 'unbind', accountId: string) => {
    if (type === 'verify') {
      const account = accounts.find((item) => item.id === accountId)
      const latestVerifySession = account?.latestBindingSession?.action === 'verify' ? account.latestBindingSession : null
      if (latestVerifySession?.status === 'running') return reopenActionSession(latestVerifySession, accountId)
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
  }, [accounts, reopenActionSession, selectedPlatform, startUnbind, startVerify])

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(true)
      setTimeout(() => setCopiedText(false), 2000)
    })
  }
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
  const handleDeleteAccount = useCallback(async (accountId: string) => {
    if (!confirm('确定要删除此账号吗？删除后不可恢复。')) return
    try {
      await deleteAccount(accountId)
      await reloadPlatformAccounts()
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : '删除账号失败')
    }
  }, [deleteAccount, reloadPlatformAccounts])
  const actionDialogAccount = useMemo(() => actionSession ? accounts.find((item) => item.id === actionSession.account_id) || null : null, [accounts, actionSession])

  const renderAccountActionButtons = useCallback((account: PlatformAccountApiRow) => {
    const latestVerifySession = getLatestVerifySession(account)
    const canReopenVerify = Boolean(latestVerifySession)
    const canVerifyAccount = account.status === 'active'
    const canRebindAccount = account.status === 'expired'
    const canUnbindAccount = account.status === 'active' || account.status === 'verifying'
    const isBoundAccount = isBoundPlatformAccount(account)
    const pending = actionPendingAccountId === account.id

    if (!isBoundAccount) {
      return (
        <Button size="sm" className="gap-2 shadow-sm" onClick={() => openBindDialogForAccount(account.id)} disabled={pending} data-testid={canRebindAccount ? 'rebind-account' : 'open-bind-dialog'}>
          <LogIn className="h-3.5 w-3.5"/>{pending ? '处理中...' : canRebindAccount ? '重新绑定' : '开始绑定'}
        </Button>
      )
    }

    return (
      <>
        {canReopenVerify && latestVerifySession && (
          <Button size="sm" variant="outline" className="gap-2" onClick={() => reopenActionSession(latestVerifySession, account.id)} data-testid="reopen-verify-dialog">
            <Search className="h-3.5 w-3.5"/>{verifySessionViewLabel(latestVerifySession)}
          </Button>
        )}
        {canVerifyAccount && (
          <Button size="sm" variant="outline" className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950" onClick={() => void handleAction('verify', account.id)} disabled={pending} data-testid="verify-account">
            <ShieldCheck className="h-3.5 w-3.5"/>{pending ? '验证中...' : verifySessionActionLabel(latestVerifySession)}
          </Button>
        )}
        {canUnbindAccount && (
          <Button size="sm" variant="outline" className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950" onClick={() => void handleAction('unbind', account.id)} disabled={pending} data-testid="unbind-account">
            <Unplug className="h-3.5 w-3.5"/>{pending ? '解绑中...' : '解绑账号'}
          </Button>
        )}
      </>
    )
  }, [actionPendingAccountId, handleAction, openBindDialogForAccount, reopenActionSession])

  const executionTabHandlers: ExecutionTabHandlers = {
    onSelectedPlatformChange: setSelectedPlatform,
    onActiveTabChange: setActiveTab,
    onSelectedExecutionChange: setSelectedExecutionId,
    onMatchThresholdChange: setMatchThreshold,
    onCustomMessageChange: setCustomMessage,
    onMessageSendLimitChange: setMessageSendLimit,
    onExecutionModeChange: setExecutionMode,
    onScheduleFrequencyChange: setScheduleFrequency,
    onScheduleTimeChange: setScheduleTime,
    onScheduleWeekdayChange: setScheduleWeekday,
    onSelectWorkflow: (value) => setSelectedWorkflowId(value as WorkflowId),
    onAddExecutionGroup: addExecutionGroup,
    onUpdateExecutionGroup: updateExecutionGroup,
    onRemoveExecutionGroup: removeExecutionGroup,
    onDuplicateExecutionGroup: duplicateExecutionGroup,
    onApplyPlatformToExecutionGroup: applyPlatformToExecutionGroup,
    onStartWorkflow: (workflowId) => void handleStartWorkflow(workflowId as WorkflowId),
    onCancelWorkflow: cancelWorkflow,
    onOpenExecutionDetail: () => setExecutionDetailOpen(true),
    onPreviewImage: setLightboxSrc,
  }

  return (
    <div className="space-y-6" data-testid="jiling-recruit-page">
      <div className="rounded-2xl bg-gradient-to-r from-primary/[0.06] via-primary/[0.03] to-transparent p-6 dark:from-primary/[0.08] dark:via-primary/[0.04]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
              <Cpu className="h-6 w-6 text-primary-foreground"/>
            </div>
            <div><h1 className="text-2xl font-bold tracking-tight">机灵招聘</h1></div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500"/><span className="text-sm text-muted-foreground">已绑定 <span className="font-semibold text-foreground">{accountsLoading ? '加载中' : platformModel.stats.activeAccounts}</span></span></div>
          <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-amber-500"/><span className="text-sm text-muted-foreground">失效 <span className="font-semibold text-foreground">{accountsLoading ? '加载中' : platformModel.stats.inactiveAccounts}</span></span></div>
          <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-primary/40"/><span className="text-sm text-muted-foreground">总账号 <span className="font-semibold text-foreground">{accountsLoading ? '加载中' : platformModel.stats.totalAccounts}</span></span></div>
          <div className="flex items-center gap-2"><span className={cn('inline-block h-2 w-2 rounded-full', backendReady ? 'bg-emerald-500' : 'bg-red-500')}/><span className="text-sm text-muted-foreground">{backendReady ? '后端已连接' : '后端未连接'}</span></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {executionModel.workflowCards.map((workflow) => {
            const status = executionModel.workflowStatusMap[workflow.id]
            const theme = WORKFLOW_THEMES[workflow.id] || WORKFLOW_THEMES.publish_job
            const hasActive = status.activeCount > 0
            return (
              <button
                key={workflow.id}
                type="button"
                onClick={() => { setActiveTab('execute'); setSelectedWorkflowId(workflow.id as WorkflowId) }}
                className={cn(
                  'flex items-center gap-2.5 rounded-full border px-3.5 py-2 text-left transition-all',
                  hasActive
                    ? 'border-primary/25 bg-primary/[0.06] hover:bg-primary/[0.10]'
                    : 'border-border/70 bg-background/82 hover:border-border',
                )}
              >
                <div className={cn('flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br', theme.iconBg)}>
                  <workflow.icon className="h-3.5 w-3.5 text-primary"/>
                </div>
                <span className="text-sm font-medium text-foreground">{workflow.title}</span>
                {hasActive ? (
                  <Badge variant="outline" className="border-primary/20 bg-primary/[0.08] text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                    {status.label} {status.activeCount}
                  </Badge>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Circle className="h-1.5 w-1.5 fill-current"/>空闲
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6" data-testid="jiling-recruit-tabs">
        <TabsList className="h-10 bg-muted/50 p-1">
          <TabsTrigger value="execute" className="gap-1.5 data-[state=active]:shadow-sm" data-testid="tab-execute"><Cpu className="h-3.5 w-3.5"/>{t('recruit.tab.execute')}</TabsTrigger>
          <TabsTrigger value="candidates" className="gap-1.5 data-[state=active]:shadow-sm"><Search className="h-3.5 w-3.5"/>{t('recruit.tab.candidates')}</TabsTrigger>
          <TabsTrigger value="platform-config" className="gap-1.5 data-[state=active]:shadow-sm" data-testid="tab-platform-config"><LinkIcon className="h-3.5 w-3.5"/>{t('recruit.tab.platformConfig')}</TabsTrigger>
          <TabsTrigger value="jobs" className="gap-1.5 data-[state=active]:shadow-sm"><UserPlus className="h-3.5 w-3.5"/>{t('recruit.tab.jobs')}</TabsTrigger>
        </TabsList>

        <PlatformConfigTab
          model={platformModel}
          platformConfigSection={platformConfigSection}
          onPlatformConfigSectionChange={setPlatformConfigSection}
          customMessage={customMessage}
          onCustomMessageChange={setCustomMessage}
          messageSendLimit={messageSendLimit}
          onMessageSendLimitChange={setMessageSendLimit}
          autoVerifyEnabled={autoVerifyEnabled}
          onAutoVerifyEnabledChange={setAutoVerifyEnabled}
          onOpenAddAccount={() => setAddAccountOpen(true)}
          onSelectedPlatformChange={setSelectedPlatform}
          onSelectedAccountChange={setSelectedAccountId}
          onSetDefaultAccount={(accountId) => {
            updatePlatformConfig(selectedPlatform, {boundProfileId: accountId})
            setSelectedAccountId(accountId)
          }}
          onDeleteAccount={(accountId) => void handleDeleteAccount(accountId)}
          actionPendingAccountId={actionPendingAccountId}
          renderAccountActionButtons={renderAccountActionButtons}
        />
        <ExecutionTab
          model={executionModel}
          selectedPlatform={selectedPlatform}
          selectedExecutionId={selectedExecutionId}
          matchThreshold={matchThreshold}
          customMessage={customMessage}
          messageSendLimit={messageSendLimit}
          executionMode={executionMode}
          scheduleFrequency={scheduleFrequency}
          scheduleTime={scheduleTime}
          scheduleWeekday={scheduleWeekday}
          handlers={executionTabHandlers}
        />
        <TabsContent value="jobs" className="mt-0"><JobManagementPanel/></TabsContent>
        <TabsContent value="candidates" className="mt-0"><Candidates embedded/></TabsContent>
      </Tabs>

      <ExecutionDetailDialog
        open={executionDetailOpen}
        onOpenChange={setExecutionDetailOpen}
        execution={executionModel.displayExec}
        runningStepLabel={executionModel.runningStepLabel}
        progressPercent={executionModel.progressPercent}
        completedStepCount={executionModel.completedStepCount}
        isActive={executionModel.isDisplayExecActive}
        authGuide={getExecutionAuthGuide(executionModel.displayExec?.error, executionModel.displayExec?.accumulatedText)}
        copiedText={copiedText}
        onCopyText={copyText}
        onPreview={setLightboxSrc}
        dispatchMeta={executionModel.displayExecDispatchMeta}
      />

      <AnimatePresence>
        {lightboxSrc && (
          <motion.div key="lightbox" initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm" onClick={() => setLightboxSrc(null)}>
            <Button variant="ghost" size="icon" className="absolute right-4 top-4 z-[81] text-white hover:bg-white/10" onClick={() => setLightboxSrc(null)}>
              <X className="h-5 w-5"/>
            </Button>
            <motion.img initial={{scale: 0.9, opacity: 0}} animate={{scale: 1, opacity: 1}} exit={{scale: 0.9, opacity: 0}} src={lightboxSrc} alt="截图放大" className="max-h-[90vh] max-w-full rounded-xl shadow-2xl" onClick={(event) => event.stopPropagation()}/>
          </motion.div>
        )}
      </AnimatePresence>

      <AddProfileDialog open={addAccountOpen} onOpenChange={setAddAccountOpen} defaultPlatform={(selectedPlatform || platformCatalog[0]?.key || 'boss_zhipin') as keyof typeof PLATFORMS} onCreated={handleAccountCreated}/>
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
            if (!actionSession) return
            if (actionDialogAccount?.status === 'expired') return openBindDialogForAccount(actionSession.account_id)
            void handleAction('verify', actionSession.account_id)
          }
          : undefined}
      />
    </div>
  )
}
