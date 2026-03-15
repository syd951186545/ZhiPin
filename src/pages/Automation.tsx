import React, {useCallback, useEffect, useState} from 'react'
import {
  AlertTriangle, FileSearch, Loader2, MessageCircle, Pause, Play,
  Search, Settings,
} from 'lucide-react'
import {motion} from 'motion/react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card'
import {Badge} from '@/components/ui/badge'
import {Skeleton} from '@/components/ui/skeleton'
import {Progress} from '@/components/ui/progress'
import PageHeader from '@/components/shared/PageHeader'
import {useI18n} from '@/contexts/I18nContext'
import {useWebSocket} from '@/contexts/WebSocketContext'
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
  const {isConnected, service} = useWebSocket()
  const {loading} = useAutomationTasks()
  const {platformProfiles, aiSystemPrompt, platformConfigs} = useSettingsStore()

  // Workflow states: maps workflow key to { status, taskId, progress }
  const [workflowStates, setWorkflowStates] = useState<Record<string, {
    status: 'stopped' | 'starting' | 'running' | 'paused'
    taskId?: string
    progress?: number
    message?: string
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
      // Find which workflow this task belongs to
      setWorkflowStates(prev => {
        const updated = {...prev}
        for (const key of Object.keys(updated)) {
          if (updated[key].taskId === data.task_id) {
            updated[key] = {...updated[key], progress: data.progress, message: data.message, status: 'running'}
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
            updated[key] = {status: 'stopped', progress: 100, message: '任务完成'}
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
      // Pause the task
      try {
        await service.pauseTask(current.taskId)
        setWorkflowStates(prev => ({
          ...prev,
          [key]: {...prev[key], status: 'paused'},
        }))
      } catch (err) {
        setWorkflowStates(prev => ({
          ...prev,
          [key]: {...prev[key], message: err instanceof Error ? err.message : '暂停失败'},
        }))
      }
    } else if (current.status === 'paused' && current.taskId) {
      // Resume the task
      try {
        await service.resumeTask(current.taskId)
        setWorkflowStates(prev => ({
          ...prev,
          [key]: {...prev[key], status: 'running'},
        }))
      } catch (err) {
        setWorkflowStates(prev => ({
          ...prev,
          [key]: {...prev[key], message: err instanceof Error ? err.message : '恢复失败'},
        }))
      }
    } else {
      // Start new task
      if (activePlatforms.length === 0) {
        setWorkflowStates(prev => ({
          ...prev,
          [key]: {status: 'stopped', message: '请先在"系统设置 > 账号管理"中配置并登录平台账号'},
        }))
        return
      }

      setWorkflowStates(prev => ({
        ...prev,
        [key]: {status: 'starting', progress: 0},
      }))

      try {
        const platform = activePlatforms[0] // Use first active platform
        const payload = buildTaskPayload(skillId, {
          platform,
          keywords: ['招聘'],
          max_results: 30,
        }, {
          companyName: platformConfigs[platform]?.nickname || '我们公司',
          aiSystemPrompt,
        })

        const result = await service.startTask(payload)

        setWorkflowStates(prev => ({
          ...prev,
          [key]: {status: 'running', taskId: result.taskId, progress: 0},
        }))

      } catch (err) {
        setWorkflowStates(prev => ({
          ...prev,
          [key]: {status: 'stopped', message: err instanceof Error ? err.message : '启动失败'},
        }))
      }
    }
  }, [workflowStates, service, activePlatforms, platformConfigs, aiSystemPrompt])

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

      {!isConnected && (
        <motion.div
          initial={{opacity: 0, y: -10}}
          animate={{opacity: 1, y: 0}}
          className="flex items-center gap-3 rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800 p-4"
        >
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0"/>
          <div>
            <p className="font-medium text-yellow-800 dark:text-yellow-400">{t('automation.disconnected.title')}</p>
            <p className="text-sm text-yellow-700 dark:text-yellow-500">{t('automation.disconnected.desc')}</p>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {WORKFLOW_DEFS.map((wf) => {
          const state = workflowStates[wf.key]
          const isRunning = state.status === 'running'
          const isPaused = state.status === 'paused'
          const isStarting = state.status === 'starting'

          return (
            <motion.div key={wf.key} initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}}>
              <Card className="h-full flex flex-col">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <wf.icon className="h-5 w-5 text-primary"/>
                    </div>
                    <Badge variant={isRunning ? 'default' : isPaused ? 'secondary' : 'outline'}>
                      {isRunning ? t('automation.status.running')
                        : isPaused ? t('automation.status.paused')
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
                    {(isRunning || isPaused) && state.progress !== undefined && (
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
                  </div>
                </CardContent>
                <CardFooter className="gap-2">
                  <Button
                    size="sm"
                    variant={isRunning ? 'secondary' : 'default'}
                    className="flex-1"
                    onClick={() => toggleWorkflow(wf.key)}
                    disabled={!isConnected || isStarting}
                  >
                    {isStarting ? (
                      <><Loader2 className="mr-1 h-3 w-3 animate-spin"/>启动中</>
                    ) : isRunning ? (
                      <><Pause className="mr-1 h-3 w-3"/>{t('automation.action.pause')}</>
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
