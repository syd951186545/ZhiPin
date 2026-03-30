import React from 'react'
import {AlertTriangle, Camera, Check, CheckCircle2, Circle, ClipboardCopy, Loader2, X} from 'lucide-react'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Progress} from '@/components/ui/progress'
import {cn} from '@/lib/utils'
import {ExecutionScreenshotCard} from '@/components/jiling/ExecutionScreenshotCard'
import type {ExecutionDispatchMeta} from '@/components/jiling/jilingRecruitViewModel'
import type {WorkflowExecution} from '@/stores/useWorkflowStore'

// ── helpers ──────────────────────────────────────────────────

export function getExecutionAuthGuide(error?: string, accumulatedText?: string) {
  const source = `${error || ''}\n${accumulatedText || ''}`
  if (!/(AUTH_REQUIRED|登录态已失效|需要重新登录|会话失效|重新绑定账号)/.test(source)) {
    return null
  }
  return {
    title: '当前账号登录态已失效',
    description: '请前往「平台和账号配置」，先对该账号执行"重新验证"；如果仍失败，再执行"重新绑定"完成登录后，回到当前页面重新运行工作流。',
  }
}

export function getExecutionStatusMeta(execution?: WorkflowExecution | null) {
  if (!execution) {
    return {
      label: '未开始',
      badgeClassName: 'border-border/70 bg-background/90 text-muted-foreground',
    }
  }

  switch (execution.status) {
    case 'cancelling':
      return {
        label: '停止中',
        badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300',
      }
    case 'queued':
      return {
        label: '排队中',
        badgeClassName: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300',
      }
    case 'running':
    case 'starting':
      return {
        label: '执行中',
        badgeClassName: 'border-primary/20 bg-primary/[0.08] text-primary',
      }
    case 'completed':
      return {
        label: '已完成',
        badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300',
      }
    case 'failed':
      return {
        label: '已失败',
        badgeClassName: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300',
      }
    case 'cancelled':
      return {
        label: '已停止',
        badgeClassName: 'border-border/70 bg-background/90 text-muted-foreground',
      }
    default:
      return {
        label: '已结束',
        badgeClassName: 'border-border/70 bg-background/90 text-muted-foreground',
      }
  }
}

// ── component ─────────────────────────────────────────────────

export interface ExecutionDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  execution: WorkflowExecution | null
  runningStepLabel: string
  progressPercent: number
  completedStepCount: number
  isActive: boolean
  authGuide: ReturnType<typeof getExecutionAuthGuide>
  copiedText: boolean
  onCopyText: (text: string) => void
  onPreview: (src: string) => void
  dispatchMeta?: ExecutionDispatchMeta | null
}

