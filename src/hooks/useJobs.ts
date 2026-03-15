import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Job, JobInsert, JobUpdate } from '@/types/database'

interface UseJobsFilters {
  status?: string
  search?: string
}

export function useJobs(filters?: UseJobsFilters) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase.from('jobs').select('*').order('created_at', { ascending: false })

      if (filters?.status) {
        query = query.eq('status', filters.status)
      }
      if (filters?.search) {
        query = query.ilike('title', `%${filters.search}%`)
      }

      const { data, error: fetchError } = await query

      if (fetchError) throw fetchError
      setJobs((data as Job[]) || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch jobs')
      setJobs([])
    } finally {
      setLoading(false)
    }
  }, [filters?.status, filters?.search])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  const createJob = useCallback(
    async (jobData: Omit<JobInsert, 'tenant_id' | 'created_by'>) => {
      if (!user?.tenantId || !user?.id) throw new Error('Not authenticated')

      const { data, error: insertError } = await supabase
        .from('jobs')
        .insert({ ...jobData, tenant_id: user.tenantId, created_by: user.id })
        .select()
        .single()

      if (insertError) throw insertError
      setJobs((prev) => [data as Job, ...prev])
      return data as Job
    },
    [user]
  )

  const updateJob = useCallback(async (id: string, updates: JobUpdate) => {
    const { data, error: updateError } = await supabase
      .from('jobs')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError
    setJobs((prev) => prev.map((j) => (j.id === id ? (data as Job) : j)))
    return data as Job
  }, [])

  const deleteJob = useCallback(async (id: string) => {
    const { error: deleteError } = await supabase.from('jobs').delete().eq('id', id)
    if (deleteError) throw deleteError
    setJobs((prev) => prev.filter((j) => j.id !== id))
  }, [])

  return { jobs, loading, error, createJob, updateJob, deleteJob, refetch: fetchJobs }
}
