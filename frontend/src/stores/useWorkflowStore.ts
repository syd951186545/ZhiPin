/**
 * 工作流执行状态管理 (Zustand)
 *
 * 支持多执行实例并行跟踪，并在页面刷新后从后端运行态恢复监控数据。
 */

import {create} from 'zustand'
import {supabase} from '@/lib/supabase'
import {
  type ArtifactEvent,
  cancelWorkflow as apiCancelWorkflow,
  getWorkflowRun,
  startWorkflow as apiStartWorkflow,
  subscribeWorkflow,
  type CompleteEvent,
  type StepMeta,
  type WorkflowId,
  type WorkflowStartRequest,
} from '@/services/workflowService'

export type StepStatus = 'pending' | 'running' | 'done' | 'failed'
export type WorkflowStatus = 'idle' | 'queued' | 'starting' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled'

export interface StepState {
  id: string
  nameZh: string
  status: StepStatus
  error?: string
  platform?: string
}

export interface ActionNode {
  id: string
  time: string
  action: string
  screenshot?: string
  imageUrls?: string[]
  stepId: string
  artifactId?: string
  contentUrl?: string
  persisted?: boolean
}

export interface WorkflowExecution {
  executionId: string
  workflowId: WorkflowId
  workflowName: string
  status: WorkflowStatus
  accountIds?: string[]
  steps: StepState[]
  currentStepIndex: number
  totalSteps: number
  accumulatedText: string
  actionNodes: ActionNode[]
  result?: CompleteEvent
  error?: string
  multiPlatform?: boolean
  currentPlatform?: string
  currentPlatformIndex?: number
  totalPlatforms?: number
  queuePosition?: number
  blockingExecutionCount?: number
  queueMessage?: string
}

interface RuntimeWorkflowRun {
  execution_id: string
  workflow_id: WorkflowId
  workflow_name?: string
  status?: string
  request?: WorkflowStartRequest
  steps?: Record<string, Record<string, unknown>>
  step_order?: string[]
  accumulated_output?: string
  artifacts_detail?: Array<Record<string, unknown>>
  result?: CompleteEvent
  error?: string
  current_platform?: {
    platform?: string
    platform_name?: string
    platform_index?: number
    total_platforms?: number
  }
  queue_position?: number
  blocking_execution_count?: number
  queue_message?: string
  multi_platform?: boolean
  events_payload?: Array<{event?: string; data?: Record<string, unknown>}>
}

interface WorkflowStore {
  executions: Record<string, WorkflowExecution>
  executionOrder: string[]
  backendReady: boolean
  startWorkflow: (req: WorkflowStartRequest) => Promise<string>
  cancelWorkflow: (executionId: string) => void
  clearExecution: (executionId?: string) => void
  setBackendReady: (ready: boolean) => void
  restoreExecution: () => Promise<void>
}

type WorkflowSetState = WorkflowStore | Partial<WorkflowStore> | ((state: WorkflowStore) => WorkflowStore | Partial<WorkflowStore>)
type WorkflowSet = (partial: WorkflowSetState, replace?: false) => void
type WorkflowGet = () => WorkflowStore

const EXECUTION_STORAGE_KEY = 'jiling-recruit:execution-ids'
const MAX_PERSISTED_EXECUTIONS = 20
const _cancelledStepError = '已停止'

const _unsubscribeSSE = new Map<string, () => void>()

function readStoredExecutionIds(): string[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(EXECUTION_STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    }
  } catch {
    if (raw.trim()) {
      return [raw.trim()]
    }
  }
  return []
}

function persistExecutionPointers(executionOrder: string[]) {
  if (typeof window === 'undefined') return
  const payload = executionOrder.slice(0, MAX_PERSISTED_EXECUTIONS)
  if (payload.length > 0) {
    window.localStorage.setItem(EXECUTION_STORAGE_KEY, JSON.stringify(payload))
    return
  }
  window.localStorage.removeItem(EXECUTION_STORAGE_KEY)
}

function prioritizeExecution(executionOrder: string[], executionId: string): string[] {
  return [executionId, ...executionOrder.filter((id) => id !== executionId)].slice(0, MAX_PERSISTED_EXECUTIONS)
}

