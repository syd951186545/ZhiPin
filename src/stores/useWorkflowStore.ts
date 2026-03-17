/**
 * 工作流执行状态管理 (Zustand)
 *
 * 管理工作流的执行生命周期，替代 Automation.tsx 中的 useState 逻辑。
 * 通过 SSE 订阅后端进度并更新状态。
 */

import {create} from 'zustand'
import {
  startWorkflow as apiStartWorkflow,
  cancelWorkflow as apiCancelWorkflow,
  subscribeWorkflow,
  type WorkflowId,
  type WorkflowStartRequest,
  type StepMeta,
  type CompleteEvent,
} from '@/services/workflowService'

// ── 类型定义 ─────────────────────────────────────────────

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
  // 多平台
  multiPlatform?: boolean
  currentPlatform?: string
  currentPlatformIndex?: number
  totalPlatforms?: number
}

interface WorkflowStore {
  // 当前活跃的执行
  activeExecution: WorkflowExecution | null
  // 上一次完成的执行（用于显示结果）
  lastExecution: WorkflowExecution | null
  // 后端是否可用
  backendReady: boolean

  // Actions
  startWorkflow: (req: WorkflowStartRequest) => Promise<void>
  cancelWorkflow: () => void
  clearExecution: () => void
  setBackendReady: (ready: boolean) => void
}

// ── SSE 取消函数引用 ─────────────────────────────────────
let _unsubscribeSSE: (() => void) | null = null

// ── Store ────────────────────────────────────────────────

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  activeExecution: null,
  lastExecution: null,
  backendReady: false,

  setBackendReady: (ready) => set({backendReady: ready}),

  startWorkflow: async (req) => {
    // 清理上次订阅
    if (_unsubscribeSSE) {
      _unsubscribeSSE()
      _unsubscribeSSE = null
    }

    // 初始化执行状态
    set({
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
    })

    try {
      // 调用后端 API
      const executionId = await apiStartWorkflow(req)

      set((state) => ({
        activeExecution: state.activeExecution
          ? {...state.activeExecution, executionId, status: 'running'}
          : null,
      }))

      // 订阅 SSE 进度
      _unsubscribeSSE = subscribeWorkflow(executionId, {
        onWorkflowMeta: (data) => {
          set((state) => {
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
          set((state) => {
            if (!state.activeExecution) return state
            const steps = state.activeExecution.steps.map((s) =>
              s.id === data.step_id
                ? {...s, status: data.status as StepStatus, error: data.error}
                : s,
            )
            return {
              activeExecution: {
                ...state.activeExecution,
                steps,
                currentStepIndex: data.step_index ?? state.activeExecution.currentStepIndex,
                totalSteps: data.total_steps ?? state.activeExecution.totalSteps,
              },
            }
          })
        },

        onProgress: (data) => {
          set((state) => {
            if (!state.activeExecution) return state
            return {
              activeExecution: {
                ...state.activeExecution,
                accumulatedText: data.accumulated_text || state.activeExecution.accumulatedText,
              },
            }
          })
        },

        onScreenshot: (data) => {
          set((state) => {
            if (!state.activeExecution) return state
            const node: ActionNode = {
              id: `${data.step_id}-${Date.now()}`,
              time: new Date().toLocaleTimeString('zh-CN', {hour12: false}),
              action: data.action || '操作截图',
              screenshot: data.screenshot,
              stepId: data.step_id,
            }
            return {
              activeExecution: {
                ...state.activeExecution,
                actionNodes: [...state.activeExecution.actionNodes, node],
              },
            }
          })
        },

        onComplete: (data) => {
          set((state) => {
            if (!state.activeExecution) return state
            const completed: WorkflowExecution = {
              ...state.activeExecution,
              status: 'completed',
              result: data,
            }
            return {
              activeExecution: null,
              lastExecution: completed,
            }
          })
          _cleanupSSE()
        },

        onError: (data) => {
          set((state) => {
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
          _cleanupSSE()
        },

        onPlatformChange: (data) => {
          set((state) => {
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
          set((state) => {
            if (!state.activeExecution) return state
            const cancelled: WorkflowExecution = {
              ...state.activeExecution,
              status: 'cancelled',
            }
            return {
              activeExecution: null,
              lastExecution: cancelled,
            }
          })
          _cleanupSSE()
        },
      })
    } catch (err) {
      set((state) => ({
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
    if (exec?.executionId) {
      apiCancelWorkflow(exec.executionId).catch(console.error)
    }
  },

  clearExecution: () => {
    _cleanupSSE()
    set({activeExecution: null, lastExecution: null})
  },
}))

function _cleanupSSE() {
  if (_unsubscribeSSE) {
    _unsubscribeSSE()
    _unsubscribeSSE = null
  }
}
