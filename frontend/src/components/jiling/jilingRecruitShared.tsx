import type {ElementType} from 'react'
import {FileSearch, Megaphone, Search} from 'lucide-react'
import type {TranslationKey} from '@/contexts/I18nContext'
import {Badge} from '@/components/ui/badge'
import type {WorkflowId} from '@/services/workflowService'
import type {PreparationTone} from '@/components/jiling/jilingRecruitHelpers'
import type {ExecutionDispatchTone} from '@/components/jiling/jilingRecruitViewModel'

export const PLATFORM_COLORS: Record<string, {bg: string; text: string; ring: string; gradient: string; badge: string}> = {
  '58': {bg: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400', ring: 'ring-orange-400/30', gradient: 'from-orange-500/12 to-orange-500/3', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'},
  boss_zhipin: {bg: 'bg-cyan-500', text: 'text-cyan-600 dark:text-cyan-400', ring: 'ring-cyan-400/30', gradient: 'from-cyan-500/12 to-cyan-500/3', badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300'},
  liepin: {bg: 'bg-red-500', text: 'text-red-600 dark:text-red-400', ring: 'ring-red-400/30', gradient: 'from-red-500/12 to-red-500/3', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'},
  zhilian: {bg: 'bg-blue-600', text: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-400/30', gradient: 'from-blue-600/12 to-blue-600/3', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'},
  '51job': {bg: 'bg-indigo-500', text: 'text-indigo-600 dark:text-indigo-400', ring: 'ring-indigo-400/30', gradient: 'from-indigo-500/12 to-indigo-500/3', badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'},
  lagou: {bg: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-400/30', gradient: 'from-emerald-500/12 to-emerald-500/3', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'},
}

export const WORKFLOW_THEMES: Record<string, {gradient: string; iconBg: string}> = {
  publish_job: {gradient: 'from-amber-500/10 via-orange-500/5 to-transparent', iconBg: 'bg-gradient-to-br from-amber-500/20 to-orange-500/10'},
  talent_explore: {gradient: 'from-blue-500/10 via-cyan-500/5 to-transparent', iconBg: 'bg-gradient-to-br from-blue-500/20 to-cyan-500/10'},
  resume_screen: {gradient: 'from-slate-500/12 via-primary/6 to-transparent', iconBg: 'bg-gradient-to-br from-slate-500/16 to-primary/10'},
}

export const EXECUTION_DISPATCH_BADGE_STYLES: Record<ExecutionDispatchTone, string> = {
  parallel: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200',
  serial: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  single: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  recent: 'border-border/70 bg-background/90 text-muted-foreground',
}

const PREPARATION_BADGE_STYLES: Record<PreparationTone, string> = {
  risk: 'border-amber-200/80 bg-amber-100/90 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200',
  pass: 'border-emerald-200/80 bg-emerald-100/90 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200',
  saved: 'border-teal-200/80 bg-teal-100/90 text-teal-800 dark:border-teal-900/70 dark:bg-teal-950/40 dark:text-teal-200',
  idle: 'border-border/80 bg-background/88 text-muted-foreground',
}

export interface WorkflowCardDefinition {
  id: WorkflowId
  title: string
  desc: string
  icon: ElementType
  multiPlatform: boolean
}

export interface WorkflowCardView extends WorkflowCardDefinition {
  executionMode: string
  screenshotMode: string
}

export const WORKFLOW_CARDS: WorkflowCardDefinition[] = [
  {id: 'publish_job', title: '发布招聘公告', desc: '复用已绑定账号，自动填写岗位信息并发布到招聘平台。', icon: Megaphone, multiPlatform: false},
  {id: 'talent_explore', title: '市场人才探索', desc: '进入人才库主动搜索、筛选并沟通匹配候选人。', icon: Search, multiPlatform: false},
  {id: 'resume_screen', title: '简历筛选及AI沟通', desc: '多平台依次复用默认账号，AI 自动筛选简历并沟通。', icon: FileSearch, multiPlatform: true},
]

export const WORKFLOW_I18N_KEYS: Record<WorkflowId, {title: TranslationKey; desc: TranslationKey}> = {
  publish_job: {title: 'recruit.workflow.publishJob.title', desc: 'recruit.workflow.publishJob.desc'},
  talent_explore: {title: 'recruit.workflow.talentExplore.title', desc: 'recruit.workflow.talentExplore.desc'},
  resume_screen: {title: 'recruit.workflow.resumeScreen.title', desc: 'recruit.workflow.resumeScreen.desc'},
}

export const pc = (key: string) => PLATFORM_COLORS[key] || PLATFORM_COLORS['58']

export const platformGlyph = (key: string) => {
  switch (key) {
    case 'boss_zhipin':
      return 'B'
    case '58':
      return '58'
    case 'liepin':
      return '猎'
    case 'zhilian':
      return '智'
    case '51job':
      return '前'
    case 'lagou':
      return '拉'
    default:
      return '平'
  }
}

export function statusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">已绑定</Badge>
    case 'verifying':
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 border-0">处理中</Badge>
    case 'expired':
      return <Badge variant="destructive">已失效</Badge>
    default:
      return <Badge variant="outline" className="text-muted-foreground">待绑定</Badge>
  }
}

export function preparationBadge(label: string, tone: PreparationTone) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium tracking-[0.02em]',
        PREPARATION_BADGE_STYLES[tone],
      ].join(' ')}
    >
      {label}
    </span>
  )
}
