import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRealtimeSubscription } from './useRealtimeSubscription'
import type { TaskLog } from '@/types/database'

export function useTaskLogs(taskId: string | undefined) {
  const [logs, setLogs] = useState<TaskLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    if (!taskId) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('task_logs')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })

      if (fetchError) throw fetchError
      setLogs((data as TaskLog[]) || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Subscribe to realtime log inserts
  useRealtimeSubscription<Record<string, unknown>>(
    'task_logs',
    taskId ? `task_id=eq.${taskId}` : undefined,
    (payload) => {
      if (payload.eventType === 'INSERT') {
        setLogs((prev) => [...prev, payload.new as TaskLog])
      }
    },
    { event: 'INSERT' }
  )

  return { logs, loading, error, refetch: fetchLogs }
}
