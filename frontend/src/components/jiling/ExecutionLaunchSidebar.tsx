import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {cn} from '@/lib/utils'
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
    selectedWorkflowCard,
    completeExecutionGroups,
    executionChannelSummary,
    executionReadinessReasons,
    canStartSelectedWorkflow,
    selectedWorkflowRunningCount,
    selectedWorkflowActiveCount,
    selectedWorkflowQueuedCount,
    selectedWorkflowCompletedCount,
    selectedWorkflowFailedCount,
    isSelectedWorkflowLaunching,
    workflowStatusMap,
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
            </div>
            <div className="rounded-[24px] border border-border/70 bg-background/82 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">任务队列</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{executionChannelSummary.totalChannels}</p>
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
                    <p className="font-medium">任务编排通过</p>
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
              <p className="text-sm font-semibold text-foreground">任务队列</p>
              <Badge variant="outline" className="border-border/70 bg-background/88 text-[10px] uppercase tracking-[0.16em]">
                排队任务 {executionChannelSummary.serialChannelCount}
              </Badge>
            </div>
            {executionChannelSummary.lanes.length === 0 ? (
              <p className="mt-3 text-xs leading-6 text-muted-foreground">任务队列执行顺序说明</p>
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

          <div className="rounded-[24px] border border-border/70 bg-background/82 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">当前工作流运行概览</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border/70 bg-background/88 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">活跃</p>
                <p className="mt-1 font-mono text-lg font-semibold text-foreground">{selectedWorkflowActiveCount}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/88 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">排队</p>
                <p className="mt-1 font-mono text-lg font-semibold text-foreground">{selectedWorkflowQueuedCount}</p>
              </div>
              <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/50 px-3 py-2.5 dark:border-emerald-900/40 dark:bg-emerald-950/15">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">已完成</p>
                <p className="mt-1 font-mono text-lg font-semibold text-emerald-800 dark:text-emerald-100">{selectedWorkflowCompletedCount}</p>
              </div>
              <div className="rounded-2xl border border-red-200/60 bg-red-50/50 px-3 py-2.5 dark:border-red-900/40 dark:bg-red-950/15">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-red-600 dark:text-red-300">异常/停止</p>
                <p className="mt-1 font-mono text-lg font-semibold text-red-700 dark:text-red-100">{selectedWorkflowFailedCount}</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{workflowStatusMap[selectedWorkflowCard.id].detail}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
