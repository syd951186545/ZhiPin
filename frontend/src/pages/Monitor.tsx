import React, {useEffect, useMemo, useRef, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {ArrowLeft, Camera, CheckCircle2, Circle, Loader2, MonitorPlay, ScrollText} from 'lucide-react'
import EmptyState from '@/components/shared/EmptyState'
import {ExecutionScreenshotCard} from '@/components/jiling/ExecutionScreenshotCard'
import {getExecutionStatusMeta} from '@/components/jiling/ExecutionDetailDialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Progress} from '@/components/ui/progress'
import {Skeleton} from '@/components/ui/skeleton'
import {useI18n} from '@/contexts/I18nContext'
import {useAutomationTasks} from '@/hooks/useAutomationTasks'
import {useTaskLogs} from '@/hooks/useTaskLogs'
import {PLATFORMS, TASK_TYPE} from '@/lib/constants'
import {cn} from '@/lib/utils'
import {useWorkflowStore} from '@/stores/useWorkflowStore'

const getLogColor = (level: string) => {
  switch (level) {
    case 'success':
      return 'text-green-400'
    case 'warning':
      return 'text-yellow-400'
    case 'error':
      return 'text-red-400'
    default:
      return 'text-zinc-300'
  }
}

export default function Monitor() {
  const {taskId} = useParams<{ taskId: string }>()
  const {t, lang} = useI18n()
  const navigate = useNavigate()
  const logsEndRef = useRef<HTMLDivElement>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [runtimeLoading, setRuntimeLoading] = useState(false)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)

  const {tasks, loading: tasksLoading} = useAutomationTasks()
  const matchedTask = useMemo(
    () => tasks.find((task) => task.id === taskId || task.execution_id === taskId),
    [taskId, tasks],
  )
  const resolvedExecutionId = matchedTask?.execution_id || taskId || ''
  const {logs, loading: logsLoading} = useTaskLogs(matchedTask?.id)
  const {executions, hydrateExecutionById} = useWorkflowStore()
  const execution = resolvedExecutionId ? executions[resolvedExecutionId] || null : null

  useEffect(() => {
    if (!resolvedExecutionId) return
    if (execution) {
      setRuntimeLoading(false)
      setRuntimeError(null)
      return
    }

    let cancelled = false
    setRuntimeLoading(true)
    setRuntimeError(null)

    hydrateExecutionById(resolvedExecutionId)
      .then((loaded) => {
        if (cancelled) return
        setRuntimeLoading(false)
        if (!loaded) {
          setRuntimeError('未找到对应的执行记录。')
        }
      })
      .catch((error) => {
        if (cancelled) return
        setRuntimeLoading(false)
        setRuntimeError(error instanceof Error ? error.message : '加载执行记录失败')
      })

    return () => {
      cancelled = true
    }
  }, [execution, hydrateExecutionById, resolvedExecutionId])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({behavior: 'smooth'})
  }, [execution?.accumulatedText, logs])

  const statusMeta = useMemo(() => getExecutionStatusMeta(execution), [execution])
  const progress = execution
    ? Math.round((execution.steps.filter((step) => step.status === 'done').length / Math.max(execution.totalSteps, 1)) * 100)
    : matchedTask?.progress ?? 0
  const resultSummary = useMemo(() => {
    if (execution?.result && typeof execution.result === 'object') {
      return execution.result as Record<string, unknown>
    }
    return (matchedTask?.result_summary as Record<string, unknown> | null) || null
  }, [execution?.result, matchedTask?.result_summary])
  const outputText = execution?.accumulatedText || matchedTask?.full_output || ''
  const taskLogs = useMemo(() => {
    if (logs.length > 0) return logs
    if (!outputText) return []
    return outputText
      .split('\n')
      .map((line, index) => ({id: index, created_at: new Date().toISOString(), level: 'info', message: line.trim()}))
      .filter((item) => item.message)
  }, [logs, outputText])
  const taskTitle = execution?.workflowName || matchedTask?.name || t('monitor.title')
  const platformLabel = execution?.currentPlatform
    || (matchedTask?.platform ? (PLATFORMS[matchedTask.platform as keyof typeof PLATFORMS]?.name || matchedTask.platform) : '-')
  const actionLabel = execution?.workflowName
    || (matchedTask?.type ? (TASK_TYPE[matchedTask.type as keyof typeof TASK_TYPE] || matchedTask.type) : '-')
  const errorMessage = execution?.error || matchedTask?.error_message || runtimeError

  if (tasksLoading || runtimeLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-96" />
          <Skeleton className="h-96 lg:col-span-2" />
        </div>
      </div>
    )
  }

  if (!execution && !matchedTask) {
    return (
      <EmptyState
        title="未找到执行记录"
        description="该链接对应的任务或执行记录不存在，可能已被清理。"
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/jiling-recruit')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {lang === 'zh' ? '返回机灵招聘' : 'Back'}
          </Button>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">{taskTitle}</h1>
            <p className="font-mono text-xs text-muted-foreground">
              执行 ID：{resolvedExecutionId || '-'}
              {matchedTask?.id ? ` · 任务 ID：${matchedTask.id}` : ''}
            </p>
          </div>
        </div>
        <Badge variant="outline" className={cn('gap-1.5', statusMeta.badgeClassName)}>
          {execution && ['queued', 'starting', 'running', 'cancelling'].includes(execution.status) ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : null}
          {statusMeta.label}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('monitor.progress')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={progress} className="h-2" />
              <p className="text-center text-2xl font-bold">{progress}%</p>

              {execution?.steps?.length ? (
                <div className="space-y-3">
                  {execution.steps.map((step) => (
                    <div key={step.id} className="flex items-start gap-3">
                      {step.status === 'done' ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" />
                      ) : step.status === 'running' ? (
                        <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-primary" />
                      ) : (
                        <Circle className={cn('mt-0.5 h-5 w-5', step.status === 'failed' ? 'text-red-500' : 'text-muted-foreground')} />
                      )}
                      <div>
                        <p className={cn('text-sm', step.status === 'running' ? 'font-medium text-primary' : 'text-foreground')}>
                          {step.nameZh}
                        </p>
                        {step.error ? <p className="mt-1 text-xs text-red-500">{step.error}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">等待运行态返回步骤明细。</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('monitor.context')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t('monitor.context.platform')}</span>
                <span className="text-right font-medium">{platformLabel}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t('monitor.context.action')}</span>
                <span className="text-right font-medium">{actionLabel}</span>
              </div>
              {errorMessage ? (
                <div className="rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-600 dark:bg-red-950 dark:text-red-300">
                  {errorMessage}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">执行结果</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {resultSummary ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                    {Object.entries(resultSummary)
                      .filter(([key, value]) => !['screenshots', 'artifacts', 'latest_checkpoint'].includes(key) && value !== null && value !== undefined && typeof value !== 'object')
                      .map(([key, value]) => (
                        <div key={key} className="rounded-lg border p-3">
                          <p className="mb-1 text-xs text-muted-foreground">{key}</p>
                          <p className="break-all font-medium">{String(value)}</p>
                        </div>
                      ))}
                  </div>

                  {typeof resultSummary.announcement === 'string' && resultSummary.announcement ? (
                    <div className="rounded-lg border p-3">
                      <p className="mb-2 text-sm font-medium">AI 公告内容</p>
                      <pre className="whitespace-pre-wrap break-words text-xs leading-6">{resultSummary.announcement}</pre>
                    </div>
                  ) : null}

                  {resultSummary.publish_result && typeof resultSummary.publish_result === 'object' ? (
                    <div className="rounded-lg border p-3">
                      <p className="mb-2 text-sm font-medium">发布结果</p>
                      <pre className="whitespace-pre-wrap break-words text-xs leading-6">
                        {JSON.stringify(resultSummary.publish_result, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">暂无结构化结果</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('monitor.snapshot')}</CardTitle>
            </CardHeader>
            <CardContent>
              {execution?.actionNodes?.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {execution.actionNodes.map((node) => (
                    <ExecutionScreenshotCard key={node.id} node={node} onPreview={setLightboxSrc} />
                  ))}
                </div>
              ) : matchedTask?.screenshot_urls?.length ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {matchedTask.screenshot_urls.map((src, index) => (
                    <button
                      key={`${src}-${index}`}
                      type="button"
                      className="overflow-hidden rounded-lg border text-left"
                      onClick={() => setLightboxSrc(src)}
                    >
                      <img src={src} alt={`截图 ${index + 1}`} className="h-48 w-full object-cover object-top" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center rounded-lg bg-muted">
                  <div className="text-center text-muted-foreground">
                    <MonitorPlay className="mx-auto mb-2 h-12 w-12 opacity-50" />
                    <p className="text-sm">{lang === 'zh' ? '暂无截图' : 'No screenshot'}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ScrollText className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">AI 完整输出</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto rounded-lg border bg-muted/20 p-4">
                {outputText ? (
                  <pre className="whitespace-pre-wrap break-words text-xs leading-6">{outputText}</pre>
                ) : (
                  <p className="text-sm text-muted-foreground">暂无 AI 输出内容</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">{t('monitor.logs')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-80 space-y-1 overflow-y-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs text-zinc-100">
                {logsLoading ? (
                  <p className="text-zinc-500">{lang === 'zh' ? '加载日志...' : 'Loading logs...'}</p>
                ) : taskLogs.length === 0 ? (
                  <p className="text-zinc-500">{lang === 'zh' ? '暂无日志' : 'No logs yet'}</p>
                ) : (
                  taskLogs.map((log) => (
                    <div key={String(log.id)} className="flex gap-2">
                      <span className="shrink-0 text-zinc-500">
                        [{new Date(log.created_at).toLocaleTimeString('zh-CN', {hour12: false})}]
                      </span>
                      <span className={getLogColor(log.level)}>{log.message}</span>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {lightboxSrc ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setLightboxSrc(null)}
        >
          <img src={lightboxSrc} alt="截图预览" className="max-h-full max-w-full rounded-lg border border-white/20" />
        </div>
      ) : null}
    </div>
  )
}
