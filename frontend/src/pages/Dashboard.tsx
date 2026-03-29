import {
  Activity,
  Bot,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Clock3,
  Loader2,
  PlayCircle,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react'
import {useMemo} from 'react'
import {Button} from '@/components/ui/button'
import {Progress} from '@/components/ui/progress'
import {useI18n} from '@/contexts/I18nContext'
import {useAutomationTasks} from '@/hooks/useAutomationTasks'
import {PLATFORMS, TASK_STATUS} from '@/lib/constants'

type StatCard = {
  title: string
  value: string
  description: string
  icon: typeof Activity
}

type PipelineItem = {
  title: string
  subtitle: string
  status: string
  progressLabel: string
  progressValue: number
  tone: 'active' | 'pending' | 'done'
}

type EvidenceItem = {
  label: string
  value: string
  tone?: 'normal' | 'warning'
}

function toneClass(tone: PipelineItem['tone']) {
  if (tone === 'done') {
    return 'bg-[#efe5cd] text-[#8b6417]'
  }

  if (tone === 'pending') {
    return 'bg-[#f3e7c9] text-[#8a6316]'
  }

  return 'bg-[#eef3f0] text-[#155e63]'
}

export default function Dashboard() {
  const {lang, t} = useI18n()
  const isZh = lang === 'zh'
  const {tasks, loading: tasksLoading} = useAutomationTasks()

  const pageCopy = {
    eyebrow: 'TODAY SUMMARY',
    title: isZh ? '今天的数字员工状态' : 'Today at a glance',
    description: isZh
      ? '先看结果和异常，再决定进入哪个流程。'
      : 'Review outcomes and blockers first, then decide where to drill in.',
    sectionEyebrow: 'OPERATIONS VIEW',
    sectionTitle: isZh ? '今天有 3 个数字员工流程正在执行' : 'Three workforce flows are running today',
    sectionDescription: isZh ? '把执行状态、人工接管点和证据结果压缩到一屏。' : 'Compress status, handoff points, and evidence into one screen.',
    stability: isZh ? '运行稳定' : 'Stable',
    launch: isZh ? '启动新流程' : 'Launch Flow',
    waitingManual: isZh ? '1 项等待人工' : '1 waiting for review',
    laneTitle: isZh ? '执行中的岗位流水线' : 'Active Hiring Pipeline',
    laneDescription: isZh ? '把招聘流程看成一条可追踪的生产线。' : 'Treat hiring like a trackable production line.',
    evidenceTitle: isZh ? '执行证据' : 'Execution Evidence',
    evidenceDescription: isZh
      ? '日志和截图不是附属信息，而是判断是否需要接管的依据。'
      : 'Logs and screenshots are decision signals, not supporting material.',
    evidenceHint: isZh ? '当前判断' : 'Current read',
    evidenceSummary: isZh
      ? '当前异常集中在登录态失效，建议先处理账号复验，再释放等待人工的流程。'
      : 'The main blocker is session expiry. Re-verify the affected account before resuming manual-review flows.',
    activityTitle: isZh ? '最近动态' : 'Recent Activity',
    activityDescription: isZh ? '最近完成、失败和进行中的任务会在这里汇总。' : 'Recent completed, failed, and active tasks.',
    activityEmpty: isZh ? '暂时没有新的执行动态。' : 'No recent execution updates.',
  }

  const statCards: StatCard[] = [
    {
      title: isZh ? '自动发布岗位' : 'Auto Publish Jobs',
      value: '12',
      description: isZh ? '过去 24 小时自动分发到多平台' : 'Distributed across platforms in the last 24 hours',
      icon: PlayCircle,
    },
    {
      title: isZh ? 'AI 推荐候选人' : 'AI Suggested Candidates',
      value: '37',
      description: isZh ? '其中 9 位进入人工复核' : '9 of them moved to manual review',
      icon: Sparkles,
    },
    {
      title: isZh ? '账号健康度' : 'Account Health',
      value: '97%',
      description: isZh ? '1 个平台建议重新验证' : '1 platform should be re-verified',
      icon: ShieldCheck,
    },
    {
      title: isZh ? '待人工确认' : 'Awaiting Human Review',
      value: '2',
      description: isZh ? '比昨天减少 1 项' : 'Down by 1 from yesterday',
      icon: ClipboardCheck,
    },
  ]

  const pipelineItems: PipelineItem[] = [
    {
      title: isZh ? '运营经理 / 华东大区' : 'Operations Manager / East China',
      subtitle: isZh ? 'BOSS 直聘 · 机灵招聘' : 'Boss Zhipin · Recruit Agent',
      status: isZh ? 'AI 沟通中' : 'AI Outreach',
      progressLabel: '12 / 18',
      progressValue: 67,
      tone: 'active',
    },
    {
      title: isZh ? '门店主管 / 连锁餐饮' : 'Store Supervisor / Chain Dining',
      subtitle: isZh ? '58 同城 · 市场人才探索' : '58.com · Market Search',
      status: isZh ? '待终审' : 'Final Review',
      progressLabel: '8 / 8',
      progressValue: 100,
      tone: 'pending',
    },
    {
      title: isZh ? '财务助理 / 苏州' : 'Finance Assistant / Suzhou',
      subtitle: isZh ? '智联招聘 · 简历初筛' : 'Zhilian · Resume Screening',
      status: isZh ? '已完成' : 'Completed',
      progressLabel: '24 / 24',
      progressValue: 100,
      tone: 'done',
    },
  ]

  const evidenceLogs = [
    '[11:13:03] openclaw/session verify',
    'platform=boss_zhipin [11:13:05] session status=expired',
    '[11:13:06] prompt user action="re-verify"',
    '[11:13:24] resume_screen score=91 candidate=王**',
    '[11:13:33] send_message delivered count=6',
    '[11:13:41] workflow state="manual-review-required"',
  ]

  const evidenceItems: EvidenceItem[] = [
    {
      label: isZh ? '截图节点' : 'Screenshot Nodes',
      value: '07',
    },
    {
      label: isZh ? '最近交付' : 'Latest Delivery',
      value: isZh ? '6 条已发送' : '6 delivered',
    },
    {
      label: isZh ? '需人工接管' : 'Human Handoff',
      value: isZh ? '1 个流程' : '1 flow',
      tone: 'warning',
    },
  ]

  const recentTasks = useMemo(
    () => tasks.slice(0, 4),
    [tasks],
  )

  return (
    <section className="mx-auto max-w-[1440px] rounded-[24px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,253,248,0.96),rgba(250,247,241,0.92))] p-5 shadow-[0_28px_70px_-48px_rgba(20,32,43,0.35)] md:p-7">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 border-b border-border/60 pb-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-2xl">
            <p className="text-[12px] font-semibold uppercase tracking-[0.26em] text-[#738089]">
              {pageCopy.eyebrow}
            </p>
            <h2 className="mt-2 text-[1.6rem] font-semibold tracking-[-0.05em] text-[#16232d] md:text-[1.9rem]">
              {pageCopy.title}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#5f6973]">
              {pageCopy.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d8dfde] bg-white/75 px-3.5 py-2 text-sm text-[#30414c] shadow-[0_12px_30px_-24px_rgba(20,32,43,0.4)]">
              <CircleDashed className="h-4 w-4 text-[#155e63]" />
              {pageCopy.stability}
            </div>
            <div className="inline-flex items-center rounded-full border border-[#ead8ae] bg-[#f7efd9] px-3.5 py-2 text-sm font-medium text-[#8b6417]">
              {pageCopy.waitingManual}
            </div>
            <Button className="h-12 rounded-full px-6 text-sm shadow-[0_22px_44px_-26px_rgba(21,94,99,0.78)]">
              {pageCopy.launch}
            </Button>
          </div>
        </div>

        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.26em] text-[#738089]">
            {pageCopy.sectionEyebrow}
          </p>
          <div className="mt-3 flex flex-col gap-4">
            <div>
              <h3 className="text-[1.9rem] font-semibold tracking-[-0.05em] text-[#16232d] md:text-[2.1rem]">
                {pageCopy.sectionTitle}
              </h3>
              <p className="mt-1.5 text-sm text-[#5f6973]">
                {pageCopy.sectionDescription}
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
              {statCards.map((card) => (
                <div
                  key={card.title}
                  className="rounded-[20px] border border-[#d9dfdc] bg-[rgba(255,252,247,0.92)] px-4 py-4 shadow-[0_16px_34px_-32px_rgba(20,32,43,0.45)]"
                >
                  <div className="flex items-center gap-2 text-sm text-[#69757f]">
                    <card.icon className="h-4 w-4 text-[#155e63]" />
                    {card.title}
                  </div>
                  <p className="mt-3 text-[1.95rem] font-semibold tracking-[-0.05em] text-[#16232d]">
                    {card.value}
                  </p>
                  <p className="mt-1.5 text-sm leading-6 text-[#6a747c]">{card.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(340px,0.95fr)]">
          <article className="rounded-[24px] border border-[#d9dfdc] bg-[rgba(255,252,247,0.92)] p-5 shadow-[0_18px_40px_-34px_rgba(20,32,43,0.45)] md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h4 className="text-[1.55rem] font-semibold tracking-[-0.05em] text-[#16232d]">
                  {pageCopy.laneTitle}
                </h4>
                <p className="mt-1.5 text-sm text-[#6a747c]">{pageCopy.laneDescription}</p>
              </div>
              <div className="inline-flex items-center rounded-full border border-[#ead8ae] bg-[#f7efd9] px-3.5 py-1.5 text-sm font-medium text-[#8b6417]">
                {pageCopy.waitingManual}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {pipelineItems.map((item) => (
                <div
                  key={item.title}
                  className="rounded-[18px] border border-white/70 bg-[#f2f4f1] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] md:px-5"
                >
                  <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-[1.05rem] font-semibold tracking-[-0.03em] text-[#1b2831]">
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-sm text-[#6a747c]">{item.subtitle}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-3 py-1.5 text-sm font-medium ${toneClass(item.tone)}`}>
                        {item.status}
                      </span>
                      <span className="text-base font-semibold tracking-[-0.03em] text-[#1b2831]">
                        {item.progressLabel}
                      </span>
                    </div>
                  </div>
                  <Progress value={item.progressValue} className="mt-3 h-1.5 bg-white/70" />
                </div>
              ))}
            </div>
          </article>

          <div className="space-y-4">
            <article className="rounded-[24px] border border-[#d9dfdc] bg-[rgba(255,252,247,0.92)] p-5 shadow-[0_18px_40px_-34px_rgba(20,32,43,0.45)] md:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-[1.55rem] font-semibold tracking-[-0.05em] text-[#16232d]">
                    {pageCopy.evidenceTitle}
                  </h4>
                  <p className="mt-1.5 text-sm leading-6 text-[#6a747c]">
                    {pageCopy.evidenceDescription}
                  </p>
                </div>
                <Bot className="mt-1 h-5 w-5 shrink-0 text-[#155e63]" />
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                {evidenceItems.map((item, index) => {
                  const Icon = index === 0 ? Activity : index === 1 ? Sparkles : ShieldAlert
                  const toneClassName = item.tone === 'warning'
                    ? 'border-[#ead8ae] bg-[#fbf5e6] text-[#8b6417]'
                    : 'border-[#e5e2d9] bg-white/70 text-[#1b2831]'

                  return (
                    <div
                      key={item.label}
                      className={`rounded-[16px] border px-4 py-3 ${toneClassName}`}
                    >
                      <div className="flex items-center gap-2 text-[12px] font-medium">
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </div>
                      <p className="mt-2 text-lg font-semibold tracking-[-0.03em]">{item.value}</p>
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 rounded-[20px] bg-[#131a21] p-4 font-mono text-[12px] leading-7 text-[#dde7ef] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] md:p-5">
                {evidenceLogs.map((line) => (
                  <div key={line} className="break-words">
                    {line}
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t border-border/60 pt-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[#7a858e]">
                  {pageCopy.evidenceHint}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#6a747c]">
                  {pageCopy.evidenceSummary}
                </p>
              </div>
            </article>

            <article className="rounded-[24px] border border-[#d9dfdc] bg-[rgba(255,252,247,0.92)] p-5 shadow-[0_18px_40px_-34px_rgba(20,32,43,0.45)] md:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-[1.2rem] font-semibold tracking-[-0.04em] text-[#16232d]">
                    {pageCopy.activityTitle}
                  </h4>
                  <p className="mt-1.5 text-sm leading-6 text-[#6a747c]">
                    {pageCopy.activityDescription}
                  </p>
                </div>
                <Clock3 className="mt-1 h-5 w-5 shrink-0 text-[#8b6417]" />
              </div>

              <div className="mt-4 space-y-2.5">
                {tasksLoading ? (
                  Array.from({length: 3}).map((_, index) => (
                    <div
                      key={index}
                      className="h-[72px] animate-pulse rounded-[18px] border border-[#ece4d5] bg-[#f5efe3]"
                    />
                  ))
                ) : recentTasks.length === 0 ? (
                  <div className="rounded-[18px] border border-dashed border-[#d9dfdc] bg-[#f7f3ea] px-4 py-6 text-sm text-[#6a747c]">
                    {pageCopy.activityEmpty}
                  </div>
                ) : recentTasks.map((task) => {
                  const statusTone = task.status === 'completed'
                    ? 'bg-[#eef3f0] text-[#155e63]'
                    : task.status === 'failed' || task.status === 'cancelled'
                      ? 'bg-[#f7e7e3] text-[#8f3d2f]'
                      : 'bg-[#f3e7c9] text-[#8a6316]'
                  const statusIcon = task.status === 'completed'
                    ? <CheckCircle2 className="h-4 w-4 text-[#155e63]" />
                    : task.status === 'failed' || task.status === 'cancelled'
                      ? <XCircle className="h-4 w-4 text-[#8f3d2f]" />
                      : <Loader2 className="h-4 w-4 animate-spin text-[#8a6316]" />
                  const displayTime = task.completed_at || task.started_at || task.created_at
                  const platformLabel = task.platform
                    ? PLATFORMS[task.platform as keyof typeof PLATFORMS]?.name || task.platform
                    : t('activity.systemTask')

                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 rounded-[18px] border border-white/70 bg-[#f4efe4] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/75">
                        {statusIcon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-[#1b2831]">{task.name}</p>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone}`}>
                            {TASK_STATUS[task.status as keyof typeof TASK_STATUS] || task.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[#6a747c]">
                          {platformLabel} · {new Date(displayTime).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  )
}
