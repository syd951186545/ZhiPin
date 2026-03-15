import {useCallback, useEffect, useState} from 'react'
import {supabase} from '@/lib/supabase'
import {useAuth} from '@/contexts/AuthContext'
import type {Candidate, CandidateInsert, CandidateUpdate} from '@/types/database'

interface UseCandidatesFilters {
  stage?: string
  search?: string
  jobId?: string
}

export function useCandidates(filters?: UseCandidatesFilters) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  const fetchCandidates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase.from('candidates').select('*').order('created_at', { ascending: false })

      if (filters?.stage) {
        query = query.eq('stage', filters.stage)
      }
      if (filters?.jobId) {
        query = query.eq('job_id', filters.jobId)
      }
      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`)
      }

      const { data, error: fetchError } = await query
      if (fetchError) throw fetchError
      setCandidates((data as Candidate[]) || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch candidates')
      setCandidates([])
    } finally {
      setLoading(false)
    }
  }, [filters?.stage, filters?.search, filters?.jobId])

  useEffect(() => {
    fetchCandidates()
  }, [fetchCandidates])

  const createCandidate = useCallback(
    async (candidateData: Omit<CandidateInsert, 'tenant_id'>) => {
      if (!user?.tenantId) throw new Error('Not authenticated')

      const { data, error: insertError } = await supabase
        .from('candidates')
        .insert({ ...candidateData, tenant_id: user.tenantId })
        .select()
        .single()

      if (insertError) throw insertError
      setCandidates((prev) => [data as Candidate, ...prev])
      return data as Candidate
    },
    [user]
  )

  const updateCandidate = useCallback(async (id: string, updates: CandidateUpdate) => {
    const { data, error: updateError } = await supabase
      .from('candidates')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError
    setCandidates((prev) => prev.map((c) => (c.id === id ? (data as Candidate) : c)))
    return data as Candidate
  }, [])

  const updateStage = useCallback(
    async (id: string, newStage: Candidate['stage']) => {
      return updateCandidate(id, { stage: newStage })
    },
    [updateCandidate]
  )

  return {
    candidates,
    loading,
    error,
    createCandidate,
    updateCandidate,
    updateStage,
    refetch: fetchCandidates,
  }
}