function normalizeStepStatus(status?: string): StepStatus {
  if (status === 'running' || status === 'done' || status === 'failed') return status
  return 'pending'
}

function normalizeWorkflowStatus(status?: string): WorkflowStatus {
  switch (status) {
    case 'queued':
    case 'starting':
    case 'running':
    case 'cancelling':
    case 'completed':
    case 'failed':
    case 'cancelled':
      return status
    default:
      return 'completed'
  }
}

function getQueueStateFromRun(run: RuntimeWorkflowRun) {
  if (typeof run.queue_position === 'number' || typeof run.blocking_execution_count === 'number' || typeof run.queue_message === 'string') {
    return {
      queuePosition: typeof run.queue_position === 'number' ? run.queue_position : undefined,
      blockingExecutionCount: typeof run.blocking_execution_count === 'number' ? run.blocking_execution_count : undefined,
      queueMessage: typeof run.queue_message === 'string' ? run.queue_message : undefined,
    }
  }

  const events = Array.isArray(run.events_payload) ? run.events_payload : []
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const entry = events[index]
    if (entry?.event === 'queued' || entry?.event === 'queue_status') {
      return {
        queuePosition: typeof entry.data?.queue_position === 'number' ? entry.data.queue_position : undefined,
        blockingExecutionCount: typeof entry.data?.blocking_execution_count === 'number' ? entry.data.blocking_execution_count : undefined,
        queueMessage: typeof entry.data?.message === 'string' ? entry.data.message : undefined,
      }
    }
    if (entry?.event === 'run_started' || entry?.event === 'complete' || entry?.event === 'run_completed' || entry?.event === 'run_failed' || entry?.event === 'error' || entry?.event === 'cancelled') {
      break
    }
  }

  return {
    queuePosition: undefined,
    blockingExecutionCount: undefined,
    queueMessage: undefined,
  }
}

function setAndPersist(
  set: WorkflowSet,
  get: WorkflowGet,
  updater: WorkflowSetState,
) {
  set(updater)
  persistExecutionPointers(get().executionOrder)
}

function collectArtifactImageUrls(source: {
  content_url?: string | null
  signed_url?: string | null
  preview_url?: string | null
  live_url?: string | null
}): string[] {
  const deduped = new Set<string>()
  for (const candidate of [source.content_url, source.signed_url, source.preview_url, source.live_url]) {
    if (typeof candidate !== 'string') continue
    const normalized = candidate.trim()
    if (!normalized) continue
    deduped.add(normalized)
  }
  return Array.from(deduped)
}

function mergeImageUrls(...collections: Array<Array<string | undefined> | undefined>): string[] {
  const deduped = new Set<string>()
  for (const collection of collections) {
    if (!collection) continue
    for (const candidate of collection) {
      if (typeof candidate !== 'string') continue
      const normalized = candidate.trim()
      if (!normalized) continue
      deduped.add(normalized)
    }
  }
  return Array.from(deduped)
}

function buildActionNodeImageState(source: {
  content_url?: string | null
  signed_url?: string | null
  preview_url?: string | null
  live_url?: string | null
}) {
  const imageUrls = collectArtifactImageUrls(source)
  return {
    imageUrls,
    screenshot: imageUrls[0],
  }
}

function buildActionNodeFromArtifact(artifact: Record<string, unknown>): ActionNode | null {
  const artifactId = typeof artifact.artifact_id === 'string' ? artifact.artifact_id : null
  const stepId = typeof artifact.step_id === 'string' ? artifact.step_id : 'unknown'
  const capturedAt = typeof artifact.captured_at === 'string' ? artifact.captured_at : new Date().toISOString()
  const imageState = buildActionNodeImageState({
    content_url: typeof artifact.content_url === 'string' ? artifact.content_url : null,
    signed_url: typeof artifact.signed_url === 'string' ? artifact.signed_url : null,
    preview_url: typeof artifact.preview_url === 'string' ? artifact.preview_url : null,
    live_url: typeof artifact.live_url === 'string' ? artifact.live_url : null,
  })

  if (!artifactId && !imageState.screenshot) return null

  return {
    id: artifactId || `artifact-${stepId}-${capturedAt}`,
    time: new Date(capturedAt).toLocaleTimeString('zh-CN', {hour12: false}),
    action: `截图(${typeof artifact.capture_phase === 'string' ? artifact.capture_phase : 'after_action'})`,
    screenshot: imageState.screenshot,
    imageUrls: imageState.imageUrls,
    stepId,
    artifactId: artifactId || undefined,
    contentUrl: typeof artifact.content_url === 'string' ? artifact.content_url : undefined,
    persisted: Boolean(artifact.content_url || artifact.signed_url || artifact.storage_key),
  }
}

