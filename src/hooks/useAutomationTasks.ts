import {useCallback, useEffect, useState} from 'react'
import {supabase} from '@/lib/supabase'
import {useAuth} from '@/contexts/AuthContext'
import type {AutomationTask} from '@/types/database'

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
      setTasks((data as AutomationTask[]) || [])
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

  return { tasks, loading, error, createTask, updateTaskStatus, refetch: fetchTasks }
}
