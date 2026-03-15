import type {OpenClawSkill} from '@/types/openclaw'

// ============================================================
// OpenClaw 标准化 Skill 定义 + Prompt 模板
// ============================================================

export const SKILLS: OpenClawSkill[] = [
  // ---- Skill 1: 自动发布职位 ----
  {
    id: 'auto_publish',
    name: 'Auto-Publish Jobs',
    nameZh: '自动发布职位',
    description: 'Login to recruitment platform and publish job postings automatically',
    descriptionZh: '登录招聘平台，自动填写并发布职位信息',
    taskType: 'auto_publish',
    requiredPlatformLogin: true,
    configSchema: {
      platform: {
        type: 'select',
        label: 'Platform',
        labelZh: '目标平台',
        required: true,
        options: [
          { value: 'boss_zhipin', label: 'BOSS直聘' },
          { value: '58', label: '58同城' },
          { value: 'linkedin', label: '领英' },
        ],
      },
      job_id: { type: 'string', label: 'Job ID', labelZh: '职位ID', required: true },
      refresh_interval_hours: { type: 'number', label: 'Refresh Interval (hours)', labelZh: '刷新间隔(小时)', default: 24 },
    },
    promptTemplate: `你是一个专业的招聘助手。请完成以下自动发布职位任务：

【任务目标】
登录{{platform}}平台，发布以下职位信息。

【职位信息】
- 职位名称：{{job_title}}
- 工作地点：{{location}}
- 薪资范围：{{salary_min}}K - {{salary_max}}K
- 工作类型：{{employment_type}}
- 所属部门：{{department}}

【职位描述】
{{description}}

【任职要求】
{{requirements}}

【福利待遇】
{{benefits}}

【操作步骤】
1. 使用已保存的登录凭据进入平台
2. 导航到"发布职位"页面
3. 按照以上信息逐项填写表单
4. 检查填写内容无误后提交发布
5. 确认发布成功并记录职位链接

【注意事项】
- 如遇验证码，等待人工处理
- 所有字段必须完整填写
- 薪资单位按平台要求换算
- 发布后截图保存确认信息`,
  },

  // ---- Skill 2: 简历智能筛选 ----
  {
    id: 'resume_screen',
    name: 'Resume Screening',
    nameZh: '简历智能筛选',
    description: 'AI-powered resume screening against job requirements',
    descriptionZh: '基于AI对简历进行智能筛选和评分',
    taskType: 'resume_screen',
    requiredPlatformLogin: true,
    configSchema: {
      platform: {
        type: 'select',
        label: 'Platform',
        labelZh: '来源平台',
        required: true,
        options: [
          { value: 'boss_zhipin', label: 'BOSS直聘' },
          { value: '58', label: '58同城' },
        ],
      },
      job_id: { type: 'string', label: 'Job ID', labelZh: '职位ID', required: true },
      min_match_score: { type: 'number', label: 'Min Match Score', labelZh: '最低匹配分', default: 60 },
      auto_reject_below: { type: 'number', label: 'Auto-reject Below', labelZh: '自动淘汰分数线', default: 30 },
      max_candidates: { type: 'number', label: 'Max Candidates', labelZh: '最大筛选数量', default: 50 },
    },
    promptTemplate: `你是一个专业的HR简历筛选助手。请根据以下职位要求评估候选人简历。

【职位信息】
- 职位：{{job_title}}
- 部门：{{department}}
- 地点：{{location}}

【职位要求】
{{requirements}}

{{#if ai_system_prompt}}
【额外筛选指令】
{{ai_system_prompt}}
{{/if}}

【筛选标准】
请对每份简历给出以下评估：
1. 匹配度评分（0-100分）
   - 技术能力匹配：占40%
   - 工作经验匹配：占30%
   - 教育背景匹配：占15%
   - 综合素质匹配：占15%
2. 优势分析（3-5条关键优势）
3. 不足分析（1-3条主要不足）
4. 推荐等级：强烈推荐 / 推荐 / 待定 / 不推荐
5. 一句话推荐理由

【自动处理规则】
- 匹配度 ≥ {{min_match_score}} 分：标记为"推荐面试"
- 匹配度 < {{auto_reject_below}} 分：自动标记为"不合适"
- 中间分数段：标记为"待人工复核"

【操作流程】
1. 登录{{platform}}，进入收到的简历列表
2. 逐份查看简历详情
3. 按以上标准进行评估打分
4. 记录评估结果
5. 按规则标记简历状态`,
  },

  // ---- Skill 3: 自动搜索人才 ----
  {
    id: 'auto_source',
    name: 'Talent Sourcing',
    nameZh: '自动搜索人才',
    description: 'Automatically search and collect candidate profiles from recruitment platforms',
    descriptionZh: '自动在招聘平台搜索并采集候选人资料',
    taskType: 'auto_source',
    requiredPlatformLogin: true,
    configSchema: {
      platform: {
        type: 'select',
        label: 'Platform',
        labelZh: '搜索平台',
        required: true,
        options: [
          { value: 'boss_zhipin', label: 'BOSS直聘' },
          { value: '58', label: '58同城' },
          { value: 'linkedin', label: '领英' },
        ],
      },
      keywords: { type: 'string[]', label: 'Keywords', labelZh: '搜索关键词', required: true },
      location: { type: 'string', label: 'Location', labelZh: '工作地点', default: '' },
      experience_years: { type: 'number', label: 'Min Experience (years)', labelZh: '最少经验年限', default: 0 },
      max_results: { type: 'number', label: 'Max Results', labelZh: '最大结果数', default: 30 },
    },
    promptTemplate: `你是一个招聘搜索助手。请在{{platform}}上搜索符合要求的候选人。

【搜索条件】
- 关键词：{{keywords}}
- 工作地点：{{location}}
- 经验要求：{{experience_years}}年以上
- 最多获取：{{max_results}}个结果

【操作步骤】
1. 登录{{platform}}平台
2. 进入人才搜索/简历搜索页面
3. 输入搜索关键词和筛选条件
4. 浏览搜索结果页面

【信息采集】
对于每个候选人，请提取以下信息：
- 姓名（或显示名）
- 当前职位
- 当前公司
- 工作年限
- 最高学历及院校
- 核心技能标签
- 期望薪资（如显示）
- 简历更新时间
- 个人简介/亮点

【输出要求】
- 按相关度从高到低排序
- 标注每个候选人的推荐理由
- 如遇到限制（如日搜索上限），记录已搜索数量并停止

【注意事项】
- 控制操作频率，避免触发平台风控
- 每次翻页间隔3-5秒
- 如遇验证码，暂停等待处理`,
  },

  // ---- Skill 4: 智能自动沟通 ----
  {
    id: 'auto_reply',
    name: 'Auto Reply',
    nameZh: '智能自动沟通',
    description: 'Automatically reply to candidate messages on recruitment platforms',
    descriptionZh: '自动回复招聘平台上候选人的消息',
    taskType: 'auto_reply',
    requiredPlatformLogin: true,
    configSchema: {
      platform: {
        type: 'select',
        label: 'Platform',
        labelZh: '沟通平台',
        required: true,
        options: [
          { value: 'boss_zhipin', label: 'BOSS直聘' },
          { value: '58', label: '58同城' },
        ],
      },
      job_id: { type: 'string', label: 'Job ID', labelZh: '关联职位ID' },
      greeting_template: {
        type: 'string',
        label: 'Greeting Template',
        labelZh: '问候模板',
        default: '您好！感谢您对{{job_title}}职位的关注。我是{{company_name}}的招聘负责人，很高兴能与您沟通。',
      },
      response_style: {
        type: 'select',
        label: 'Response Style',
        labelZh: '沟通风格',
        default: 'professional',
        options: [
          { value: 'professional', label: '专业正式' },
          { value: 'friendly', label: '亲切友好' },
          { value: 'concise', label: '简洁高效' },
        ],
      },
      max_messages_per_session: { type: 'number', label: 'Max Messages per Session', labelZh: '每次最多回复条数', default: 20 },
    },
    promptTemplate: `你是{{company_name}}的招聘顾问。请在{{platform}}上与候选人进行专业沟通。

【职位信息】
- 职位名称：{{job_title}}
- 工作地点：{{location}}
- 薪资范围：{{salary_min}}K - {{salary_max}}K

【沟通风格】
{{response_style_desc}}

【首次问候模板】
{{greeting_template}}

【沟通规则】
1. 首次接触的候选人：使用问候模板打招呼，并简要介绍职位亮点
2. 回答候选人关于职位、薪资、工作内容、团队的问题
3. 如果候选人表示感兴趣：
   - 引导其发送简历
   - 确认可面试的时间段
   - 告知面试流程
4. 如果候选人犹豫或有顾虑：
   - 了解具体顾虑
   - 给出针对性的解答
   - 不要过度推销
5. 如果候选人明确拒绝：
   - 礼貌感谢
   - 表示后续有合适机会再联系

【禁止行为】
- 不做出公司未授权的薪资承诺
- 不透露其他候选人的信息
- 不对公司内部事务发表评论
- 不发送外部链接
- 每次沟通最多处理{{max_messages_per_session}}条消息

【操作步骤】
1. 登录{{platform}}平台
2. 进入消息/聊天列表
3. 按时间顺序处理未读消息
4. 按以上规则进行回复
5. 记录每次沟通的结果和候选人意向`,
  },
]

