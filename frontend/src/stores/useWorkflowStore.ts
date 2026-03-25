/**
 * 工作流执行状态管理 (Zustand)
 *
 * 管理工作流的执行生命周期，并在页面刷新后从后端运行态恢复监控数据。
 */

import {create} from 'zustand'
import {supabase} from '@/lib/supabase'
import {
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
export type WorkflowStatus = 'idle' | 'starting' | 'running' | 'completed' | 'failed' | 'cancelled'

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
}

interface RuntimeWorkflowRun {
  execution_id: string
  workflow_id: WorkflowId
  workflow_name?: string
  status?: string
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
  multi_platform?: boolean
}

interface WorkflowStore {
  activeExecution: WorkflowExecution | null
  lastExecution: WorkflowExecution | null
  backendReady: boolean
  startWorkflow: (req: WorkflowStartRequest) => Promise<void>
  cancelWorkflow: () => void
  clearExecution: () => void
  setBackendReady: (ready: boolean) => void
  restoreExecution: () => Promise<void>
}

const EXECUTION_STORAGE_KEY = 'jiling-recruit:last-execution-id'
const _cancelledStepError = '已停止'

let _unsubscribeSSE: (() => void) | null = null

function readStoredExecutionId(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(EXECUTION_STORAGE_KEY)
}

function persistExecutionPointer(activeExecution: WorkflowExecution | null, lastExecution: WorkflowExecution | null) {
  if (typeof window === 'undefined') return
  const executionId = activeExecution?.executionId || lastExecution?.executionId
  if (executionId) {
    window.localStorage.setItem(EXECUTION_STORAGE_KEY, executionId)
    return
  }
  window.localStorage.removeItem(EXECUTION_STORAGE_KEY)
}

function normalizeStepStatus(status?: string): StepStatus {
  if (status === 'running' || status === 'done' || status === 'failed') return status
  return 'pending'
}

function normalizeWorkflowStatus(status?: string): WorkflowStatus {
  switch (status) {
    case 'starting':
    case 'running':
    case 'completed':
    case 'failed':
    case 'cancelled':
      return status
    default:
      return 'completed'
  }
}

function setAndPersist(
  set: Parameters<typeof create<WorkflowStore>>[0],
  get: () => WorkflowStore,
  updater: Parameters<Parameters<typeof create<WorkflowStore>>[0]>[0],
) {
  set(updater)
  const state = get()
  persistExecutionPointer(state.activeExecution, state.lastExecution)
}

