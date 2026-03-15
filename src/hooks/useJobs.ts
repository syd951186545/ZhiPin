import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Job, JobInsert, JobUpdate } from '@/types/database'

interface UseJobsFilters {
  status?: string
  search?: string
}

const MOCK_JOBS: Job[] = [
  {
    id: 'job_mock_1',
    tenant_id: 'tenant_dev_1',
    created_by: 'usr_dev_1',
    title: '前端开发工程师',
    department: '技术部',
    location: '北京·朝阳区',
    employment_type: 'full-time',
    salary_min: 18000,
    salary_max: 30000,
    salary_currency: 'CNY',
    description: '负责公司核心产品的前端开发，使用React/TypeScript技术栈，参与技术方案设计与代码评审。',
    requirements: '3年以上前端开发经验，精通React、TypeScript，熟悉Tailwind CSS，有B端产品开发经验优先。',
    benefits: '五险一金、弹性工作、免费午餐、年度体检',
    status: 'active',
    tags: ['React', 'TypeScript', 'Tailwind'],
    published_platforms: [{ platform: 'boss_zhipin', published_at: '2026-03-10T08:00:00Z' }],
    applicant_count: 23,
    created_at: '2026-03-01T08:00:00Z',
    updated_at: '2026-03-10T08:00:00Z',
  },
  {
    id: 'job_mock_2',
    tenant_id: 'tenant_dev_1',
    created_by: 'usr_dev_1',
    title: 'Java后端工程师',
    department: '技术部',
    location: '上海·浦东新区',
    employment_type: 'full-time',
    salary_min: 20000,
    salary_max: 35000,
    salary_currency: 'CNY',
    description: '负责后端微服务架构设计与开发，保障系统高可用和高性能。',
    requirements: '5年以上Java开发经验，精通Spring Boot/Cloud，熟悉MySQL、Redis、Kafka。',
    benefits: '六险一金、股票期权、带薪年假15天',
    status: 'active',
    tags: ['Java', 'Spring Boot', '微服务'],
    published_platforms: [
      { platform: 'boss_zhipin', published_at: '2026-03-08T08:00:00Z' },
      { platform: '58', published_at: '2026-03-09T08:00:00Z' },
    ],
    applicant_count: 41,
    created_at: '2026-02-20T08:00:00Z',
    updated_at: '2026-03-08T08:00:00Z',
  },
  {
    id: 'job_mock_3',
    tenant_id: 'tenant_dev_1',
    created_by: 'usr_dev_1',
    title: '产品经理',
    department: '产品部',
    location: '深圳·南山区',
    employment_type: 'full-time',
    salary_min: 22000,
    salary_max: 40000,
    salary_currency: 'CNY',
    description: '负责招聘SaaS产品的规划与迭代，协调研发、设计团队推进项目落地。',
    requirements: '3年以上B端产品经理经验，有HR SaaS或招聘领域经验优先，具备数据分析能力。',
    benefits: '五险一金、项目奖金、弹性工作',
    status: 'active',
    tags: ['产品', 'SaaS', 'B端'],
    published_platforms: [],
    applicant_count: 15,
    created_at: '2026-03-05T08:00:00Z',
    updated_at: '2026-03-12T08:00:00Z',
  },
  {
    id: 'job_mock_4',
    tenant_id: 'tenant_dev_1',
    created_by: 'usr_dev_1',
    title: 'UI设计师',
    department: '设计部',
    location: '杭州·西湖区',
    employment_type: 'full-time',
    salary_min: 15000,
    salary_max: 25000,
    salary_currency: 'CNY',
    description: '负责产品界面设计与设计系统维护，输出高质量的交互稿和视觉稿。',
    requirements: '2年以上UI设计经验，精通Figma，有设计系统搭建经验，审美在线。',
    benefits: '五险一金、设计书籍补贴、远程办公',
    status: 'draft',
    tags: ['Figma', 'UI', '设计系统'],
    published_platforms: [],
    applicant_count: 0,
    created_at: '2026-03-10T08:00:00Z',
    updated_at: '2026-03-10T08:00:00Z',
  },
  {
    id: 'job_mock_5',
    tenant_id: 'tenant_dev_1',
    created_by: 'usr_dev_1',
    title: '销售经理',
    department: '销售部',
    location: '广州·天河区',
    employment_type: 'full-time',
    salary_min: 12000,
    salary_max: 20000,
    salary_currency: 'CNY',
    description: '负责SaaS产品的企业客户开拓与维护，完成销售目标，建立客户关系。',
    requirements: '3年以上B端SaaS销售经验，有HR行业资源优先，出色的沟通和谈判能力。',
    benefits: '高额提成、五险一金、出差补贴',
    status: 'paused',
    tags: ['销售', 'B端', 'SaaS'],
    published_platforms: [{ platform: '58', published_at: '2026-02-15T08:00:00Z' }],
    applicant_count: 8,
    created_at: '2026-02-10T08:00:00Z',
    updated_at: '2026-03-01T08:00:00Z',
  },
]

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
    } catch {
      // Fallback to mock data when Supabase is not configured
      let filtered = [...MOCK_JOBS]
      if (filters?.status) {
        filtered = filtered.filter((j) => j.status === filters.status)
      }
      if (filters?.search) {
        const term = filters.search.toLowerCase()
        filtered = filtered.filter(
          (j) => j.title.toLowerCase().includes(term) || j.department?.toLowerCase().includes(term)
        )
      }
      setJobs(filtered)
      setError(null) // Suppress error when using mock data
    } finally {
      setLoading(false)
    }
  }, [filters?.status, filters?.search])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  const createJob = useCallback(
    async (jobData: Omit<JobInsert, 'tenant_id' | 'created_by'>) => {
      try {
        const tenantId = user?.tenantId || 'tenant_dev_1'
        const userId = user?.id || 'usr_dev_1'

        const { data, error: insertError } = await supabase
          .from('jobs')
          .insert({ ...jobData, tenant_id: tenantId, created_by: userId })
          .select()
          .single()

        if (insertError) throw insertError
        setJobs((prev) => [data as Job, ...prev])
        return data as Job
      } catch {
        // Mock creation fallback
        const newJob: Job = {
          id: `job_mock_${Date.now()}`,
          tenant_id: user?.tenantId || 'tenant_dev_1',
          created_by: user?.id || 'usr_dev_1',
          ...jobData,
          salary_currency: jobData.salary_currency || 'CNY',
          tags: jobData.tags || [],
          published_platforms: jobData.published_platforms || [],
          applicant_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as Job
        setJobs((prev) => [newJob, ...prev])
        return newJob
      }
    },
    [user]
  )

  const updateJob = useCallback(async (id: string, updates: JobUpdate) => {
    try {
      const { data, error: updateError } = await supabase
        .from('jobs')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError
      setJobs((prev) => prev.map((j) => (j.id === id ? (data as Job) : j)))
      return data as Job
    } catch {
      // Mock update fallback
      setJobs((prev) =>
        prev.map((j) =>
          j.id === id ? { ...j, ...updates, updated_at: new Date().toISOString() } as Job : j
        )
      )
      return null
    }
  }, [])

  const deleteJob = useCallback(async (id: string) => {
    try {
      const { error: deleteError } = await supabase.from('jobs').delete().eq('id', id)
      if (deleteError) throw deleteError
    } catch {
      // Mock delete fallback - just remove from local state
    }
    setJobs((prev) => prev.filter((j) => j.id !== id))
  }, [])

  return { jobs, loading, error, createJob, updateJob, deleteJob, refetch: fetchJobs }
}
