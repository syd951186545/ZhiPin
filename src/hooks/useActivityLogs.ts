import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { ActivityLog } from '@/types/database'

export function useActivityLogs(limit = 10) {
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchActivities() {
      setLoading(true)
      setError(null)
      try {
        const { data, error: fetchError } = await supabase
          .from('activity_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit)

        if (fetchError) throw fetchError
        setActivities((data as ActivityLog[]) || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch activities')
        setActivities([])
      } finally {
        setLoading(false)
      }
    }

    fetchActivities()
  }, [limit])

  return { activities, loading, error }
}