function buildActionNodeFromArtifact(artifact: Record<string, unknown>): ActionNode | null {
  const artifactId = typeof artifact.artifact_id === 'string' ? artifact.artifact_id : null
  const stepId = typeof artifact.step_id === 'string' ? artifact.step_id : 'unknown'
  const capturedAt = typeof artifact.captured_at === 'string' ? artifact.captured_at : new Date().toISOString()
  const screenshot =
    typeof artifact.preview_url === 'string' ? artifact.preview_url :
    typeof artifact.live_url === 'string' ? artifact.live_url :
    typeof artifact.signed_url === 'string' ? artifact.signed_url :
    undefined

  if (!artifactId && !screenshot) return null

  return {
    id: artifactId || `artifact-${stepId}-${capturedAt}`,
    time: new Date(capturedAt).toLocaleTimeString('zh-CN', {hour12: false}),
    action: `截图(${typeof artifact.capture_phase === 'string' ? artifact.capture_phase : 'after_action'})`,
    screenshot,
    stepId,
    artifactId: artifactId || undefined,
    contentUrl: typeof artifact.content_url === 'string' ? artifact.content_url : undefined,
    persisted: Boolean(artifact.signed_url || artifact.storage_key),
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

  return {
    executionId: run.execution_id,
    workflowId: run.workflow_id,
    workflowName: run.workflow_name || run.workflow_id,
    status: normalizeWorkflowStatus(run.status),
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
  }
}

function cleanupSSE() {
  if (_unsubscribeSSE) {
    _unsubscribeSSE()
    _unsubscribeSSE = null
  }
}

function bindWorkflowSubscription(
  executionId: string,
  set: Parameters<typeof create<WorkflowStore>>[0],
  get: () => WorkflowStore,
) {
  cleanupSSE()

  _unsubscribeSSE = subscribeWorkflow(executionId, {
    onWorkflowMeta: (data) => {
      setAndPersist(set, get, (state) => {
        if (!state.activeExecution) return state
        return {
          activeExecution: {
            ...state.activeExecution,
            workflowName: data.workflow_name,
            totalSteps: data.steps.length,
            multiPlatform: data.multi_platform,
            steps: data.steps.map((s: StepMeta) => ({
              id: s.id,
              nameZh: s.name_zh,
              status: 'pending' as StepStatus,
              platform: s.platform,
            })),
          },
        }
      })
    },

    onStepChange: (data) => {
      setAndPersist(set, get, (state) => {
        if (!state.activeExecution) return state
        const steps = state.activeExecution.steps.map((s) =>
          s.id === data.step_id
            ? {...s, status: data.status as StepStatus, error: data.error}
            : s,
        )
        const separator = data.status === 'running' ? `\n${'─'.repeat(36)}\n▶ ${data.step_name}\n` : ''
        return {
          activeExecution: {
            ...state.activeExecution,
            steps,
            currentStepIndex: data.step_index ?? state.activeExecution.currentStepIndex,
            totalSteps: data.total_steps ?? state.activeExecution.totalSteps,
            accumulatedText: state.activeExecution.accumulatedText + separator,
          },
        }
      })
    },

    onProgress: (data) => {
      setAndPersist(set, get, (state) => {
        if (!state.activeExecution) return state
        return {
          activeExecution: {
            ...state.activeExecution,
            accumulatedText: state.activeExecution.accumulatedText + (data.delta || ''),
          },
        }
      })
    },

    onScreenshot: (data) => {
      setAndPersist(set, get, (state) => {
        const target = state.activeExecution || state.lastExecution
        if (!target) return state
        const exists = target.actionNodes.some((n) => n.artifactId === data.artifact_id || n.screenshot === data.screenshot)
        if (exists) return state

        const node: ActionNode = {
          id: data.artifact_id || `screenshot-${data.step_id}-${Date.now()}`,
          time: new Date().toLocaleTimeString('zh-CN', {hour12: false}),
          action: data.action || '操作截图',
          screenshot: data.screenshot,
          stepId: data.step_id,
          artifactId: data.artifact_id,
        }
        const updated = {...target, actionNodes: [...target.actionNodes, node]}
        return state.activeExecution ? {activeExecution: updated} : {lastExecution: updated}
      })
    },

    onComplete: (data) => {
      setAndPersist(set, get, (state) => {
        if (!state.activeExecution) return state
        const existingScreenshots = new Set(state.activeExecution.actionNodes.map((n) => n.screenshot).filter(Boolean))
        const completionNodes: ActionNode[] = (data.screenshots || [])
          .filter((s) => s && !existingScreenshots.has(s))
          .map((s) => ({
            id: `complete-screenshot-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            time: new Date().toLocaleTimeString('zh-CN', {hour12: false}),
            action: '完成截图',
            screenshot: s,
            stepId: 'complete',
          }))

        const completed: WorkflowExecution = {
          ...state.activeExecution,
          status: 'completed',
          result: data,
          actionNodes: [...state.activeExecution.actionNodes, ...completionNodes],
        }
        return {
          activeExecution: null,
          lastExecution: completed,
        }
      })
      cleanupSSE()
    },

    onError: (data) => {
      setAndPersist(set, get, (state) => {
        if (!state.activeExecution) return state
        const failed: WorkflowExecution = {
          ...state.activeExecution,
          status: 'failed',
          error: data.message,
        }
        return {
          activeExecution: null,
          lastExecution: failed,
        }
      })
      cleanupSSE()
    },

    onPlatformChange: (data) => {
      setAndPersist(set, get, (state) => {
        if (!state.activeExecution) return state
        return {
          activeExecution: {
            ...state.activeExecution,
            currentPlatform: data.platform_name,
            currentPlatformIndex: data.platform_index,
            totalPlatforms: data.total_platforms,
          },
        }
      })
    },

    onCancelled: () => {
      setAndPersist(set, get, (state) => {
        if (!state.activeExecution) return state
        const cancelled: WorkflowExecution = {
          ...state.activeExecution,
          status: 'cancelled',
          steps: state.activeExecution.steps.map((s) =>
            s.status === 'running' ? {...s, status: 'failed', error: _cancelledStepError} : s,
          ),
        }
        return {
          activeExecution: null,
          lastExecution: cancelled,
        }
      })
      cleanupSSE()
    },

    onStepRetrying: (data) => {
      setAndPersist(set, get, (state) => {
        if (!state.activeExecution) return state
        return {
          activeExecution: {
            ...state.activeExecution,
            accumulatedText:
              state.activeExecution.accumulatedText
              + `\n[重试] ${data.step_name} -> 第 ${data.attempt} 次尝试`
              + (data.previous_error ? `，原因：${data.previous_error}` : '')
              + '\n',
          },
        }
      })
    },

    onStepVerified: (data) => {
      setAndPersist(set, get, (state) => {
        if (!state.activeExecution) return state
        return {
          activeExecution: {
            ...state.activeExecution,
            accumulatedText:
              state.activeExecution.accumulatedText
              + `\n[校验] ${data.step_name} -> ${data.verified ? '通过' : '失败'}`
              + (data.error_code ? ` (${data.error_code})` : '')
              + (data.message ? `：${data.message}` : '')
              + '\n',
          },
        }
      })
    },

    onHandoffRequired: (data) => {
      setAndPersist(set, get, (state) => {
        if (!state.activeExecution) return state
        const handoffError = `登录态已失效，请前往「设置」重新绑定账号后重试。（步骤：${data.step_name}）`
        const handoffExecution: WorkflowExecution = {
          ...state.activeExecution,
          status: 'failed',
          error: handoffError,
          accumulatedText:
            state.activeExecution.accumulatedText
            + `\n[需要重新登录] ${data.step_name} -> ${data.reason}`
            + (data.error_code ? ` (${data.error_code})` : '')
            + '\n',
        }
        return {
          activeExecution: null,
          lastExecution: handoffExecution,
        }
      })
      cleanupSSE()
    },

    onArtifactCreated: (data) => {
      setAndPersist(set, get, (state) => {
        const target = state.activeExecution || state.lastExecution
        if (!target) return state
        const exists = target.actionNodes.some((node) => node.artifactId === data.artifact_id)
        if (exists) return state

        const screenshot = data.preview_url || data.live_url || data.signed_url || undefined
        const node: ActionNode = {
          id: data.artifact_id,
          time: new Date(data.captured_at).toLocaleTimeString('zh-CN', {hour12: false}),
          action: `截图(${data.capture_phase})`,
          screenshot,
          stepId: data.step_id,
          artifactId: data.artifact_id,
          contentUrl: data.content_url,
          persisted: false,
        }
        const updated = {...target, actionNodes: [...target.actionNodes, node]}
        return state.activeExecution ? {activeExecution: updated} : {lastExecution: updated}
      })
    },

    onArtifactPersisted: (data) => {
      setAndPersist(set, get, (state) => {
        const apply = (execution: WorkflowExecution | null): WorkflowExecution | null => {
          if (!execution) return execution
          return {
            ...execution,
            actionNodes: execution.actionNodes.map((node) =>
              node.artifactId === data.artifact_id
                ? {
                    ...node,
                    screenshot: data.preview_url || data.live_url || data.signed_url || node.screenshot,
                    contentUrl: data.content_url || node.contentUrl,
                    persisted: true,
                  }
                : node,
            ),
          }
        }

        return {
          activeExecution: apply(state.activeExecution),
          lastExecution: apply(state.lastExecution),
        }
      })
    },
  })
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  activeExecution: null,
  lastExecution: null,
  backendReady: false,

  setBackendReady: (ready) => set({backendReady: ready}),

  restoreExecution: async () => {
    if (get().activeExecution || get().lastExecution) return

    const executionId = readStoredExecutionId()
    if (!executionId) return

    try {
      const run = await getWorkflowRun(executionId) as RuntimeWorkflowRun
      const restored = mapRuntimeRunToExecution(run)
      const isActive = restored.status === 'starting' || restored.status === 'running'

      setAndPersist(set, get, {
        activeExecution: isActive ? restored : null,
        lastExecution: isActive ? null : restored,
      })

      if (isActive) {
        bindWorkflowSubscription(executionId, set, get)
      }
    } catch (error) {
      console.error('恢复工作流执行失败', error)
      if (error instanceof Error && error.message.includes('(404)')) {
        persistExecutionPointer(null, null)
      }
    }
  },

  startWorkflow: async (req) => {
    cleanupSSE()

    setAndPersist(set, get, {
      activeExecution: {
        executionId: '',
        workflowId: req.workflow_id,
        workflowName: '',
        status: 'starting',
        steps: [],
        currentStepIndex: 0,
        totalSteps: 0,
        accumulatedText: '',
        actionNodes: [],
      },
      lastExecution: null,
    })

    try {
      const {data: sessionData} = await supabase.auth.getSession()
      const authToken = sessionData?.session?.access_token
      const reqWithAuth: WorkflowStartRequest = authToken ? {...req, supabase_auth_token: authToken} : req
      const executionId = await apiStartWorkflow(reqWithAuth)

      if (!get().activeExecution) {
        apiCancelWorkflow(executionId).catch(() => {})
        return
      }

      setAndPersist(set, get, (state) => ({
        activeExecution: state.activeExecution
          ? {...state.activeExecution, executionId, status: 'running'}
          : null,
      }))

      bindWorkflowSubscription(executionId, set, get)
    } catch (err) {
      setAndPersist(set, get, (state) => ({
        activeExecution: null,
        lastExecution: state.activeExecution
          ? {
              ...state.activeExecution,
              status: 'failed' as WorkflowStatus,
              error: err instanceof Error ? err.message : '启动失败',
            }
          : null,
      }))
    }
  },

  cancelWorkflow: () => {
    const exec = get().activeExecution
    if (!exec) return

    if (!exec.executionId) {
      const cancelled: WorkflowExecution = {
        ...exec,
        status: 'cancelled',
      }
      setAndPersist(set, get, {activeExecution: null, lastExecution: cancelled})
      return
    }

    setAndPersist(set, get, {
      activeExecution: null,
      lastExecution: {
        ...exec,
        status: 'cancelled',
        steps: exec.steps.map((s) =>
          s.status === 'running' ? {...s, status: 'failed', error: _cancelledStepError} : s,
        ),
      },
    })
    cleanupSSE()

    apiCancelWorkflow(exec.executionId).catch((err) => {
      console.error(err)
      setAndPersist(set, get, (state) => {
        if (!state.lastExecution || state.lastExecution.executionId !== exec.executionId) {
          return state
        }
        return {
          lastExecution: {
            ...state.lastExecution,
            error: '取消请求失败，请稍后刷新确认状态。',
          },
        }
      })
    })
  },

  clearExecution: () => {
    cleanupSSE()
    setAndPersist(set, get, {activeExecution: null, lastExecution: null})
  },
}))
