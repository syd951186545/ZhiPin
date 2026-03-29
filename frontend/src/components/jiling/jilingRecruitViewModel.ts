import type {ElementType} from 'react'
import type {PlatformAccountApiRow} from '@/services/platformAccountService'
import type {WorkflowExecution} from '@/stores/useWorkflowStore'
import {
  accountStatusHint,
  isBoundPlatformAccount,
  trimInlineText,
  type ExecutionGroup,
  type PreparationTone,
  type RecruitJobOption,
} from '@/components/jiling/jilingRecruitHelpers'

export type ExecutionDispatchTone = 'parallel' | 'serial' | 'single' | 'recent'

export interface PreparationCheck {
  label: string
  summary: string
  tone: PreparationTone
  detail: string
}

export interface AccountDirectoryItem {
  name: string
  platformName: string
}

export interface ExecutionDispatchMeta {
  accountNames: string[]
  accountSummary: string
  platformSummary: string
  laneTone: ExecutionDispatchTone
  laneLabel: string
  laneDetail: string
  sameAccountActiveCount: number
  differentAccountActiveCount: number
}

export interface ExecutionGroupPlanMeta {
  label: string
  tone: ExecutionDispatchTone
  detail: string
}

export interface ExecutionGroupDiagnostic {
  index: number
  group: ExecutionGroup
  account: PlatformAccountApiRow | null
  job: RecruitJobOption | null
  duplicateAccount: boolean
  missing: string[]
  complete: boolean
  platformLabel: string
}

export interface ExecutionPlanPreview {
  summary: string
  metaMap: Record<string, ExecutionGroupPlanMeta>
}

export interface WorkflowCardRuntime {
  id: string
  title: string
  desc: string
  icon: ElementType
  multiPlatform: boolean
}

export interface WorkflowStatusSummary {
  state: string
  label: string
  detail: string
  progress: number
  activeCount: number
  queuedCount: number
  runningCount: number
  accountCount: number
  accountSummary: string
}

export function uniqueStrings(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))))
}

export function hasSharedAccount(left: WorkflowExecution, right: WorkflowExecution) {
  if (!left.accountIds?.length || !right.accountIds?.length) return false
  const accountIds = new Set(left.accountIds)
  return right.accountIds.some((accountId) => accountIds.has(accountId))
}

export function summarizeNames(values: string[], emptyLabel: string, visibleCount = 2) {
  if (values.length === 0) return emptyLabel
  if (values.length <= visibleCount) return values.join(' / ')
  return `${values.slice(0, visibleCount).join(' / ')} 等 ${values.length} 个`
}

export function getPreparedAccountStatus(preparedAccount: PlatformAccountApiRow | null) {
  const preparedAccountIsBound = preparedAccount ? isBoundPlatformAccount(preparedAccount) : false

  if (!preparedAccount) {
    return {
      label: '待绑定',
      tone: 'risk' as PreparationTone,
      description: '当前平台还没有可直接执行的主账号。',
    }
  }
  if (preparedAccount.status === 'verifying') {
    return {
      label: '验证中',
      tone: 'idle' as PreparationTone,
      description: '系统正在后台核验登录态，请等待结果刷新。',
    }
  }
  if (preparedAccount.status === 'active' && preparedAccountIsBound) {
    return {
      label: '可直接执行',
      tone: 'pass' as PreparationTone,
      description: '主账号已绑定且登录态可复用，可以进入工作流执行。',
    }
  }
  if (preparedAccount.status === 'expired') {
    return {
      label: '待重新验证',
      tone: 'risk' as PreparationTone,
      description: '最近登录态已失效，建议先重新验证，必要时重新绑定。',
    }
  }
  return {
    label: '待补齐',
    tone: 'risk' as PreparationTone,
    description: '主账号尚未完成绑定，暂时不能进入自动执行。',
  }
}

export function getAutoVerifyCheck(autoVerifyEnabled: boolean): PreparationCheck {
  return {
    label: '自动验证开关',
    summary: autoVerifyEnabled ? '开启' : '关闭',
    tone: (autoVerifyEnabled ? 'pass' : 'idle') as PreparationTone,
    detail: autoVerifyEnabled ? '执行前会默认保留自动验证提醒。' : '关闭后，需人工确认登录态是否仍可复用。',
  }
}

