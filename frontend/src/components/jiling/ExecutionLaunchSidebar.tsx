import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {cn} from '@/lib/utils'
import {WORKFLOW_THEMES} from '@/components/jiling/jilingRecruitShared'
import type {ExecutionTabHandlers} from '@/components/jiling/ExecutionTab'
import type {ExecutionComposerModel} from '@/components/jiling/useExecutionComposerModel'
import type {ExecutionMode} from '@/components/jiling/jilingRecruitHelpers'
import {CheckCircle2, Circle, Loader2, Play, RefreshCw} from 'lucide-react'

interface ExecutionLaunchSidebarProps {
  model: ExecutionComposerModel
  executionMode: ExecutionMode
  handlers: ExecutionTabHandlers
}

export default function ExecutionLaunchSidebar(props: ExecutionLaunchSidebarProps) {
  const {model, executionMode, handlers} = props
  const {
    catalog,
    selectedWorkflowCard,
    completeExecutionGroups,
    executionChannelSummary,
    executionReadinessReasons,
    canStartSelectedWorkflow,
    queuedExecutionCount,
    activeExecutionCount,
    activeExecutionAccountCount,
    runningExecutionCount,
    selectedWorkflowRunningCount,
    isSelectedWorkflowLaunching,
    workflowCards,
    workflowStatusMap,
    readyPlatformCount,
  } = model

  return (
    <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
      <Card className="overflow-hidden" data-testid="execution-readiness">
        <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.08),transparent_72%)] pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">Launch Gate</p>
          <CardTitle className="mt-2 text-base">启动与调度总览</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-[24px] border border-border/70 bg-background/82 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">当前工作流</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{selectedWorkflowCard.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{workflowStatusMap[selectedWorkflowCard.id].detail}</p>
            </div>
            <div className="rounded-[24px] border border-border/70 bg-background/82 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">即将创建任务</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{completeExecutionGroups.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">每个完整任务卡都会生成一个执行实例</p>
            </div>
            <div className="rounded-[24px] border border-border/70 bg-background/82 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">账号通道</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{executionChannelSummary.totalChannels}</p>
              <p className="mt-1 text-xs text-muted-foreground">同账号共用通道并串行排队</p>
            </div>
          </div>

          <div className="rounded-[24px] border border-border/70 bg-background/82 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">解锁清单</p>
              <Badge variant="outline" className={cn('border text-[10px] uppercase tracking-[0.16em]', canStartSelectedWorkflow ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300')}>
                {canStartSelectedWorkflow ? '可以启动' : '尚未解锁'}
              </Badge>
            </div>
            <div className="mt-4 space-y-3">
              {executionReadinessReasons.length === 0 ? (
                <div className="flex items-start gap-3 rounded-[22px] border border-emerald-200/70 bg-emerald-50/75 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>
                  <div>
                    <p className="font-medium">前端校验已通过</p>
                    <p className="mt-1 text-xs leading-5">系统会按账号通道分发任务，同账号自动串行，不同账号并行推进。</p>
                  </div>
                </div>
              ) : executionReadinessReasons.map((reason, index) => (
                <div key={`${reason}-${index}`} className="flex items-start gap-3 rounded-[22px] border border-border/70 bg-background/95 px-4 py-3 text-sm">
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"/>
                  <span className="leading-6 text-muted-foreground">{reason}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-border/70 bg-background/82 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">账号通道排班</p>
              <Badge variant="outline" className="border-border/70 bg-background/88 text-[10px] uppercase tracking-[0.16em]">
                串行 {executionChannelSummary.serialChannelCount}
              </Badge>
            </div>
            {executionChannelSummary.lanes.length === 0 ? (
              <p className="mt-3 text-xs leading-6 text-muted-foreground">补齐执行组后，这里会列出每条账号通道承载哪些任务。</p>
            ) : (
              <div className="mt-3 space-y-3">
                {executionChannelSummary.lanes.map((lane) => (
                  <div key={lane.accountId} className="rounded-[20px] border border-border/70 bg-background/90 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{lane.accountName}</p>
                      <Badge variant="outline" className={cn('text-[10px] uppercase tracking-[0.16em]', lane.tone === 'serial' ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200')}>
                        {lane.label}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">平台：{lane.platformSummary}</p>
                    <p className="mt-1 text-xs leading-5 text-foreground/80">{lane.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button
            data-testid={`workflow-action-${selectedWorkflowCard.id}`}
            className="h-12 w-full gap-2 rounded-full"
            onClick={() => handlers.onStartWorkflow(selectedWorkflowCard.id)}
            disabled={!canStartSelectedWorkflow || isSelectedWorkflowLaunching}
          >
            {executionMode === 'scheduled'
              ? <><RefreshCw className="h-4 w-4"/>保存并启用定时任务</>
              : isSelectedWorkflowLaunching
                ? <><Loader2 className="h-4 w-4 animate-spin"/>正在下发 {completeExecutionGroups.length} 组任务</>
                : <><Play className="h-4 w-4"/>开始执行（{completeExecutionGroups.length} 组）</>}
          </Button>
          {selectedWorkflowRunningCount > 0 && (
            <p className="text-xs text-muted-foreground">当前该工作流仍有 {selectedWorkflowRunningCount} 个进行中或排队中的任务，可在下方任务预览里单独停止。</p>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden" data-testid="workflow-progress-overview">
        <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.04),transparent_72%)] pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">Runtime Overview</p>
          <CardTitle className="mt-2 text-base">运行汇总</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-border/70 bg-background/82 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">活跃任务</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{activeExecutionCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">当前仍在执行或等待中的任务</p>
            </div>
            <div className="rounded-[22px] border border-border/70 bg-background/82 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">排队任务</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{queuedExecutionCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">同账号串行等待中的任务</p>
            </div>
            <div className="rounded-[22px] border border-border/70 bg-background/82 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">运行账号</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{activeExecutionAccountCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">当前已占用的账号通道</p>
            </div>
          </div>

          <div className="rounded-[24px] border border-border/70 bg-background/82 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">三大工作流运行态</p>
              <Badge variant="outline" className="border-border/70 bg-background/88 text-[10px] uppercase tracking-[0.16em]">
                运行中 {runningExecutionCount} · 就绪平台 {readyPlatformCount}/{catalog.length}
              </Badge>
            </div>
            <div className="mt-4 space-y-3">
              {workflowCards.map((workflow) => {
                const status = workflowStatusMap[workflow.id]
                const theme = WORKFLOW_THEMES[workflow.id] || WORKFLOW_THEMES.publish_job
                return (
                  <button
                    key={workflow.id}
                    type="button"
                    data-testid={`workflow-card-${workflow.id}`}
                    onClick={() => handlers.onSelectWorkflow(workflow.id)}
                    className={cn('w-full rounded-[24px] border p-4 text-left transition-all', selectedWorkflowCard.id === workflow.id ? 'border-primary/30 bg-primary/[0.05]' : 'border-border/70 bg-background/82 hover:border-border')}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn('mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br', theme.iconBg)}>
                        <workflow.icon className="h-4.5 w-4.5 text-primary"/>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-foreground">{workflow.title}</p>
                          <Badge variant="outline" className="border-border/70 bg-background/85 text-[10px] uppercase tracking-[0.16em]">{status.label}</Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                          <span className="rounded-full border border-border/70 bg-background/90 px-2.5 py-1">任务 {status.activeCount}</span>
                          <span className="rounded-full border border-border/70 bg-background/90 px-2.5 py-1">运行中 {status.runningCount}</span>
                          <span className="rounded-full border border-border/70 bg-background/90 px-2.5 py-1">排队 {status.queuedCount}</span>
                          <span className="rounded-full border border-border/70 bg-background/90 px-2.5 py-1">账号 {status.accountCount}</span>
                        </div>
                        <p className="mt-3 text-xs leading-5 text-muted-foreground">{status.detail}</p>
                        <p className="mt-2 text-xs leading-5 text-foreground/80">{status.activeCount > 0 ? '当前账号通道' : '最近关联账号'}：{status.accountSummary}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
