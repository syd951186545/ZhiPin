import type {PlatformCatalogItem} from '@/types/openclaw'

// 职位状态
export const JOB_STATUS = {
  draft: '草稿',
  active: '招聘中',
  paused: '已暂停',
  closed: '已关闭',
} as const

// 候选人阶段
export const CANDIDATE_STAGE = {
  new: '新简历',
  screening: '筛选中',
  interview: '面试中',
  offer: '已发Offer',
  hired: '已入职',
  rejected: '已淘汰',
} as const

// 候选人来源
export const CANDIDATE_SOURCE = {
  direct: '主动投递',
  '58': '58同城',
  boss_zhipin: 'BOSS直聘',
  liepin: '猎聘',
  zhilian: '智联招聘',
  '51job': '前程无忧/51job',
  lagou: '拉勾招聘',
  openclaw_auto: '自动搜索',
  upload: '手动导入',
} as const

// 自动化任务类型
export const TASK_TYPE = {
  publish_job: '发布招聘公告',
  talent_explore: '市场人才探索',
  resume_screen: '简历筛选及AI沟通',
  // 旧类型（向后兼容）
  auto_publish: '自动发布职位',
  auto_source: '自动搜索人才',
  auto_reply: '智能自动沟通',
} as const

// 任务状态
export const TASK_STATUS = {
  queued: '排队中',
  running: '执行中',
  paused: '已暂停',
  completed: '已完成',
  failed: '执行失败',
  cancelled: '已取消',
} as const

// 招聘平台
export const PLATFORMS = {
  '58': { name: '58同城', color: 'bg-orange-500', loginUrl: 'https://passport.58.com/login/?path=http%3A%2F%2Fvip.58.com' },
  boss_zhipin: { name: 'BOSS直聘', color: 'bg-cyan-500', loginUrl: 'https://www.zhipin.com/web/geek/job' },
  liepin: { name: '猎聘', color: 'bg-red-500', loginUrl: 'https://vip.liepin.com/' },
  zhilian: { name: '智联招聘', color: 'bg-blue-600', loginUrl: 'https://i.zhaopin.com/' },
  '51job': { name: '前程无忧/51job', color: 'bg-indigo-500', loginUrl: 'https://ehire.51job.com/' },
  lagou: { name: '拉勾招聘', color: 'bg-emerald-500', loginUrl: 'https://easy.lagou.com/' },
} as const

export const STATIC_PLATFORM_CATALOG: PlatformCatalogItem[] = [
  {
    key: 'boss_zhipin',
    name: 'BOSS直聘',
    enterprise_url: PLATFORMS.boss_zhipin.loginUrl,
    recommended_login_method: 'phone',
    supported_login_methods: ['phone', 'qr'],
    hints: ['建议优先绑定主招聘账号', '执行前优先做一次登录态验证'],
  },
  {
    key: 'zhilian',
    name: '智联招聘',
    enterprise_url: PLATFORMS.zhilian.loginUrl,
    recommended_login_method: 'phone',
    supported_login_methods: ['phone', 'password'],
    hints: ['适合标准岗位批量筛选', '默认登录入口固定为企业端'],
  },
  {
    key: 'liepin',
    name: '猎聘',
    enterprise_url: PLATFORMS.liepin.loginUrl,
    recommended_login_method: 'qr',
    supported_login_methods: ['qr', 'phone'],
    hints: ['优先复用扫码登录态', '适合中高端岗位搜索'],
  },
  {
    key: '58',
    name: '58同城',
    enterprise_url: PLATFORMS['58'].loginUrl,
    recommended_login_method: 'phone',
    supported_login_methods: ['phone', 'password'],
    hints: ['适合蓝领与门店岗位', '建议绑定稳定手机号账号'],
  },
  {
    key: '51job',
    name: '前程无忧/51job',
    enterprise_url: PLATFORMS['51job'].loginUrl,
    recommended_login_method: 'password',
    supported_login_methods: ['password', 'phone'],
    hints: ['企业端入口固定', '优先维护主企业账号密码登录态'],
  },
  {
    key: 'lagou',
    name: '拉勾招聘',
    enterprise_url: PLATFORMS.lagou.loginUrl,
    recommended_login_method: 'phone',
    supported_login_methods: ['phone', 'qr'],
    hints: ['适合互联网岗位筛选', '建议保持单一主账号稳定复用'],
  },
]

// 工作类型
export const EMPLOYMENT_TYPE = {
  'full-time': '全职',
  'part-time': '兼职',
  contract: '外包/合同',
  internship: '实习',
} as const

export const OPENCLAW_SSE_TIMEOUT = 300000           // 5分钟 SSE 流式超时
