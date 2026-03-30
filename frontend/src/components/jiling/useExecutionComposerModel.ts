import {useCallback, useMemo} from 'react'
import type {TranslationKey} from '@/contexts/I18nContext'
import {PLATFORMS} from '@/lib/constants'
import {getExecutionStatusMeta} from '@/components/jiling/ExecutionDetailDialog'
import {
  getAccountDirectory,
  getAccountUsageCount,
  getExecutionDispatchMetaMap,
  getExecutionChannelSummary,
  getExecutionGroupDiagnostics,
  getExecutionPlanPreview,
  getWorkflowStatusMap,
  uniqueStrings,
  type ExecutionChannelSummary,
  type ExecutionDispatchMeta,
  type ExecutionGroupDiagnostic,
  type ExecutionPlanPreview,
  type WorkflowStatusSummary,
} from '@/components/jiling/jilingRecruitViewModel'
import {WORKFLOW_CARDS, WORKFLOW_I18N_KEYS, type WorkflowCardView} from '@/components/jiling/jilingRecruitShared'
import {
  summarizeExecutionOutput,
  trimInlineText,
  type ExecutionGroup,
  type ExecutionMode,
  type RecruitJobOption,
} from '@/components/jiling/jilingRecruitHelpers'
import type {PlatformAccountApiRow} from '@/services/platformAccountService'
import type {WorkflowId, WorkflowTemplate} from '@/services/workflowService'
import type {WorkflowExecution} from '@/stores/useWorkflowStore'
import type {RecruitPlatformCatalogItem} from '@/components/jiling/usePlatformConfigModel'

export interface ExecutionComposerModel {
  catalog: RecruitPlatformCatalogItem[]
  accounts: PlatformAccountApiRow[]
  accountsLoading: boolean
  jobs: RecruitJobOption[]
  jobsLoading: boolean
  orderedExecutions: WorkflowExecution[]
  activeExecutions: WorkflowExecution[]
  displayExec: WorkflowExecution | null
  workflowCards: WorkflowCardView[]
  selectedWorkflowCard: WorkflowCardView
  accountUsageCount: Map<string, number>
  executionGroupDiagnostics: ExecutionGroupDiagnostic[]
  completeExecutionGroups: ExecutionGroupDiagnostic[]
  draftExecutionGroups: ExecutionGroupDiagnostic[]
  executionPlanPreview: ExecutionPlanPreview
  executionChannelSummary: ExecutionChannelSummary
  executionReadinessReasons: string[]
  canStartSelectedWorkflow: boolean
  queuedExecutionCount: number
  runningExecutionCount: number
  activeExecutionCount: number
  activeExecutionAccountCount: number
  executionPreviewItems: WorkflowExecution[]
  selectedWorkflowRunningCount: number
  isSelectedWorkflowLaunching: boolean
  isDisplayExecActive: boolean
  displayExecStatusMeta: ReturnType<typeof getExecutionStatusMeta>
  displayExecSummary: string
  displayExecRecentNodes: WorkflowExecution['actionNodes']
  displayExecDispatchMeta: ExecutionDispatchMeta | null
  executionDispatchMetaMap: Record<string, ExecutionDispatchMeta>
  workflowStatusMap: Record<string, WorkflowStatusSummary>
  progressPercent: number
  completedStepCount: number
  runningStepLabel: string
  readyPlatformCount: number
  shouldClampExecutionGroupList: boolean
  shouldClampExecutionPreviewList: boolean
  resolveDefaultAccountForPlatform: (platform: string) => string
  resolveDefaultJobForPlatform: (platform: string) => string
  getExecutionProgress: (execution: WorkflowExecution | null) => number
  getExecutionRunningStepLabel: (execution: WorkflowExecution | null) => string
}

