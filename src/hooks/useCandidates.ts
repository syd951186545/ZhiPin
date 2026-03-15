import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Candidate, CandidateInsert, CandidateUpdate } from '@/types/database'

interface UseCandidatesFilters {
  stage?: string
  search?: string
  jobId?: string
}

const MOCK_CANDIDATES: Candidate[] = [
  {
    id: 'cand_mock_1',
    tenant_id: 'tenant_dev_1',
    job_id: 'job_mock_1',
    name: '张三',
    email: 'zhangsan@example.com',
    phone: '13800138001',
    source: 'boss_zhipin',
    stage: 'interview',
    ai_match_score: 92,
    ai_analysis: {
      strengths: ['React精通', 'TypeScript经验丰富', '有大型项目经验'],
      weaknesses: ['缺少Node.js后端经验'],
      summary: '优秀的前端候选人，技术栈匹配度高，建议进入终面。',
      recommendation: '强烈推荐',
    },
    notes: '沟通表达清晰，技术基础扎实',
    tags: ['高潜力', '前端'],
    metadata: {},
    created_at: '2026-03-05T08:00:00Z',
    updated_at: '2026-03-12T08:00:00Z',
  },
  {
    id: 'cand_mock_2',
    tenant_id: 'tenant_dev_1',
    job_id: 'job_mock_2',
    name: '李四',
    email: 'lisi@example.com',
    phone: '13800138002',
    source: '58',
    stage: 'screening',
    ai_match_score: 78,
    ai_analysis: {
      strengths: ['Java基础扎实', '有微服务经验'],
      weaknesses: ['项目规模偏小', '缺少分布式系统经验'],
      summary: 'Java基础不错，但大型系统经验不足，建议安排技术面试进一步评估。',
    },
    notes: '',
    tags: ['Java'],
    metadata: {},
    created_at: '2026-03-08T08:00:00Z',
    updated_at: '2026-03-10T08:00:00Z',
  },
  {
    id: 'cand_mock_3',
    tenant_id: 'tenant_dev_1',
    job_id: 'job_mock_1',
    name: '王五',
    email: 'wangwu@example.com',
    phone: '13800138003',
    source: 'direct',
    stage: 'new',
    ai_match_score: 85,
    ai_analysis: {
      strengths: ['全栈能力', 'Vue和React都有经验'],
      weaknesses: ['工作年限偏短'],
      summary: '潜力候选人，技能覆盖面广，值得深入了解。',
    },
    notes: '主动投递，简历内容详实',
    tags: ['全栈'],
    metadata: {},
    created_at: '2026-03-10T08:00:00Z',
    updated_at: '2026-03-10T08:00:00Z',
  },
  {
    id: 'cand_mock_4',
    tenant_id: 'tenant_dev_1',
    job_id: 'job_mock_3',
    name: '赵六',
    email: 'zhaoliu@example.com',
    phone: '13800138004',
    source: 'linkedin',
    stage: 'offer',
    ai_match_score: 95,
    ai_analysis: {
      strengths: ['丰富的B端产品经验', '有HR SaaS行业背景', '数据驱动思维'],
      weaknesses: [],
      summary: '非常优秀的产品经理候选人，行业经验完美匹配。',
      recommendation: '强烈推荐',
    },
    notes: '已通过三轮面试，准备发Offer',
    tags: ['产品', '高优先'],
    metadata: {},
    created_at: '2026-02-28T08:00:00Z',
    updated_at: '2026-03-13T08:00:00Z',
  },
  {
    id: 'cand_mock_5',
    tenant_id: 'tenant_dev_1',
    job_id: 'job_mock_2',
    name: '孙七',
    email: 'sunqi@example.com',
    phone: '13800138005',
    source: 'openclaw_auto',
    stage: 'rejected',
    ai_match_score: 45,
    ai_analysis: {
      strengths: ['学习意愿强'],
      weaknesses: ['经验不足', '技术栈不匹配', '缺少项目经历'],
      summary: '候选人当前水平与职位要求差距较大，建议暂不考虑。',
    },
    notes: 'AI自动筛选未通过',
    tags: [],
    metadata: {},
    created_at: '2026-03-09T08:00:00Z',
    updated_at: '2026-03-09T08:00:00Z',
  },
  {
    id: 'cand_mock_6',
    tenant_id: 'tenant_dev_1',
    job_id: 'job_mock_5',
    name: '周八',
    email: 'zhouba@example.com',
    phone: '13800138006',
    source: 'upload',
    stage: 'hired',
    ai_match_score: 88,
    ai_analysis: {
      strengths: ['出色的销售业绩', '丰富的客户资源', 'SaaS行业经验'],
      weaknesses: ['管理经验有限'],
      summary: '销售能力突出，已成功入职，表现值得期待。',
    },
    notes: '已于3月1日入职',
    tags: ['销售精英', '已入职'],
    metadata: {},
    created_at: '2026-02-15T08:00:00Z',
    updated_at: '2026-03-01T08:00:00Z',
  },
]

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
    } catch {
      // Fallback to mock data
      let filtered = [...MOCK_CANDIDATES]
      if (filters?.stage) {
        filtered = filtered.filter((c) => c.stage === filters.stage)
      }
      if (filters?.jobId) {
        filtered = filtered.filter((c) => c.job_id === filters.jobId)
      }
      if (filters?.search) {
        const term = filters.search.toLowerCase()
        filtered = filtered.filter(
          (c) =>
            c.name.toLowerCase().includes(term) ||
            c.email?.toLowerCase().includes(term) ||
            c.phone?.includes(term)
        )
      }
      setCandidates(filtered)
      setError(null)
    } finally {
      setLoading(false)
    }
  }, [filters?.stage, filters?.search, filters?.jobId])

  useEffect(() => {
    fetchCandidates()
  }, [fetchCandidates])

  const createCandidate = useCallback(
    async (candidateData: Omit<CandidateInsert, 'tenant_id'>) => {
      try {
        const tenantId = user?.tenantId || 'tenant_dev_1'

        const { data, error: insertError } = await supabase
          .from('candidates')
          .insert({ ...candidateData, tenant_id: tenantId })
          .select()
          .single()

        if (insertError) throw insertError
        setCandidates((prev) => [data as Candidate, ...prev])
        return data as Candidate
      } catch {
        const newCandidate: Candidate = {
          ...candidateData,
          id: `cand_mock_${Date.now()}`,
          tenant_id: user?.tenantId || 'tenant_dev_1',
          ai_match_score: candidateData.ai_match_score ?? null,
          ai_analysis: candidateData.ai_analysis ?? null,
          tags: candidateData.tags ?? [],
          metadata: candidateData.metadata ?? {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as Candidate
        setCandidates((prev) => [newCandidate, ...prev])
        return newCandidate
      }
    },
    [user]
  )

  const updateCandidate = useCallback(async (id: string, updates: CandidateUpdate) => {
    try {
      const { data, error: updateError } = await supabase
        .from('candidates')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError
      setCandidates((prev) => prev.map((c) => (c.id === id ? (data as Candidate) : c)))
      return data as Candidate
    } catch {
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === id
            ? ({ ...c, ...updates, updated_at: new Date().toISOString() } as Candidate)
            : c
        )
      )
      return null
    }
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
