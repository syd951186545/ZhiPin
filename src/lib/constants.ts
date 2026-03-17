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
  linkedin: '领英',
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
  '58': { name: '58同城', color: 'bg-orange-500', loginUrl: 'https://passport.58.com/' },
  boss_zhipin: { name: 'BOSS直聘', color: 'bg-cyan-500', loginUrl: 'https://www.zhipin.com/' },
  linkedin: { name: '领英', color: 'bg-blue-600', loginUrl: 'https://www.linkedin.com/login' },
} as const

// 工作类型
export const EMPLOYMENT_TYPE = {
  'full-time': '全职',
  'part-time': '兼职',
  contract: '外包/合同',
  internship: '实习',
} as const

// OpenClaw 默认配置
export const OPENCLAW_DEFAULT_URL = 'http://192.168.3.215:18789'
export const OPENCLAW_DEFAULT_AGENT_ID = 'HR_Juzi'
export const OPENCLAW_REQUEST_TIMEOUT = 15000       // 15秒请求超时
export const OPENCLAW_SSE_TIMEOUT = 300000           // 5分钟 SSE 流式超时
