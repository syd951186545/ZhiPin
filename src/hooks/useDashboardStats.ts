import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export interface DashboardStats {
  activeJobs: number
  totalCandidates: number
  interviewsScheduled: number
  automatedActions: number
}

const EMPTY_STATS: DashboardStats = {
  activeJobs: 0,
  totalCandidates: 0,
  interviewsScheduled: 0,
  automatedActions: 0,
}

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStats() {
      setLoading(true)
      setError(null)
      try {
        const [jobsRes, candidatesRes, interviewsRes, tasksRes] = await Promise.all([
          supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'active'),
          supabase.from('candidates').select('id', { count: 'exact', head: true }),
          supabase
            .from('candidates')
            .select('id', { count: 'exact', head: true })
            .eq('stage', 'interview'),
          supabase
            .from('automation_tasks')
            .select('id', { count: 'exact', head: true })
            .in('status', ['completed', 'running']),
        ])

        if (jobsRes.error || candidatesRes.error || interviewsRes.error || tasksRes.error) {
          throw new Error('Failed to fetch dashboard stats')
        }

        setStats({
          activeJobs: jobsRes.count ?? 0,
          totalCandidates: candidatesRes.count ?? 0,
          interviewsScheduled: interviewsRes.count ?? 0,
          automatedActions: tasksRes.count ?? 0,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch stats')
        setStats(EMPTY_STATS)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  return { stats, loading, error }
}
