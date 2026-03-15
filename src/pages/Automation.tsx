import React, {useCallback, useEffect, useState} from 'react'
import {
  AlertTriangle, FileSearch, Loader2, MessageCircle, Pause, Play,
  Search, Settings, Square,
} from 'lucide-react'
import {motion} from 'motion/react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card'
import {Badge} from '@/components/ui/badge'
import {Skeleton} from '@/components/ui/skeleton'
import {Progress} from '@/components/ui/progress'
import PageHeader from '@/components/shared/PageHeader'
import {useI18n} from '@/contexts/I18nContext'
import {useOpenClaw} from '@/contexts/OpenClawContext'
import {useAutomationTasks} from '@/hooks/useAutomationTasks'
import {useSettingsStore} from '@/stores/useSettingsStore'
import {buildTaskPayload} from '@/lib/skills'
import {PLATFORMS} from '@/lib/constants'
import type {TaskProgressPayload, TaskCompletePayload, TaskErrorPayload} from '@/types/openclaw'

// Skill → workflow key mapping
const SKILL_MAP: Record<string, string> = {
  sourcing: 'auto_source',
  screening: 'resume_screen',
  reply: 'auto_reply',
}

interface WorkflowCard {
  key: string
  titleKey: string
  descKey: string
  icon: React.ElementType
  skillId: string
}

const WORKFLOW_DEFS: WorkflowCard[] = [
  {key: 'sourcing', titleKey: 'automation.workflow.sourcing.title', descKey: 'automation.workflow.sourcing.desc', icon: Search, skillId: 'auto_source'},
  {key: 'screening', titleKey: 'automation.workflow.screening.title', descKey: 'automation.workflow.screening.desc', icon: FileSearch, skillId: 'resume_screen'},
  {key: 'reply', titleKey: 'automation.workflow.reply.title', descKey: 'automation.workflow.reply.desc', icon: MessageCircle, skillId: 'auto_reply'},
]

