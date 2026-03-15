import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { AutomationTask } from '@/types/database'

interface UseAutomationTasksFilters {
  status?: string
  type?: string
  jobId?: string
}

type AutomationTaskInsert = Omit<
  AutomationTask,
  'id' | 'progress' | 'created_at' | 'updated_at'
>

const MOCK_TASKS: AutomationTask[] = [
  {
    id: 'task_mock_1',
    tenant_id: 'tenant_dev_1',
    created_by: 'usr_dev_1',
    job_id: 'job_mock_1',
    type: 'auto_publish',
    name: '自动发布"前端开发工程师"到BOSS直聘',
    status: 'completed',
    config: { platforms: ['boss_zhipin'], refresh_interval: 24 },
    platform: 'boss_zhipin',
    progress: 100,
    result_summary: { jobs_posted: 1 },
    error_message: null,
    started_at: '2026-03-10T08:00:00Z',
    completed_at: '2026-03-10T08:02:30Z',
    created_at: '2026-03-10T07:59:00Z',
    updated_at: '2026-03-10T08:02:30Z',
  },
  {
    id: 'task_mock_2',
    tenant_id: 'tenant_dev_1',
    created_by: 'usr_dev_1',
    job_id: 'job_mock_2',
    type: 'resume_screen',
    name: '智能筛选"Java后端工程师"候选人简历',
    status: 'running',
    config: { min_match_score: 70, auto_reject_below: 40 },
    platform: null,
    progress: 65,
    result_summary: { resumes_screened: 28, match_rate: 0.43 },
    error_message: null,
    started_at: '2026-03-14T06:00:00Z',
    completed_at: null,
    created_at: '2026-03-14T05:58:00Z',
    updated_at: '2026-03-14T09:30:00Z',
  },
  {
    id: 'task_mock_3',
    tenant_id: 'tenant_dev_1',
    created_by: 'usr_dev_1',
    job_id: 'job_mock_3',
    type: 'auto_source',
    name: '自动搜索产品经理人才（BOSS直聘+领英）',
    status: 'queued',
    config: { platforms: ['boss_zhipin', 'linkedin'], keywords: ['产品经理', 'B端', 'SaaS'], max_results: 50 },
    platform: null,
    progress: 0,
    result_summary: null,
    error_message: null,
    started_at: null,
    completed_at: null,
    created_at: '2026-03-14T10:00:00Z',
    updated_at: '2026-03-14T10:00:00Z',
  },
]

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
      setTasks((data as AutomationTask[]) || [])
    } catch {
      // Fallback to mock data
      let filtered = [...MOCK_TASKS]
      if (filters?.status) {
        filtered = filtered.filter((t) => t.status === filters.status)
      }
      if (filters?.type) {
        filtered = filtered.filter((t) => t.type === filters.type)
      }
      if (filters?.jobId) {
        filtered = filtered.filter((t) => t.job_id === filters.jobId)
      }
      setTasks(filtered)
      setError(null)
    } finally {
      setLoading(false)
    }
  }, [filters?.status, filters?.type, filters?.jobId])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const createTask = useCallback(
    async (taskData: Omit<AutomationTaskInsert, 'tenant_id' | 'created_by'>) => {
      try {
        const tenantId = user?.tenantId || 'tenant_dev_1'
        const userId = user?.id || 'usr_dev_1'

        const { data, error: insertError } = await supabase
          .from('automation_tasks')
          .insert({ ...taskData, tenant_id: tenantId, created_by: userId })
          .select()
          .single()

        if (insertError) throw insertError
        setTasks((prev) => [data as AutomationTask, ...prev])
        return data as AutomationTask
      } catch {
        const newTask: AutomationTask = {
          ...taskData,
          id: `task_mock_${Date.now()}`,
          tenant_id: user?.tenantId || 'tenant_dev_1',
          created_by: user?.id || 'usr_dev_1',
          progress: 0,
          result_summary: taskData.result_summary ?? null,
          error_message: taskData.error_message ?? null,
          started_at: taskData.started_at ?? null,
          completed_at: taskData.completed_at ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as AutomationTask
        setTasks((prev) => [newTask, ...prev])
        return newTask
      }
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

      try {
        const { data, error: updateError } = await supabase
          .from('automation_tasks')
          .update(updates)
          .eq('id', id)
          .select()
          .single()

        if (updateError) throw updateError
        setTasks((prev) => prev.map((t) => (t.id === id ? (data as AutomationTask) : t)))
        return data as AutomationTask
      } catch {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === id
              ? ({ ...t, ...updates, updated_at: new Date().toISOString() } as AutomationTask)
              : t
          )
        )
        return null
      }
    },
    []
  )

  return { tasks, loading, error, createTask, updateTaskStatus, refetch: fetchTasks }
}