function mapRuntimeRunToExecution(run: RuntimeWorkflowRun): WorkflowExecution {
  const stepsPayload = run.steps || {}
  const stepOrder = Array.isArray(run.step_order) && run.step_order.length > 0
    ? run.step_order
    : Object.keys(stepsPayload)

  const steps: StepState[] = stepOrder.map((stepId) => {
    const raw = stepsPayload[stepId] || {}
    return {
      id: stepId,
      nameZh: typeof raw.name_zh === 'string' ? raw.name_zh : stepId,
      status: normalizeStepStatus(typeof raw.status === 'string' ? raw.status : undefined),
      error: typeof raw.error === 'string' ? raw.error : undefined,
      platform: typeof raw.platform === 'string' ? raw.platform : undefined,
    }
  })

  const currentStepIndex = Math.max(steps.findIndex((step) => step.status === 'running'), 0)
  const artifacts = Array.isArray(run.artifacts_detail) ? run.artifacts_detail : []
  const actionNodes = artifacts
    .map(buildActionNodeFromArtifact)
    .filter((item): item is ActionNode => Boolean(item))
  const queueState = getQueueStateFromRun(run)
  const requestAccountIds = Array.from(new Set([
    ...(typeof run.request?.account_id === 'string' ? [run.request.account_id] : []),
    ...Object.values(run.request?.platform_account_ids || {}).filter((value): value is string => typeof value === 'string' && Boolean(value.trim())),
  ]))

  return {
    executionId: run.execution_id,
    workflowId: run.workflow_id,
    workflowName: run.workflow_name || run.workflow_id,
    status: normalizeWorkflowStatus(run.status),
    accountIds: requestAccountIds,
    steps,
    currentStepIndex,
    totalSteps: steps.length,
    accumulatedText: run.accumulated_output || '',
    actionNodes,
    result: run.result,
    error: run.error,
    multiPlatform: Boolean(run.multi_platform),
    currentPlatform: run.current_platform?.platform_name,
    currentPlatformIndex: run.current_platform?.platform_index,
    totalPlatforms: run.current_platform?.total_platforms,
    queuePosition: queueState.queuePosition,
    blockingExecutionCount: queueState.blockingExecutionCount,
    queueMessage: queueState.queueMessage,
  }
}

function cleanupSSE(executionId?: string) {
  if (executionId) {
    const unsubscribe = _unsubscribeSSE.get(executionId)
    if (!unsubscribe) return
    unsubscribe()
    _unsubscribeSSE.delete(executionId)
    return
  }

  for (const unsubscribe of _unsubscribeSSE.values()) {
    unsubscribe()
  }
  _unsubscribeSSE.clear()
}

function updateExecutionActionNodeFromArtifact(node: ActionNode, data: ArtifactEvent): ActionNode {
  const nextUrls = mergeImageUrls(
    collectArtifactImageUrls(data),
    node.imageUrls,
    [node.contentUrl, node.screenshot],
  )

  return {
    ...node,
    screenshot: nextUrls[0] || node.screenshot,
    imageUrls: nextUrls,
    contentUrl: data.content_url || node.contentUrl,
    persisted: Boolean(data.content_url || data.signed_url || data.storage_key || node.persisted),
  }
}

