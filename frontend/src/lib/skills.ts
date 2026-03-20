/**
 * 工作流定义（前端元数据）
 *
 * Prompt 模板已迁移到 Python 后端（backend/prompts/），
 * 前端只保留工作流和步骤的 UI 元数据。
 */

import type {WorkflowId} from '@/services/workflowService'

// ── 工作流步骤元数据 ─────────────────────────────────────

export interface WorkflowStepMeta {
  id: string
  nameZh: string
}

export interface WorkflowDefinition {
  id: WorkflowId
  name: string
  nameZh: string
  description: string
  descriptionZh: string
  /** 前端预定义的步骤（后端启动时会发送实际步骤列表覆盖） */
  defaultSteps: WorkflowStepMeta[]
  /** 是否支持多平台 */
  multiPlatform: boolean
}

// ── 3 个工作流定义 ───────────────────────────────────────

export const WORKFLOW_DEFINITIONS: WorkflowDefinition[] = [
  {
    id: 'publish_job',
    name: 'Publish Job Posting',
    nameZh: '发布招聘公告',
    description: 'Auto-generate job announcement and publish to recruitment platform',
    descriptionZh: '选择平台和岗位要求，AI自动生成招聘公告并发布到指定平台',
    multiPlatform: false,
    defaultSteps: [
      {id: 'login_check', nameZh: '登录检查'},
      {id: 'generate_announcement', nameZh: '生成招聘公告'},
      {id: 'fill_and_publish', nameZh: '填写并发布'},
      {id: 'verify_result', nameZh: '验证发布结果'},
    ],
  },
  {
    id: 'talent_explore',
    name: 'Market Talent Exploration',
    nameZh: '市场人才探索',
    description: 'Search platform for matching candidates and proactively communicate',
    descriptionZh: '在招聘平台搜索匹配候选人，主动沟通并记录到候选人页面',
    multiPlatform: false,
    defaultSteps: [
      {id: 'login_check', nameZh: '登录平台'},
      {id: 'search_candidates', nameZh: '搜索候选人'},
      {id: 'collect_profiles', nameZh: '采集候选人资料'},
      {id: 'initiate_contact', nameZh: '主动沟通'},
      {id: 'save_results', nameZh: '保存结果'},
    ],
  },
  {
    id: 'resume_screen',
    name: 'Resume Screening & AI Communication',
    nameZh: '简历筛选及AI沟通',
    description: 'Collect resumes from all platforms, analyze match scores, and contact qualified candidates',
    descriptionZh: '采集全部平台简历，AI分析匹配度，对达标者主动沟通邀约',
    multiPlatform: true,
    defaultSteps: [
      {id: 'login_check', nameZh: '登录平台'},
      {id: 'collect_resumes', nameZh: '采集简历'},
      {id: 'analyze_match', nameZh: '分析匹配度'},
      {id: 'contact_qualified', nameZh: '沟通邀约'},
      {id: 'save_results', nameZh: '汇总保存结果'},
    ],
  },
]

export function getWorkflowById(id: WorkflowId): WorkflowDefinition | undefined {
  return WORKFLOW_DEFINITIONS.find((w) => w.id === id)
}