export function getPreflightChecks(args: {
  preparedAccount: PlatformAccountApiRow | null
  preparedAccountStatusHint: string
  selectedDefaultAccount: PlatformAccountApiRow | null
  selectedExecJob: RecruitJobOption | null
  customMessage: string
}): PreparationCheck[] {
  const {preparedAccount, preparedAccountStatusHint, selectedDefaultAccount, selectedExecJob, customMessage} = args

  return [
    preparedAccount
      ? preparedAccount.status === 'active' && isBoundPlatformAccount(preparedAccount)
        ? {
            label: '登录态可复用',
            summary: '通过',
            tone: 'pass' as PreparationTone,
            detail: `${preparedAccount.name} 当前处于可复用状态，可直接发起执行。`,
          }
        : preparedAccount.status === 'verifying'
          ? {
              label: '登录态可复用',
              summary: '处理中',
              tone: 'idle' as PreparationTone,
              detail: '后台正在验证当前账号，请等待核验结果刷新。',
            }
          : {
              label: '登录态可复用',
              summary: '风险',
              tone: 'risk' as PreparationTone,
              detail: preparedAccountStatusHint,
            }
      : {
          label: '登录态可复用',
          summary: '风险',
          tone: 'risk' as PreparationTone,
          detail: '还没有指定主执行账号，无法验证登录态。',
        },
    selectedDefaultAccount
      ? {
          label: '默认执行账号',
          summary: '通过',
          tone: 'pass' as PreparationTone,
          detail: `${selectedDefaultAccount.name} 已被设为当前平台默认执行账号。`,
        }
      : {
          label: '默认执行账号',
          summary: '风险',
          tone: 'risk' as PreparationTone,
          detail: '请选择一个账号作为主执行入口，避免运行时临时兜底。',
        },
    selectedExecJob
      ? {
          label: '默认执行岗位',
          summary: '通过',
          tone: 'pass' as PreparationTone,
          detail: `${selectedExecJob.title} 已接入当前平台执行配置。`,
        }
      : {
          label: '默认执行岗位',
          summary: '风险',
          tone: 'risk' as PreparationTone,
          detail: '当前平台还没有指定岗位模板，执行时会被拦截。',
        },
    customMessage.trim()
      ? {
          label: '主动沟通模板',
          summary: '已保存',
          tone: 'saved' as PreparationTone,
          detail: '已写入自定义话术，人才探索时会优先复用。',
        }
      : {
          label: '主动沟通模板',
          summary: '默认',
          tone: 'idle' as PreparationTone,
          detail: '未自定义时，系统会使用默认沟通模板。',
        },
  ]
}

export function getAccountDirectory(
  accounts: PlatformAccountApiRow[],
  platformNames: Record<string, string>,
): Record<string, AccountDirectoryItem> {
  return Object.fromEntries(accounts.map((account) => [
    account.id,
    {
      name: account.name || account.accountName || trimInlineText(account.id, 12),
      platformName: platformNames[account.platform] || account.platform,
    },
  ]))
}

export function getAccountUsageCount(executionGroups: ExecutionGroup[]) {
  const counts = new Map<string, number>()
  executionGroups.forEach((group) => {
    if (!group.accountId) return
    counts.set(group.accountId, (counts.get(group.accountId) || 0) + 1)
  })
  return counts
}

export function getExecutionGroupDiagnostics(args: {
  executionGroups: ExecutionGroup[]
  accounts: PlatformAccountApiRow[]
  jobs: RecruitJobOption[]
  accountUsageCount: Map<string, number>
  platformNames: Record<string, string>
}): ExecutionGroupDiagnostic[] {
  const {executionGroups, accounts, jobs, accountUsageCount, platformNames} = args

  return executionGroups.map((group, index) => {
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
      platformLabel: platformNames[group.platform] || '未选择平台',
    }
  })
}

