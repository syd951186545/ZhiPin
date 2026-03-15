import { z } from 'zod'

export const jobFormSchema = z.object({
  title: z.string().min(1, '职位名称不能为空'),
  department: z.string().optional().default(''),
  location: z.string().optional().default(''),
  employment_type: z.enum(['full-time', 'part-time', 'contract', 'internship'], {
    required_error: '请选择工作类型',
  }),
  salary_min: z
    .number({ invalid_type_error: '请输入有效数字' })
    .min(0, '薪资不能为负数')
    .optional()
    .nullable(),
  salary_max: z
    .number({ invalid_type_error: '请输入有效数字' })
    .min(0, '薪资不能为负数')
    .optional()
    .nullable(),
  description: z.string().optional().default(''),
  requirements: z.string().optional().default(''),
}).refine(
  (data) => {
    if (data.salary_min != null && data.salary_max != null) {
      return data.salary_max >= data.salary_min
    }
    return true
  },
  { message: '最高薪资不能低于最低薪资', path: ['salary_max'] }
)

export type JobFormValues = z.infer<typeof jobFormSchema>

export const candidateFormSchema = z.object({
  name: z.string().min(1, '姓名不能为空'),
  email: z
    .string()
    .email('请输入有效的邮箱地址')
    .optional()
    .or(z.literal('')),
  phone: z.string().optional().default(''),
  source: z.enum(['direct', '58', 'boss_zhipin', 'linkedin', 'openclaw_auto', 'upload'], {
    required_error: '请选择来源渠道',
  }),
  notes: z.string().optional().default(''),
})

export type CandidateFormValues = z.infer<typeof candidateFormSchema>

export const loginFormSchema = z.object({
  email: z.string().min(1, '邮箱不能为空').email('请输入有效的邮箱地址'),
  password: z.string().min(6, '密码至少6个字符'),
})

export type LoginFormValues = z.infer<typeof loginFormSchema>

export const registerFormSchema = z.object({
  email: z.string().min(1, '邮箱不能为空').email('请输入有效的邮箱地址'),
  password: z.string().min(6, '密码至少6个字符'),
  name: z.string().min(1, '姓名不能为空'),
  companyName: z.string().min(1, '公司名称不能为空'),
})

export type RegisterFormValues = z.infer<typeof registerFormSchema>