/** 根据 skill ID 获取 skill 定义 */
export function getSkillById(id: string): OpenClawSkill | undefined {
  return SKILLS.find((s) => s.id === id)
}

/** 根据 taskType 获取 skill 定义 */
export function getSkillByTaskType(taskType: string): OpenClawSkill | undefined {
  return SKILLS.find((s) => s.taskType === taskType)
}

/** 将 prompt 模板中的变量替换为实际值 */
export function buildPrompt(
  template: string,
  variables: Record<string, string | number | string[] | undefined>
): string {
  let result = template

  // 处理条件块 {{#if var}}...{{/if}}
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, varName, content) => {
      const value = variables[varName]
      if (value && value !== '' && value !== '0') {
        return content
      }
      return ''
    }
  )

  // 替换普通变量 {{var}}
  result = result.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
    const value = variables[varName]
    if (Array.isArray(value)) {
      return value.join('、')
    }
    return value !== undefined ? String(value) : `{{${varName}}}`
  })

  return result.trim()
}

/** 构建发送给 OpenClaw 的完整任务 payload */
export function buildTaskPayload(
  skillId: string,
  config: Record<string, unknown>,
  context: {
    job?: {
      title: string
      location?: string
      salary_min?: number
      salary_max?: number
      employment_type?: string
      department?: string
      description?: string
      requirements?: string
      benefits?: string
    }
    companyName?: string
    aiSystemPrompt?: string
  }
) {
  const skill = getSkillById(skillId)
  if (!skill) throw new Error(`Skill not found: ${skillId}`)

  const variables: Record<string, string | number | string[] | undefined> = {
    ...config,
    platform: getPlatformDisplayName(config.platform as string),
    job_title: context.job?.title,
    location: context.job?.location || '不限',
    salary_min: context.job?.salary_min,
    salary_max: context.job?.salary_max,
    employment_type: context.job?.employment_type,
    department: context.job?.department || '未指定',
    description: context.job?.description,
    requirements: context.job?.requirements,
    benefits: context.job?.benefits || '面议',
    company_name: context.companyName || '我们公司',
    ai_system_prompt: context.aiSystemPrompt,
    response_style_desc: getResponseStyleDesc(config.response_style as string),
  } as Record<string, string | number | string[] | undefined>

  const prompt = buildPrompt(skill.promptTemplate, variables)

  return {
    skill_id: skillId,
    task_name: `${skill.nameZh} - ${context.job?.title || '任务'}`,
    config,
    prompt,
    platform: config.platform as string,
    job_id: config.job_id as string,
  }
}

function getPlatformDisplayName(key: string): string {
  const map: Record<string, string> = {
    boss_zhipin: 'BOSS直聘',
    '58': '58同城',
    linkedin: '领英',
  }
  return map[key] || key
}

function getResponseStyleDesc(style: string): string {
  const map: Record<string, string> = {
    professional: '专业正式：使用规范用语，保持职业化沟通风格',
    friendly: '亲切友好：语气温暖，适当使用表情，让候选人感到亲近',
    concise: '简洁高效：言简意赅，直奔主题，节省双方时间',
  }
  return map[style] || '专业正式'
}