export function getExecutionPlanPreview(executionGroupDiagnostics: ExecutionGroupDiagnostic[]): ExecutionPlanPreview {
  const completeItems = executionGroupDiagnostics.filter((item) => item.complete && item.group.accountId)
  const indexesByAccount = new Map<string, number[]>()

  completeItems.forEach((item) => {
    const accountId = item.group.accountId
    if (!accountId) return
    const indexes = indexesByAccount.get(accountId) || []
    indexes.push(item.index)
    indexesByAccount.set(accountId, indexes)
  })

  const metaMap = Object.fromEntries(executionGroupDiagnostics.map((item) => {
    if (!item.complete || !item.group.accountId) {
      return [item.group.id, {
        label: '待补齐',
        tone: 'recent' as ExecutionDispatchTone,
        detail: '补齐平台、账号和岗位后，这里会预告该组是串行还是并行启动。',
      }]
    }

    const queueIndexes = indexesByAccount.get(item.group.accountId) || []
    const queuePosition = queueIndexes.indexOf(item.index)
    const hasMultipleAccounts = indexesByAccount.size > 1

    if (queueIndexes.length > 1) {
      if (queuePosition === 0) {
        return [item.group.id, {
          label: '串行起点',
          tone: 'serial' as ExecutionDispatchTone,
          detail: `该组会先占用账号通道，随后执行组 ${queueIndexes.slice(1).map((index) => index + 1).join('、')} 将按同账号顺序排队。${hasMultipleAccounts ? '其他账号组仍可并行启动。' : ''}`,
        }]
      }

      return [item.group.id, {
        label: '同账号串行',
        tone: 'serial' as ExecutionDispatchTone,
        detail: `该组与执行组 ${queueIndexes[queuePosition - 1] + 1} 共用同一账号，需要等待前序任务释放通道后再启动。`,
      }]
    }

    if (hasMultipleAccounts) {
      return [item.group.id, {
        label: '不同账号并行',
        tone: 'parallel' as ExecutionDispatchTone,
        detail: '该组占用独立账号通道，点击开始后可与其他账号组同时推进。',
      }]
    }

    return [item.group.id, {
      label: '独立执行',
      tone: 'single' as ExecutionDispatchTone,
      detail: '当前仅有这一条账号通道，点击开始后会直接执行。',
    }]
  })) as Record<string, ExecutionGroupPlanMeta>

  const serialGroups = completeItems.filter((item) => {
    const accountId = item.group.accountId
    return Boolean(accountId && (indexesByAccount.get(accountId)?.length || 0) > 1)
  }).length

  const summary = completeItems.length === 0
    ? '补齐账号与岗位后，这里会生成串行/并行执行计划预览。'
    : serialGroups === 0
      ? `当前 ${completeItems.length} 组完整方案都会按不同账号直接启动。`
      : `当前 ${completeItems.length} 组完整方案中，${serialGroups} 组会按同账号串行排队，其余 ${Math.max(completeItems.length - serialGroups, 0)} 组可按不同账号并行启动。`

  return {
    summary,
    metaMap,
  }
}

export function getExecutionDispatchMetaMap(args: {
  orderedExecutions: WorkflowExecution[]
  activeExecutions: WorkflowExecution[]
  accountDirectory: Record<string, AccountDirectoryItem>
}) {
  const {orderedExecutions, activeExecutions, accountDirectory} = args

  return Object.fromEntries(orderedExecutions.map((execution) => {
    const accountNames = uniqueStrings((execution.accountIds || []).map((accountId) => accountDirectory[accountId]?.name || trimInlineText(accountId, 12)))
    const platformNames = uniqueStrings([
      execution.currentPlatform,
      ...(execution.accountIds || []).map((accountId) => accountDirectory[accountId]?.platformName),
    ])
    const otherExecutingItems = activeExecutions.filter((other) => (
      other.executionId !== execution.executionId
      && ['starting', 'running', 'cancelling'].includes(other.status)
    ))
    const sameAccountActiveCount = activeExecutions.filter((other) => other.executionId !== execution.executionId && hasSharedAccount(execution, other)).length
    const differentAccountActiveCount = otherExecutingItems.filter((other) => !hasSharedAccount(execution, other)).length
    const accountSummary = summarizeNames(accountNames, '待识别账号')
    const platformSummary = summarizeNames(platformNames, '待识别平台')

    let laneTone: ExecutionDispatchTone = 'recent'
    let laneLabel = '最近记录'
    let laneDetail = `最近一次执行涉及 ${accountSummary}，平台 ${platformSummary}。`

    if (execution.status === 'queued') {
      laneTone = 'serial'
      laneLabel = '同账号串行'
      laneDetail = execution.queueMessage || `当前与 ${accountSummary} 共用同一执行通道，前方还有 ${execution.blockingExecutionCount || 0} 个任务。`
    } else if (['starting', 'running', 'cancelling'].includes(execution.status)) {
      if (execution.wasQueued) {
        laneTone = 'serial'
        laneLabel = differentAccountActiveCount > 0 ? '原串行 → 已启动' : '原串行 → 执行中'
        laneDetail = differentAccountActiveCount > 0
          ? `该任务曾因同账号串行排队，当前已轮到 ${accountSummary} 执行；同时与 ${differentAccountActiveCount} 个其他账号任务并行推进。`
          : `该任务曾因同账号串行排队，当前已轮到 ${accountSummary} 执行。`
      } else if (differentAccountActiveCount > 0) {
        laneTone = 'parallel'
        laneLabel = '不同账号并行'
        laneDetail = `当前与 ${differentAccountActiveCount} 个其他账号任务并行推进，执行账号：${accountSummary}。`
      } else {
        laneTone = 'single'
        laneLabel = '独立执行'
        laneDetail = `当前仅 ${accountSummary} 在执行，平台 ${platformSummary}。`
      }
    } else if (execution.status === 'failed') {
      laneLabel = '最近失败'
      laneDetail = `最近失败任务来自 ${accountSummary}，可展开查看错误与执行证据。`
    } else if (execution.status === 'completed') {
      laneLabel = '最近完成'
    } else if (execution.status === 'cancelled') {
      laneLabel = '最近停止'
    }

    return [execution.executionId, {
      accountNames,
      accountSummary,
      platformSummary,
      laneTone,
      laneLabel,
      laneDetail,
      sameAccountActiveCount,
      differentAccountActiveCount,
    } satisfies ExecutionDispatchMeta]
  })) as Record<string, ExecutionDispatchMeta>
}