export function ExecutionDetailDialog({
  open,
  onOpenChange,
  execution,
  runningStepLabel,
  progressPercent,
  completedStepCount,
  isActive,
  authGuide,
  copiedText,
  onCopyText,
  onPreview,
  dispatchMeta,
}: ExecutionDetailDialogProps) {
  if (!execution) return null

  const statusMeta = getExecutionStatusMeta(execution)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,1240px)] max-w-6xl overflow-hidden border-primary/12 bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--card)))] p-0">
        <div className="flex max-h-[92vh] flex-col">
          <DialogHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.12),transparent_72%)] px-6 py-5 text-left">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">Execution Detail</p>
                <DialogTitle className="mt-2 text-base">{execution.workflowName || '执行详情'}</DialogTitle>
                <p className="mt-3 text-xs text-muted-foreground">当前焦点步骤：{runningStepLabel}</p>
                <p className="mt-2 font-mono text-xs text-muted-foreground">{execution.executionId}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-border/70 bg-background/82 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">完成率</p>
                  <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{progressPercent}%</p>
                  <p className="mt-1 text-xs text-muted-foreground">{completedStepCount}/{Math.max(execution.totalSteps, 1)}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/82 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">账号通道</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{dispatchMeta?.accountSummary || '待识别账号'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{dispatchMeta?.laneDetail || '任务启动后会展示账号通道与排队关系。'}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/82 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">截图节点</p>
                  <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{execution.actionNodes.length}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/82 px-4 py-3 sm:col-span-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">状态</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={cn('gap-1.5', statusMeta.badgeClassName)}>
                      {execution.status === 'cancelling' || isActive ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {statusMeta.label}
                    </Badge>
                    {dispatchMeta ? (
                      <Badge variant="outline" className="border-border/70 bg-background/88 text-[10px] uppercase tracking-[0.16em]">
                        {dispatchMeta.laneLabel}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{execution.accumulatedText ? '已收到 AI 输出流' : '等待输出返回'}，任务内部子步骤会严格顺序推进。</p>
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="overflow-y-auto px-6 py-5">
            <div className="space-y-5">
              {authGuide && (
                <div className="flex flex-col gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/85 p-4 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>
                    <div className="space-y-1">
                      <p className="font-medium">{authGuide.title}</p>
                      <p className="text-xs leading-5 text-amber-800/90 dark:text-amber-200/90">{authGuide.description}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">任务结构</p>
                <div className="mt-3 grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl border border-border/70 bg-background/88 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">工作流</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{execution.workflowName || execution.workflowId}</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/88 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">任务实例</p>
                    <p className="mt-1 font-mono text-xs text-foreground/82">{execution.executionId}</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/88 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">账号通道</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{dispatchMeta?.accountSummary || '待识别账号'}</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/88 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">子任务层</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{execution.totalSteps} 个步骤串行推进</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[0.95fr,1fr,1.08fr]">
                <div className="space-y-3" data-testid="execution-steps">
                  <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">步骤时间线</p>
                      <span className="font-mono text-lg font-semibold text-foreground">{progressPercent}%</span>
                    </div>
                    <div className="mt-3">
                      <Progress value={progressPercent} className="h-2" />
                    </div>
                    <div className="mt-4 space-y-0">
                      {execution.steps.map((step, idx) => {
                        const isLast = idx === execution.steps.length - 1
                        return (
                          <div key={step.id} className="relative flex items-start gap-3 pb-4">
                            {!isLast && (
                              <div
                                className={cn(
                                  'absolute left-[9px] top-5 h-[calc(100%-8px)] w-px',
                                  step.status === 'done' ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-border',
                                )}
                              />
                            )}
                            <div className="relative z-10 mt-0.5 shrink-0">
                              {step.status === 'failed' ? (
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"><X className="h-3 w-3 text-red-500"/></div>
                              ) : step.status === 'done' ? (
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500"/></div>
                              ) : step.status === 'running' ? (
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10"><Loader2 className="h-3.5 w-3.5 animate-spin text-primary"/></div>
                              ) : (
                                <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-muted-foreground/20"><Circle className="h-2 w-2 text-muted-foreground/30"/></div>
                              )}
                            </div>
                            <span className={cn('text-sm leading-6', step.status === 'running' ? 'font-medium text-primary' : step.status === 'done' ? 'text-foreground' : 'text-muted-foreground')}>
                              {step.nameZh}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="space-y-3" data-testid="execution-screenshots">
                  <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">截图节点</p>
                    {execution.actionNodes.length === 0 ? (
                      <div className="mt-4 flex h-52 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 text-muted-foreground">
                        <Camera className="mb-2 h-8 w-8 opacity-20"/>
                        <p className="text-xs">等待截图...</p>
                      </div>
                    ) : (
                      <div className="mt-4 max-h-[25rem] space-y-3 overflow-y-auto pr-1 scrollbar-thin">
                        {execution.actionNodes.map((node) => (
                          <ExecutionScreenshotCard key={node.id} node={node} onPreview={onPreview}/>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3" data-testid="execution-output">
                  <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">AI 完整输出</p>
                        <p className="mt-1 text-xs text-muted-foreground">适合直接复制给运营、排障或追溯系统执行决策。</p>
                      </div>
                      {execution.accumulatedText && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
                          onClick={() => onCopyText(execution.accumulatedText || '')}
                        >
                          {copiedText ? <Check className="h-3 w-3 text-emerald-500"/> : <ClipboardCopy className="h-3 w-3"/>}
                          {copiedText ? '已复制' : '复制'}
                        </Button>
                      )}
                    </div>
                    <div className="mt-4 h-[25rem] overflow-y-auto rounded-[20px] bg-zinc-950 p-4 font-mono text-xs text-zinc-100 shadow-inner scrollbar-thin">
                      {execution.accumulatedText ? (
                        <pre className="whitespace-pre-wrap break-words leading-relaxed">{execution.accumulatedText}</pre>
                      ) : (
                        <p className="flex items-center gap-2 text-zinc-500">
                          <Loader2 className="h-3 w-3 animate-spin"/>等待 AI 输出...
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