export default function Automation() {
  const {t} = useI18n()
  const {isReady, service, startTask, cancelTask} = useOpenClaw()
  const {loading} = useAutomationTasks()
  const {platformProfiles, aiSystemPrompt, platformConfigs} = useSettingsStore()

  // Workflow states
  const [workflowStates, setWorkflowStates] = useState<Record<string, {
    status: 'stopped' | 'starting' | 'running'
    taskId?: string
    progress?: number
    message?: string
    accumulatedText?: string
  }>>({
    sourcing: {status: 'stopped'},
    screening: {status: 'stopped'},
    reply: {status: 'stopped'},
  })

  // Get active platforms from profiles
  const activePlatforms = [...new Set(platformProfiles.filter(p => p.status === 'active').map(p => p.platform))]
  const activePlatformNames = activePlatforms.map(p => PLATFORMS[p as keyof typeof PLATFORMS]?.name || p).join(', ') || '未配置'

  // Subscribe to task events
  useEffect(() => {
    const unsubProgress = service.onTaskProgress((data: TaskProgressPayload) => {
      setWorkflowStates(prev => {
        const updated = {...prev}
        for (const key of Object.keys(updated)) {
          if (updated[key].taskId === data.task_id) {
            const accumulated = (data.details?.accumulated as string) || (updated[key].accumulatedText || '') + data.message
            updated[key] = {
              ...updated[key],
              progress: data.progress >= 0 ? data.progress : undefined,
              message: data.message,
              accumulatedText: accumulated,
              status: 'running',
            }
          }
        }
        return updated
      })
    })

    const unsubComplete = service.onTaskComplete((data: TaskCompletePayload) => {
      setWorkflowStates(prev => {
        const updated = {...prev}
        for (const key of Object.keys(updated)) {
          if (updated[key].taskId === data.task_id) {
            updated[key] = {
              status: 'stopped',
              progress: 100,
              message: '任务完成',
              accumulatedText: (data as any).full_response || updated[key].accumulatedText,
            }
          }
        }
        return updated
      })
    })

    const unsubError = service.onTaskError((data: TaskErrorPayload) => {
      setWorkflowStates(prev => {
        const updated = {...prev}
        for (const key of Object.keys(updated)) {
          if (updated[key].taskId === data.task_id) {
            updated[key] = {status: 'stopped', message: data.error_message}
          }
        }
        return updated
      })
    })

    return () => {
      unsubProgress()
      unsubComplete()
      unsubError()
    }
  }, [service])

  const toggleWorkflow = useCallback(async (key: string) => {
    const current = workflowStates[key]
    const skillId = SKILL_MAP[key]

    if (current.status === 'running' && current.taskId) {
      // 停止任务
      cancelTask(current.taskId)
      setWorkflowStates(prev => ({
        ...prev,
        [key]: {status: 'stopped', message: '已停止'},
      }))
    } else {
      // 启动新任务
      setWorkflowStates(prev => ({
        ...prev,
        [key]: {status: 'starting', progress: 0, accumulatedText: ''},
      }))

      try {
        const platform = activePlatforms[0] || 'boss_zhipin'
        const payload = buildTaskPayload(skillId, {
          platform,
          keywords: ['招聘'],
          max_results: 30,
        }, {
          companyName: platformConfigs[platform]?.nickname || '我们公司',
          aiSystemPrompt,
        })

        const sessionId = crypto.randomUUID()
        const taskId = `${skillId}-${Date.now()}`

        setWorkflowStates(prev => ({
          ...prev,
          [key]: {status: 'running', taskId, progress: 0, accumulatedText: ''},
        }))

        // 异步发送，不 await（SSE 流会通过事件回调更新状态）
        startTask(payload.prompt, sessionId, taskId)

      } catch (err) {
        setWorkflowStates(prev => ({
          ...prev,
          [key]: {status: 'stopped', message: err instanceof Error ? err.message : '启动失败'},
        }))
      }
    }
  }, [workflowStates, startTask, cancelTask, activePlatforms, platformConfigs, aiSystemPrompt])

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('automation.title')} description={t('automation.desc')}/>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({length: 3}).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-40 w-full"/></CardContent></Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('automation.title')} description={t('automation.desc')}/>

      {!isReady && (
        <motion.div
          initial={{opacity: 0, y: -10}}
          animate={{opacity: 1, y: 0}}
          className="flex items-center gap-3 rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800 p-4"
        >
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0"/>
          <div>
            <p className="font-medium text-yellow-800 dark:text-yellow-400">未连接 OpenClaw</p>
            <p className="text-sm text-yellow-700 dark:text-yellow-500">请先在"系统设置"中配置 OpenClaw 连接地址和 Auth Token</p>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {WORKFLOW_DEFS.map((wf) => {
          const state = workflowStates[wf.key]
          const isRunning = state.status === 'running'
          const isStarting = state.status === 'starting'

          return (
            <motion.div key={wf.key} initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}}>
              <Card className="h-full flex flex-col">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <wf.icon className="h-5 w-5 text-primary"/>
                    </div>
                    <Badge variant={isRunning ? 'default' : 'outline'}>
                      {isRunning ? t('automation.status.running')
                        : isStarting ? '启动中...' : '已停止'}
                    </Badge>
                  </div>
                  <CardTitle className="text-base">{t(wf.titleKey as any)}</CardTitle>
                  <CardDescription>{t(wf.descKey as any)}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex justify-between">
                      <span>{t('automation.platforms')}</span>
                      <span>{activePlatformNames}</span>
                    </div>
                    {isRunning && state.progress !== undefined && state.progress >= 0 && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>进度</span>
                          <span>{state.progress}%</span>
                        </div>
                        <Progress value={state.progress} className="h-1.5"/>
                      </div>
                    )}
                    {state.message && (
                      <p className="text-xs truncate">{state.message}</p>
                    )}
                    {isRunning && state.accumulatedText && (
                      <div className="mt-2 max-h-24 overflow-y-auto rounded bg-muted/50 p-2 text-xs font-mono whitespace-pre-wrap">
                        {state.accumulatedText.slice(-500)}
                      </div>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="gap-2">
                  <Button
                    size="sm"
                    variant={isRunning ? 'destructive' : 'default'}
                    className="flex-1"
                    onClick={() => toggleWorkflow(wf.key)}
                    disabled={!isReady || isStarting}
                  >
                    {isStarting ? (
                      <><Loader2 className="mr-1 h-3 w-3 animate-spin"/>启动中</>
                    ) : isRunning ? (
                      <><Square className="mr-1 h-3 w-3"/>停止</>
                    ) : (
                      <><Play className="mr-1 h-3 w-3"/>{t('automation.action.start')}</>
                    )}
                  </Button>
                  <Button size="sm" variant="outline">
                    <Settings className="h-3 w-3"/>
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )
        })}
      </div>

    </div>
  )
}
