import {useCallback, useEffect, useState} from 'react'
import {supabase} from '@/lib/supabase'
import {useAuth} from '@/contexts/AuthContext'
import {cancelWorkflow as cancelWorkflowExecution} from '@/services/workflowService'
import type {AutomationTask} from '@/types/database'

// 超过此时长仍处于 running 状态的任务视为超时（单位 ms）
const STALE_RUNNING_MS = 30 * 60 * 1000 // 30 minutes
// 轮询间隔：有 running 任务时每 30s 重新拉取一次
const POLL_INTERVAL_MS = 30 * 1000

interface UseAutomationTasksFilters {
  status?: string
  type?: string
  jobId?: string
}

type AutomationTaskInsert = Omit<
  AutomationTask,
  'id' | 'progress' | 'created_at' | 'updated_at'
>

export function useAutomationTasks(filters?: UseAutomationTasksFilters) {
  const [tasks, setTasks] = useState<AutomationTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('automation_tasks')
        .select('*')
        .order('created_at', { ascending: false })

      if (filters?.status) {
        query = query.eq('status', filters.status)
      }
      if (filters?.type) {
        query = query.eq('type', filters.type)
      }
      if (filters?.jobId) {
        query = query.eq('job_id', filters.jobId)
      }

      const { data, error: fetchError } = await query
      if (fetchError) throw fetchError

      const allTasks = (data as AutomationTask[]) || []

      // 自动将长时间卡在 running 状态的任务标记为 failed
      const now = Date.now()
      const staleTasks = allTasks.filter(
        (t) => t.status === 'running' && (now - new Date(t.updated_at).getTime()) > STALE_RUNNING_MS,
      )
      if (staleTasks.length > 0) {
        const staleIds = staleTasks.map((t) => t.id)
        await supabase
          .from('automation_tasks')
          .update({
            status: 'failed',
            error_message: '任务超时：执行超过30分钟未响应，可能已异常终止',
            completed_at: new Date().toISOString(),
          })
          .in('id', staleIds)
        const fixedTasks = allTasks.map((t) =>
          staleIds.includes(t.id)
            ? {...t, status: 'failed' as const, error_message: '任务超时：执行超过30分钟未响应，可能已异常终止'}
            : t,
        )
        setTasks(fixedTasks)
      } else {
        setTasks(allTasks)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks')
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [filters?.status, filters?.type, filters?.jobId])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  // 当有 running 任务时，每 30s 自动刷新一次，确保状态变更及时反映
  useEffect(() => {
    const hasRunning = tasks.some((t) => t.status === 'running')
    if (!hasRunning) return
    const timer = setInterval(fetchTasks, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [tasks, fetchTasks])

  const createTask = useCallback(
    async (taskData: Omit<AutomationTaskInsert, 'tenant_id' | 'created_by'>) => {
      if (!user?.tenantId || !user?.id) throw new Error('Not authenticated')

      const { data, error: insertError } = await supabase
        .from('automation_tasks')
        .insert({ ...taskData, tenant_id: user.tenantId, created_by: user.id })
        .select()
        .single()

      if (insertError) throw insertError
      setTasks((prev) => [data as AutomationTask, ...prev])
      return data as AutomationTask
    },
    [user]
  )

  const updateTaskStatus = useCallback(
    async (id: string, status: AutomationTask['status']) => {
      const updates: Partial<AutomationTask> = { status }
      if (status === 'running') {
        updates.started_at = new Date().toISOString()
      } else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        updates.completed_at = new Date().toISOString()
        if (status === 'completed') updates.progress = 100
      }

      const { data, error: updateError } = await supabase
        .from('automation_tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError
      setTasks((prev) => prev.map((t) => (t.id === id ? (data as AutomationTask) : t)))
      return data as AutomationTask
    },
    []
  )

  const cancelTask = useCallback(
    async (id: string) => {
      const currentTask = tasks.find((t) => t.id === id)
      if (!currentTask) throw new Error('Task not found')

      if (currentTask.execution_id) {
        try {
          await cancelWorkflowExecution(currentTask.execution_id)
        } catch (err) {
          console.warn('取消后端工作流失败，继续同步前端任务状态', err)
        }
      }

      const updates: Partial<AutomationTask> = {
        status: 'cancelled',
        error_message: currentTask.error_message || '用户取消',
        completed_at: new Date().toISOString(),
      }

      const { data, error: updateError } = await supabase
        .from('automation_tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError
      setTasks((prev) => prev.map((t) => (t.id === id ? (data as AutomationTask) : t)))
      return data as AutomationTask
    },
    [tasks]
  )

  return { tasks, loading, error, createTask, updateTaskStatus, cancelTask, refetch: fetchTasks }
}