function bindWorkflowSubscription(
  executionId: string,
  set: WorkflowSet,
  get: WorkflowGet,
) {
  cleanupSSE(executionId)

  const updateExecution = (
    updater: (execution: WorkflowExecution) => WorkflowExecution,
  ) => {
    setAndPersist(set, get, (state) => {
      const current = state.executions[executionId]
      if (!current) return state
      return {
        executions: {
          ...state.executions,
          [executionId]: updater(current),
        },
        executionOrder: prioritizeExecution(state.executionOrder, executionId),
      }
    })
  }

  _unsubscribeSSE.set(executionId, subscribeWorkflow(executionId, {
    onRunStarted: (data) => {
      updateExecution((execution) => ({
        ...execution,
        status: execution.status === 'cancelling' ? 'cancelling' : 'running',
        workflowName: data.workflow_name || execution.workflowName,
        queuePosition: undefined,
        blockingExecutionCount: undefined,
        queueMessage: undefined,
      }))
    },

    onWorkflowMeta: (data) => {
      updateExecution((execution) => ({
        ...execution,
        workflowName: data.workflow_name,
        totalSteps: data.steps.length,
        multiPlatform: data.multi_platform,
        steps: data.steps.map((step: StepMeta) => ({
          id: step.id,
          nameZh: step.name_zh,
          status: 'pending' as StepStatus,
          platform: step.platform,
        })),
      }))
    },

    onQueued: (data) => {
      updateExecution((execution) => ({
        ...execution,
        status: 'queued',
        queuePosition: data.queue_position,
        blockingExecutionCount: data.blocking_execution_count,
        queueMessage: data.message,
      }))
    },

    onQueueStatus: (data) => {
      updateExecution((execution) => ({
        ...execution,
        status: 'queued',
        queuePosition: data.queue_position,
        blockingExecutionCount: data.blocking_execution_count,
        queueMessage: data.message,
      }))
    },

    onStepChange: (data) => {
      updateExecution((execution) => {
        const steps = execution.steps.map((step) =>
          step.id === data.step_id
            ? {...step, status: data.status as StepStatus, error: data.error}
            : step,
        )
        const separator = data.status === 'running' ? `\n${'─'.repeat(36)}\n▶ ${data.step_name}\n` : ''
        return {
          ...execution,
          status: data.status === 'failed' ? 'failed' : execution.status === 'cancelling' ? 'cancelling' : 'running',
          queuePosition: undefined,
          blockingExecutionCount: undefined,
          queueMessage: undefined,
          steps,
          currentStepIndex: data.step_index ?? execution.currentStepIndex,
          totalSteps: data.total_steps ?? execution.totalSteps,
          accumulatedText: execution.accumulatedText + separator,
          error: data.status === 'failed' ? data.error : execution.error,
        }
      })
    },

    onProgress: (data) => {
      updateExecution((execution) => ({
        ...execution,
        accumulatedText: execution.accumulatedText + (data.delta || ''),
      }))
    },

    onScreenshot: (data) => {
      updateExecution((execution) => {
        const exists = execution.actionNodes.some((node) => node.artifactId === data.artifact_id || node.screenshot === data.screenshot)
        if (exists) return execution

        const node: ActionNode = {
          id: data.artifact_id || `screenshot-${data.step_id}-${Date.now()}`,
          time: new Date().toLocaleTimeString('zh-CN', {hour12: false}),
          action: data.action || '操作截图',
          screenshot: data.screenshot,
          stepId: data.step_id,
          artifactId: data.artifact_id,
        }
        return {...execution, actionNodes: [...execution.actionNodes, node]}
      })
    },

    onComplete: (data) => {
      updateExecution((execution) => {
        const existingScreenshots = new Set(execution.actionNodes.map((node) => node.screenshot).filter(Boolean))
        const completionNodes: ActionNode[] = (data.screenshots || [])
          .filter((s) => s && !existingScreenshots.has(s))
          .map((s) => ({
            id: `complete-screenshot-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            time: new Date().toLocaleTimeString('zh-CN', {hour12: false}),
            action: '完成截图',
            screenshot: s,
            stepId: 'complete',
          }))

        return {
          ...execution,
          status: 'completed',
          result: data,
          error: undefined,
          queuePosition: undefined,
          blockingExecutionCount: undefined,
          queueMessage: undefined,
          actionNodes: [...execution.actionNodes, ...completionNodes],
        }
      })
      cleanupSSE(executionId)
    },

    onError: (data) => {
      updateExecution((execution) => ({
        ...execution,
        status: 'failed',
        error: data.message,
        queuePosition: undefined,
        blockingExecutionCount: undefined,
        queueMessage: undefined,
      }))
      cleanupSSE(executionId)
    },

    onPlatformChange: (data) => {
      updateExecution((execution) => ({
        ...execution,
        currentPlatform: data.platform_name,
        currentPlatformIndex: data.platform_index,
        totalPlatforms: data.total_platforms,
      }))
    },

    onCancelled: () => {
      updateExecution((execution) => ({
        ...execution,
        status: 'cancelled',
        error: undefined,
        queuePosition: undefined,
        blockingExecutionCount: undefined,
        queueMessage: undefined,
        steps: execution.steps.map((step) =>
          step.status === 'running' ? {...step, status: 'failed', error: _cancelledStepError} : step,
        ),
      }))
      cleanupSSE(executionId)
    },

    onStepRetrying: (data) => {
      updateExecution((execution) => ({
        ...execution,
        accumulatedText:
          execution.accumulatedText
          + `\n[重试] ${data.step_name} -> 第 ${data.attempt} 次尝试`
          + (data.previous_error ? `，原因：${data.previous_error}` : '')
          + '\n',
      }))
    },

    onStepVerified: (data) => {
      updateExecution((execution) => ({
        ...execution,
        accumulatedText:
          execution.accumulatedText
          + `\n[校验] ${data.step_name} -> ${data.verified ? '通过' : '失败'}`
          + (data.error_code ? ` (${data.error_code})` : '')
          + (data.message ? `：${data.message}` : '')
          + '\n',
      }))
    },

    onHandoffRequired: (data) => {
      updateExecution((execution) => ({
        ...execution,
        status: 'failed',
        error: `登录态已失效。请前往「平台和账号配置」先执行“重新验证”；若仍失败，再执行“重新绑定”后重试当前工作流。（步骤：${data.step_name}）`,
        accumulatedText:
          execution.accumulatedText
          + `\n[需要重新登录] ${data.step_name} -> ${data.reason}`
          + (data.error_code ? ` (${data.error_code})` : '')
          + '\n',
      }))
      cleanupSSE(executionId)
    },

    onArtifactCreated: (data) => {
      updateExecution((execution) => {
        const exists = execution.actionNodes.some((node) => node.artifactId === data.artifact_id)
        if (exists) return execution

        const imageState = buildActionNodeImageState(data)
        const node: ActionNode = {
          id: data.artifact_id,
          time: new Date(data.captured_at).toLocaleTimeString('zh-CN', {hour12: false}),
          action: `截图(${data.capture_phase})`,
          screenshot: imageState.screenshot,
          imageUrls: imageState.imageUrls,
          stepId: data.step_id,
          artifactId: data.artifact_id,
          contentUrl: data.content_url,
          persisted: Boolean(data.content_url || data.signed_url || data.storage_key),
        }
        return {...execution, actionNodes: [...execution.actionNodes, node]}
      })
    },

    onArtifactPersisted: (data) => {
      updateExecution((execution) => ({
        ...execution,
        actionNodes: execution.actionNodes.map((node) =>
          node.artifactId === data.artifact_id
            ? updateExecutionActionNodeFromArtifact(node, data)
            : node,
        ),
      }))
    },
  }))
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  executions: {},
  executionOrder: [],
  backendReady: false,

  setBackendReady: (ready) => set({backendReady: ready}),

  restoreExecution: async () => {
    const storedExecutionIds = readStoredExecutionIds()
    if (storedExecutionIds.length === 0) return

    const restoredEntries = await Promise.all(storedExecutionIds.map(async (executionId) => {
      try {
        const run = await getWorkflowRun(executionId) as unknown as RuntimeWorkflowRun
        return {executionId, execution: mapRuntimeRunToExecution(run)}
      } catch (error) {
        if (error instanceof Error && error.message.includes('(404)')) {
          return {executionId, execution: null}
        }
        console.error('恢复工作流执行失败', executionId, error)
        return null
      }
    }))

    setAndPersist(set, get, (state) => {
      const nextExecutions = {...state.executions}
      let nextOrder = [...state.executionOrder]

      for (const entry of restoredEntries) {
        if (!entry) continue
        if (!entry.execution) {
          delete nextExecutions[entry.executionId]
          nextOrder = nextOrder.filter((id) => id !== entry.executionId)
          continue
        }

        nextExecutions[entry.executionId] = entry.execution
        nextOrder = prioritizeExecution(nextOrder, entry.executionId)
      }

      nextOrder = nextOrder.filter((id) => Boolean(nextExecutions[id]))
      return {
        executions: nextExecutions,
        executionOrder: nextOrder,
      }
    })

    for (const entry of restoredEntries) {
      if (!entry?.execution) continue
      if (entry.execution.status === 'queued' || entry.execution.status === 'starting' || entry.execution.status === 'running' || entry.execution.status === 'cancelling') {
        bindWorkflowSubscription(entry.executionId, set, get)
      }
    }
  },

  startWorkflow: async (req) => {
    const {data: sessionData} = await supabase.auth.getSession()
    const authToken = sessionData?.session?.access_token
    const reqWithAuth: WorkflowStartRequest = authToken ? {...req, supabase_auth_token: authToken} : req
    const response = await apiStartWorkflow(reqWithAuth)
    const executionId = response.execution_id

    const optimisticExecution: WorkflowExecution = {
      executionId,
      workflowId: req.workflow_id,
      workflowName: req.workflow_id,
      status: normalizeWorkflowStatus(response.status),
      accountIds: Array.from(new Set([
        ...(typeof req.account_id === 'string' ? [req.account_id] : []),
        ...Object.values(req.platform_account_ids || {}).filter((value): value is string => typeof value === 'string' && Boolean(value.trim())),
      ])),
      steps: [],
      currentStepIndex: 0,
      totalSteps: 0,
      accumulatedText: '',
      actionNodes: [],
      queuePosition: response.queued ? response.queue_position : undefined,
      blockingExecutionCount: response.queued ? response.blocking_execution_count : undefined,
      queueMessage: response.queued ? response.message : undefined,
    }

    setAndPersist(set, get, (state) => ({
      executions: {
        ...state.executions,
        [executionId]: optimisticExecution,
      },
      executionOrder: prioritizeExecution(state.executionOrder, executionId),
    }))

    bindWorkflowSubscription(executionId, set, get)
    return executionId
  },

  cancelWorkflow: (executionId) => {
    const execution = get().executions[executionId]
    if (!execution) return
    const rollbackStatus = execution.status === 'queued'
      ? 'queued'
      : execution.status === 'starting'
        ? 'starting'
        : 'running'

    setAndPersist(set, get, (state) => {
      const current = state.executions[executionId]
      if (!current) return state
      return {
        executions: {
          ...state.executions,
          [executionId]: {
            ...current,
            status: current.status === 'cancelled' ? 'cancelled' : 'cancelling',
            error: undefined,
          },
        },
        executionOrder: prioritizeExecution(state.executionOrder, executionId),
      }
    })

    apiCancelWorkflow(executionId).catch((error) => {
      console.error(error)
      setAndPersist(set, get, (state) => {
        const current = state.executions[executionId]
        if (!current || current.status === 'cancelled') return state
        return {
          executions: {
            ...state.executions,
            [executionId]: {
              ...current,
              status: rollbackStatus,
              error: '取消请求失败，请稍后刷新确认状态。',
            },
          },
          executionOrder: prioritizeExecution(state.executionOrder, executionId),
        }
      })
    })
  },

  clearExecution: (executionId) => {
    if (!executionId) {
      cleanupSSE()
      setAndPersist(set, get, {executions: {}, executionOrder: []})
      return
    }

    cleanupSSE(executionId)
    setAndPersist(set, get, (state) => {
      if (!state.executions[executionId]) return state
      const nextExecutions = {...state.executions}
      delete nextExecutions[executionId]
      return {
        executions: nextExecutions,
        executionOrder: state.executionOrder.filter((id) => id !== executionId),
      }
    })
  },
}))
