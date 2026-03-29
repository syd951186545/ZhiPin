import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Progress} from '@/components/ui/progress'
import {cn} from '@/lib/utils'
import {getExecutionStatusMeta, getExecutionAuthGuide} from '@/components/jiling/ExecutionDetailDialog'
import {getActionNodeImageUrls} from '@/components/jiling/ExecutionScreenshotCard'
import {EXECUTION_DISPATCH_BADGE_STYLES} from '@/components/jiling/jilingRecruitShared'
import type {ExecutionTabHandlers} from '@/components/jiling/ExecutionTab'
import type {ExecutionComposerModel} from '@/components/jiling/useExecutionComposerModel'
import {summarizeExecutionOutput} from '@/components/jiling/jilingRecruitHelpers'
import {Eye, Loader2, Square} from 'lucide-react'

function stepStatusLabel(status: string) {
  switch (status) {
    case 'done':
      return '已完成'
    case 'running':
      return '执行中'
    case 'failed':
      return '失败'
    case 'pending':
    default:
      return '待执行'
  }
}

interface ExecutionPreviewPanelsProps {
  model: ExecutionComposerModel
  selectedExecutionId: string | null
  handlers: ExecutionTabHandlers
}

export default function ExecutionPreviewPanels(props: ExecutionPreviewPanelsProps) {
  const {model, selectedExecutionId, handlers} = props
  const {
    displayExec,
    queuedExecutionCount,
    activeExecutionCount,
    activeExecutionAccountCount,
    runningExecutionCount,
    executionPreviewItems,
    isDisplayExecActive,
    displayExecStatusMeta,
    displayExecSummary,
    displayExecRecentNodes,
    displayExecDispatchMeta,
    executionDispatchMetaMap,
    progressPercent,
    completedStepCount,
    runningStepLabel,
    shouldClampExecutionPreviewList,
    getExecutionProgress,
    getExecutionRunningStepLabel,
  } = model

  const executionAuthGuide = getExecutionAuthGuide(displayExec?.error, displayExec?.accumulatedText)

  if (executionPreviewItems.length === 0) {
    return null
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_360px]">
      <Card className="overflow-hidden border-primary/12 bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--card)))]" data-testid="execution-running-queue">
        <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.08),transparent_72%)] pb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">Execution Preview</p>
              <CardTitle className="mt-2 text-base">任务执行预览</CardTitle>
            </div>
            <Badge variant="outline" className="border-primary/15 bg-primary/[0.06] text-primary">活跃 {activeExecutionCount} · 排队 {queuedExecutionCount}</Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-border/70 bg-background/82 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">预览任务</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{executionPreviewItems.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">列表中最多保留最近 8 个任务</p>
            </div>
            <div className="rounded-[22px] border border-border/70 bg-background/82 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">并行执行</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{runningExecutionCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">不同账号正在同时推进的任务</p>
            </div>
            <div className="rounded-[22px] border border-border/70 bg-background/82 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">占用账号</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{activeExecutionAccountCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">当前执行通道涉及的账号数量</p>
            </div>
          </div>

          <div className={cn('space-y-3', shouldClampExecutionPreviewList && 'max-h-[38rem] overflow-y-auto pr-1 scrollbar-thin')}>
            {executionPreviewItems.map((execution) => {
              const isSelected = selectedExecutionId === execution.executionId
              const isCancelling = execution.status === 'cancelling'
              const isExecutionActive = ['queued', 'starting', 'running', 'cancelling'].includes(execution.status)
              const progress = getExecutionProgress(execution)
              const statusMeta = getExecutionStatusMeta(execution)
              const previewText = summarizeExecutionOutput(execution.accumulatedText, execution.error, execution.queueMessage)
              const dispatchMeta = executionDispatchMetaMap[execution.executionId]

              return (
                <div
                  key={execution.executionId}
                  role="button"
                  tabIndex={0}
                  onClick={() => handlers.onSelectedExecutionChange(execution.executionId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handlers.onSelectedExecutionChange(execution.executionId)
                    }
                  }}
                  className={cn('w-full rounded-[24px] border bg-background/82 p-4 text-left transition-all', isSelected ? 'border-primary/30 bg-primary/[0.05]' : 'border-border/70 hover:border-border')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{execution.workflowName || execution.workflowId}</p>
                        <Badge variant="outline" className={cn('text-[10px] uppercase tracking-[0.16em]', statusMeta.badgeClassName)}>
                          {isExecutionActive ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                          {statusMeta.label}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{getExecutionRunningStepLabel(execution)}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="outline" className={cn('text-[10px] uppercase tracking-[0.16em]', EXECUTION_DISPATCH_BADGE_STYLES[dispatchMeta?.laneTone || 'recent'])}>
                          {dispatchMeta?.laneLabel || '最近记录'}
                        </Badge>
                        {dispatchMeta?.accountNames.map((accountName) => (
                          <Badge key={`${execution.executionId}-${accountName}`} variant="outline" className="border-border/70 bg-background/90 text-[10px]">{accountName}</Badge>
                        ))}
                        {execution.queuePosition ? <Badge variant="outline" className="border-border/70 bg-background/90 text-[10px]">队列 #{execution.queuePosition}</Badge> : null}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-foreground/78">{dispatchMeta?.laneDetail}</p>
                      <p className="mt-2 text-xs leading-5 text-foreground/82">{previewText}</p>
                      <p className="mt-2 font-mono text-xs text-muted-foreground">{execution.executionId}</p>
                    </div>
                    {execution.currentPlatform && <Badge variant="outline" className="border-border/70 bg-background/90 text-[10px]">{execution.currentPlatform}</Badge>}
                  </div>
                  <Progress value={progress} className="mt-4 h-2 rounded-full"/>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">{progress}% · {execution.steps.filter((step) => step.status === 'done').length}/{Math.max(execution.totalSteps, 1)} · 截图 {execution.actionNodes.length}</p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 rounded-full"
                        onClick={(event) => {
                          event.stopPropagation()
                          handlers.onSelectedExecutionChange(execution.executionId)
                          handlers.onOpenExecutionDetail()
                        }}
                      >
                        <Eye className="h-3.5 w-3.5"/>详情
                      </Button>
                      {isExecutionActive && (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="h-8 gap-1.5 rounded-full"
                          disabled={isCancelling}
                          onClick={(event) => {
                            event.stopPropagation()
                            handlers.onCancelWorkflow(execution.executionId)
                          }}
                        >
                          {isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Square className="h-3.5 w-3.5"/>}
                          {isCancelling ? '停止中' : '停止'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {displayExec && (
        <Card className="overflow-hidden border-primary/12 bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--card)))]" data-testid="execution-monitor">
          <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.12),transparent_72%)] pb-5">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">Execution Snapshot</p>
                  <CardTitle className="mt-2 text-base">任务摘要</CardTitle>
                </div>
                <Badge variant="outline" className={cn('text-[10px] uppercase tracking-[0.16em]', displayExecStatusMeta.badgeClassName)}>
                  {isDisplayExecActive ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                  {displayExecStatusMeta.label}
                </Badge>
              </div>
              <p className="text-sm font-semibold text-foreground">{displayExec.workflowName || '执行任务'}</p>
              <p className="text-xs text-muted-foreground">当前焦点步骤：{runningStepLabel}</p>
              {displayExecDispatchMeta && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={cn('text-[10px] uppercase tracking-[0.16em]', EXECUTION_DISPATCH_BADGE_STYLES[displayExecDispatchMeta.laneTone])}>
                      {displayExecDispatchMeta.laneLabel}
                    </Badge>
                    {displayExecDispatchMeta.accountNames.map((accountName) => (
                      <Badge key={`display-${displayExec.executionId}-${accountName}`} variant="outline" className="border-border/70 bg-background/90 text-[10px]">{accountName}</Badge>
                    ))}
                  </div>
                  <p className="text-xs leading-5 text-foreground/82">{displayExecDispatchMeta.laneDetail}</p>
                </>
              )}
              <p className="font-mono text-xs text-muted-foreground">{displayExec.executionId}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-background/82 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">完成率</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{progressPercent}%</p>
                <p className="mt-1 text-xs text-muted-foreground">{completedStepCount}/{Math.max(displayExec.totalSteps, 1)}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/82 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">截图节点</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{displayExec.actionNodes.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">当前步骤：{runningStepLabel}</p>
              </div>
            </div>

            {executionAuthGuide && (
              <div className="rounded-[22px] border border-amber-200/70 bg-amber-50/85 px-4 py-3 text-xs leading-6 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200">
                <p className="font-medium">{executionAuthGuide.title}</p>
                <p className="mt-1">{executionAuthGuide.description}</p>
              </div>
            )}

            <div className="rounded-[24px] border border-border/70 bg-background/82 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">执行步骤</p>
              <div className="mt-3 space-y-2">
                {displayExec.steps.map((step) => (
                  <div key={step.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/88 px-3 py-2.5">
                    <span className="text-sm text-foreground">{step.nameZh}</span>
                    <Badge variant="outline" className="border-border/70 bg-background/90 text-[10px]">
                      {stepStatusLabel(step.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-border/70 bg-background/82 p-4" data-testid="execution-output">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">最近输出摘要</p>
              {displayExec.accumulatedText ? (
                <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/88">
                  {displayExec.accumulatedText}
                </pre>
              ) : (
                <p className="mt-3 text-sm leading-6 text-foreground/88">{displayExecSummary}</p>
              )}
            </div>

            <div className="rounded-[24px] border border-border/70 bg-background/82 p-4" data-testid="execution-screenshots">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">最近截图预览</p>
              {displayExecRecentNodes.length === 0 ? (
                <div className="mt-3 flex h-24 items-center justify-center rounded-2xl border border-dashed bg-muted/20 text-xs text-muted-foreground">暂无截图，等待任务返回第一张执行证据。</div>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {displayExecRecentNodes.map((node) => {
                    const previewUrl = getActionNodeImageUrls(node)[0]
                    return (
                      <button
                        key={node.id}
                        type="button"
                        className="overflow-hidden rounded-2xl border border-border/70 bg-background/90 text-left"
                        onClick={() => previewUrl && handlers.onPreviewImage(previewUrl)}
                      >
                        {previewUrl ? <img src={previewUrl} alt={node.action} className="h-24 w-full object-cover object-top"/> : <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">截图加载中</div>}
                        <div className="px-3 py-2">
                          <p className="truncate text-xs font-medium text-foreground">{node.action}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">{node.time}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button className="h-10 gap-2 rounded-full" onClick={handlers.onOpenExecutionDetail}>
                <Eye className="h-4 w-4"/>查看任务详情
              </Button>
              {isDisplayExecActive && (
                <Button data-testid="cancel-workflow-btn" variant="destructive" className="h-10 gap-2 rounded-full" onClick={() => handlers.onCancelWorkflow(displayExec.executionId)} disabled={displayExec.status === 'cancelling'}>
                  {displayExec.status === 'cancelling' ? <Loader2 className="h-4 w-4 animate-spin"/> : <Square className="h-4 w-4"/>}
                  {displayExec.status === 'cancelling' ? '停止中' : '停止该任务'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
