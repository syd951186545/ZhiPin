import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export interface DashboardStats {
  activeJobs: number
  totalCandidates: number
  interviewsScheduled: number
  automatedActions: number
}

const MOCK_STATS: DashboardStats = {
  activeJobs: 12,
  totalCandidates: 187,
  interviewsScheduled: 8,
  automatedActions: 34,
}

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats>(MOCK_STATS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      setLoading(true)
      try {
        // Fetch all counts in parallel
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

        // Check if any query errored (likely means Supabase is not configured)
        if (jobsRes.error || candidatesRes.error || interviewsRes.error || tasksRes.error) {
          throw new Error('Supabase query failed')
        }

        setStats({
          activeJobs: jobsRes.count ?? 0,
          totalCandidates: candidatesRes.count ?? 0,
          interviewsScheduled: interviewsRes.count ?? 0,
          automatedActions: tasksRes.count ?? 0,
        })
      } catch {
        // Use mock data as fallback
        setStats(MOCK_STATS)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  return { stats, loading }
}