export function useExecutionComposerModel(args: {
  t: (key: TranslationKey) => string
  workflowTemplates: WorkflowTemplate[]
  catalog: RecruitPlatformCatalogItem[]
  accounts: PlatformAccountApiRow[]
  accountsLoading: boolean
  jobs: RecruitJobOption[]
  jobsLoading: boolean
  executions: Record<string, WorkflowExecution>
  executionOrder: string[]
  selectedExecutionId: string | null
  selectedWorkflowId: WorkflowId
  executionGroups: ExecutionGroup[]
  launchingWorkflowIds: WorkflowId[]
  selectedPlatform: string
  backendReady: boolean
  executionMode: ExecutionMode
  platformConfigs: Record<string, {boundProfileId?: string} | undefined>
  platformExecConfigs: Record<string, {accountId: string; jobId: string}>
}): ExecutionComposerModel {
  const {
    t,
    workflowTemplates,
    catalog,
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
  } = args

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
    title: workflowTemplateMap[card.id]?.title || t(WORKFLOW_I18N_KEYS[card.id].title),
    desc: workflowTemplateMap[card.id]?.description || t(WORKFLOW_I18N_KEYS[card.id].desc),
    multiPlatform: workflowTemplateMap[card.id]?.multi_platform ?? card.multiPlatform,
    executionMode: workflowTemplateMap[card.id]?.execution_mode || 'auto_submit',
    screenshotMode: workflowTemplateMap[card.id]?.screenshot_mode || 'direct_url',
  })), [t, workflowTemplateMap])
  const selectedWorkflowCard = useMemo(
    () => workflowCards.find((workflow) => workflow.id === selectedWorkflowId) || workflowCards[0],
    [selectedWorkflowId, workflowCards],
  )
  const resolveDefaultAccountForPlatform = useCallback((platform: string) => (
    platformConfigs[platform]?.boundProfileId || accounts.find((account) => account.platform === platform && account.status === 'active')?.id || ''
  ), [accounts, platformConfigs])
  const resolveDefaultJobForPlatform = useCallback((platform: string) => (
    platformExecConfigs[platform]?.jobId || jobs[0]?.id || ''
  ), [jobs, platformExecConfigs])
  const platformNameMap = useMemo(
    () => Object.fromEntries(Object.entries(PLATFORMS).map(([key, value]) => [key, value.name])),
    [],
  )
  const accountDirectory = useMemo(
    () => getAccountDirectory(accounts, platformNameMap),
    [accounts, platformNameMap],
  )
  const accountUsageCount = useMemo(
    () => getAccountUsageCount(executionGroups),
    [executionGroups],
  )
  const executionGroupDiagnostics = useMemo(
    () => getExecutionGroupDiagnostics({
      executionGroups,
      accounts,
      jobs,
      accountUsageCount,
      platformNames: platformNameMap,
    }),
    [accountUsageCount, accounts, executionGroups, jobs, platformNameMap],
  )
  const completeExecutionGroups = useMemo(
    () => executionGroupDiagnostics.filter((item) => item.complete),
    [executionGroupDiagnostics],
  )
  const draftExecutionGroups = useMemo(
    () => executionGroupDiagnostics.filter((item) => !item.complete),
    [executionGroupDiagnostics],
  )
  const executionPlanPreview = useMemo(
    () => getExecutionPlanPreview(executionGroupDiagnostics),
    [executionGroupDiagnostics],
  )
  const executionChannelSummary = useMemo(
    () => getExecutionChannelSummary({
      executionGroupDiagnostics,
      accountDirectory,
    }),
    [accountDirectory, executionGroupDiagnostics],
  )
  const executionReadinessReasons = useMemo(() => {
    const reasons: string[] = []
    if (!backendReady) reasons.push('后端未连接，无法发起执行。')
    if (executionMode === 'scheduled') reasons.push('定期执行的保存与调度下发待后端适配。')
    if (completeExecutionGroups.length === 0) reasons.push('至少配置 1 组完整执行方案，按钮才会解锁。')
    return reasons
  }, [backendReady, completeExecutionGroups.length, executionMode])
  const canStartSelectedWorkflow = executionReadinessReasons.length === 0
  const getExecutionProgress = useCallback((execution: WorkflowExecution | null) => {
    if (!execution) return 0
    return Math.round((execution.steps.filter((step) => step.status === 'done').length / Math.max(execution.totalSteps, 1)) * 100)
  }, [])
  const getExecutionRunningStepLabel = useCallback((execution: WorkflowExecution | null) => (
    execution?.status === 'queued'
      ? execution.queueMessage || `同账号排队中，前方还有 ${execution.blockingExecutionCount || 0} 个任务`
      : execution?.steps.find((step) => step.status === 'running')?.nameZh || execution?.currentPlatform || '等待下一步执行'
  ), [])
  const progressPercent = displayExec ? Math.round((displayExec.steps.filter((step) => step.status === 'done').length / Math.max(displayExec.totalSteps, 1)) * 100) : 0
  const completedStepCount = displayExec ? displayExec.steps.filter((step) => step.status === 'done').length : 0
  const runningStepLabel = displayExec?.status === 'queued'
    ? displayExec.queueMessage || `同账号排队中，前方还有 ${displayExec.blockingExecutionCount || 0} 个任务`
    : displayExec?.steps.find((step) => step.status === 'running')?.nameZh || '等待下一步执行'
  const activeExecutionCount = activeExecutions.length
  const queuedExecutionCount = useMemo(
    () => activeExecutions.filter((execution) => execution.status === 'queued').length,
    [activeExecutions],
  )
  const runningExecutionCount = useMemo(
    () => activeExecutions.filter((execution) => ['starting', 'running', 'cancelling'].includes(execution.status)).length,
    [activeExecutions],
  )
  const activeExecutionAccountCount = useMemo(
    () => uniqueStrings(activeExecutions.flatMap((execution) => execution.accountIds || [])).length,
    [activeExecutions],
  )
  const executionPreviewItems = useMemo(() => orderedExecutions.slice(0, 8), [orderedExecutions])
  const selectedWorkflowRunningExecutions = useMemo(
    () => activeExecutions.filter((execution) => execution.workflowId === selectedWorkflowCard.id),
    [activeExecutions, selectedWorkflowCard.id],
  )
  const selectedWorkflowRunningCount = selectedWorkflowRunningExecutions.length
  const isSelectedWorkflowLaunching = launchingWorkflowIds.includes(selectedWorkflowCard.id)
  const isDisplayExecActive = Boolean(displayExec && ['queued', 'starting', 'running', 'cancelling'].includes(displayExec.status))
  const displayExecStatusMeta = useMemo(
    () => getExecutionStatusMeta(displayExec),
    [displayExec],
  )
  const displayExecSummary = useMemo(
    () => summarizeExecutionOutput(displayExec?.accumulatedText, displayExec?.error, displayExec?.queueMessage),
    [displayExec?.accumulatedText, displayExec?.error, displayExec?.queueMessage],
  )
  const displayExecRecentNodes = useMemo(
    () => displayExec?.actionNodes.slice(-2) || [],
    [displayExec],
  )
  const executionDispatchMetaMap = useMemo(
    () => getExecutionDispatchMetaMap({
      orderedExecutions,
      activeExecutions,
      accountDirectory,
    }),
    [accountDirectory, activeExecutions, orderedExecutions],
  )
  const displayExecDispatchMeta = useMemo(
    () => displayExec ? executionDispatchMetaMap[displayExec.executionId] : null,
    [displayExec, executionDispatchMetaMap],
  )
  const workflowStatusMap = useMemo(
    () => getWorkflowStatusMap({
      workflowCards,
      activeExecutions,
      orderedExecutions,
      accountDirectory,
      getExecutionProgress,
      getExecutionRunningStepLabel,
    }),
    [accountDirectory, activeExecutions, getExecutionProgress, getExecutionRunningStepLabel, orderedExecutions, workflowCards],
  )
  const readyPlatformCount = catalog.filter((item) => Boolean(resolveDefaultAccountForPlatform(item.key) && resolveDefaultJobForPlatform(item.key))).length
  const shouldClampExecutionGroupList = executionGroupDiagnostics.length > 3
  const shouldClampExecutionPreviewList = executionPreviewItems.length > 4

  return {
    catalog,
    accounts,
    accountsLoading,
    jobs,
    jobsLoading,
    orderedExecutions,
    activeExecutions,
    displayExec,
    workflowCards,
    selectedWorkflowCard,
    accountUsageCount,
    executionGroupDiagnostics,
    completeExecutionGroups,
    draftExecutionGroups,
    executionPlanPreview,
    executionChannelSummary,
    executionReadinessReasons,
    canStartSelectedWorkflow,
    queuedExecutionCount,
    runningExecutionCount,
    activeExecutionCount,
    activeExecutionAccountCount,
    executionPreviewItems,
    selectedWorkflowRunningCount,
    isSelectedWorkflowLaunching,
    isDisplayExecActive,
    displayExecStatusMeta,
    displayExecSummary,
    displayExecRecentNodes,
    displayExecDispatchMeta,
    executionDispatchMetaMap,
    workflowStatusMap,
    progressPercent,
    completedStepCount,
    runningStepLabel,
    readyPlatformCount,
    shouldClampExecutionGroupList,
    shouldClampExecutionPreviewList,
    resolveDefaultAccountForPlatform,
    resolveDefaultJobForPlatform,
    getExecutionProgress,
    getExecutionRunningStepLabel,
  }
}