export function getWorkflowStatusMap(args: {
  workflowCards: WorkflowCardRuntime[]
  activeExecutions: WorkflowExecution[]
  orderedExecutions: WorkflowExecution[]
  accountDirectory: Record<string, AccountDirectoryItem>
  getExecutionProgress: (execution: WorkflowExecution | null) => number
  getExecutionRunningStepLabel: (execution: WorkflowExecution | null) => string
}) {
  const {workflowCards, activeExecutions, orderedExecutions, accountDirectory, getExecutionProgress, getExecutionRunningStepLabel} = args

  const statusMap = Object.fromEntries(workflowCards.map((workflow) => [workflow.id, {
    state: 'idle',
    label: '空闲',
    detail: '尚未开始',
    progress: 0,
    activeCount: 0,
    queuedCount: 0,
    runningCount: 0,
    accountCount: 0,
    accountSummary: '暂无账号',
  }])) as Record<string, WorkflowStatusSummary>

  for (const workflow of workflowCards) {
    const runningExecutions = activeExecutions.filter((execution) => execution.workflowId === workflow.id)
    if (runningExecutions.length > 0) {
      const leadExecution = runningExecutions[0]
      const allQueued = runningExecutions.every((execution) => execution.status === 'queued')
      const queuedCount = runningExecutions.filter((execution) => execution.status === 'queued').length
      const runningCount = runningExecutions.length - queuedCount
      const accountNames = uniqueStrings(runningExecutions.flatMap((execution) => (
        execution.accountIds || []
      )).map((accountId) => accountDirectory[accountId]?.name || trimInlineText(accountId, 12)))

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
        activeCount: runningExecutions.length,
        queuedCount,
        runningCount,
        accountCount: accountNames.length,
        accountSummary: summarizeNames(accountNames, '暂无账号'),
      }
      continue
    }

    const recentExecution = orderedExecutions.find((execution) => execution.workflowId === workflow.id)
    if (!recentExecution) continue

    const recentProgress = getExecutionProgress(recentExecution)
    const recentAccountNames = uniqueStrings((recentExecution.accountIds || []).map((accountId) => accountDirectory[accountId]?.name || trimInlineText(accountId, 12)))
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
      activeCount: 0,
      queuedCount: recentExecution.status === 'queued' ? 1 : 0,
      runningCount: 0,
      accountCount: recentAccountNames.length,
      accountSummary: summarizeNames(recentAccountNames, '暂无账号'),
    }
  }

  return statusMap
}

export function getPreparedAccountStatusHint(preparedAccount: PlatformAccountApiRow | null) {
  return preparedAccount ? accountStatusHint(preparedAccount) : '请选择或新增一个账号完成执行准备。'
}
