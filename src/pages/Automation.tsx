import React, {useCallback, useEffect, useRef, useState} from 'react'
import {
  AlertTriangle, Camera, CheckCircle2, Circle,
  FileSearch, Loader2, Megaphone, MessageCircle,
  Play, Search, Square, X, ZoomIn,
} from 'lucide-react'
import {AnimatePresence, motion} from 'motion/react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card'
import {Badge} from '@/components/ui/badge'
import {Label} from '@/components/ui/label'
import {Progress} from '@/components/ui/progress'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Skeleton} from '@/components/ui/skeleton'
import PageHeader from '@/components/shared/PageHeader'
import TaskMonitorPanel from '@/components/dashboard/TaskMonitorPanel'
import {useI18n} from '@/contexts/I18nContext'
import {useOpenClaw} from '@/contexts/OpenClawContext'
import {useAutomationTasks} from '@/hooks/useAutomationTasks'
import {useJobs} from '@/hooks/useJobs'
import {useSettingsStore} from '@/stores/useSettingsStore'
import {buildAutoPublishStagePrompt, buildTaskPayload, type AutoPublishStage} from '@/lib/skills'
import {PLATFORMS} from '@/lib/constants'
import type {
  TaskCompletePayload,
  TaskErrorPayload,
  TaskProgressPayload,
  TaskScreenshotPayload,
} from '@/types/openclaw'

// ── 执行步骤 ──────────────────────────────────────────────────
const STEPS = [
  {key: 'init', label: '准备环境'},
  {key: 'fill', label: '发布准备'},
  {key: 'submit', label: '确认发布'},
]
const PUBLISH_STAGES: AutoPublishStage[] = ['init', 'fill', 'submit']

function getStepFromProgress(progress: number): number {
  if (progress >= 80) return 4
  if (progress >= 60) return 3
  if (progress >= 40) return 2
  if (progress >= 20) return 1
  return 0
}

function extractStepMarks(text: string | undefined): Record<string, boolean> {
  if (!text) return {}
  const marks: Record<string, boolean> = {}
  const regex = /\[STEP_DONE:([a-z_]+)\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    marks[match[1]] = true
  }
  return marks
}

function extractStepFailures(text: string | undefined): Record<string, boolean> {
  if (!text) return {}
  const marks: Record<string, boolean> = {}
  const regex = /\[STEP_FAILED:([a-z_]+)\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    marks[match[1]] = true
  }
  return marks
}

function extractAiAnnouncement(text: string | undefined): string | undefined {
  if (!text) return undefined
  const match = text.match(/【AI公告内容】([\s\S]*?)【\/AI公告内容】/)
  if (match && match[1]) return match[1].trim()
  return undefined
}

// ── Workflow 定义 ─────────────────────────────────────────────
const SKILL_MAP: Record<string, string> = {
  publish: 'auto_publish',
  sourcing: 'auto_source',
  screening: 'resume_screen',
  reply: 'auto_reply',
}

interface WorkflowDef {
  key: string
  title: string
  desc: string
  icon: React.ElementType
  skillId: string
  iconColor: string
  bgColor: string
}

const WORKFLOW_DEFS: WorkflowDef[] = [
  {
    key: 'publish',
    title: '自动发布招聘',
    desc: '登录平台，AI生成招聘公告并自动发布',
    icon: Megaphone,
    skillId: 'auto_publish',
    iconColor: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  {
    key: 'sourcing',
    title: '自动搜索人才',
    desc: '在招聘平台自动搜索并采集候选人资料',
    icon: Search,
    skillId: 'auto_source',
    iconColor: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    key: 'screening',
    title: '简历智能筛选',
    desc: 'AI自动评估简历，按匹配度评分排序',
    icon: FileSearch,
    skillId: 'resume_screen',
    iconColor: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  {
    key: 'reply',
    title: '智能自动沟通',
    desc: '自动回复候选人消息，邀约面试',
    icon: MessageCircle,
    skillId: 'auto_reply',
    iconColor: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
]

// ── 状态类型 ──────────────────────────────────────────────────
interface ActionNode {
  id: string
  time: string
  action: string
  screenshot?: string
}

interface WorkflowState {
  status: 'stopped' | 'starting' | 'running'
  finalStatus?: 'completed' | 'failed' | 'cancelled'
  taskId?: string
  sessionId?: string
  stageIndex?: number
  isCancelled?: boolean
  failedStep?: string
  progress?: number
  message?: string
  accumulatedText?: string
  aiAnnouncement?: string
  stepMarks?: Record<string, boolean>
  actionNodes: ActionNode[]
  error?: string
}

const initState = (): WorkflowState => ({status: 'stopped', actionNodes: [], stepMarks: {}, isCancelled: false})

// ── 主组件 ────────────────────────────────────────────────────
export default function Automation() {
  const {lang} = useI18n()
  const {isReady, service, startTask, cancelTask} = useOpenClaw()
  const {loading} = useAutomationTasks()
  const {jobs, loading: jobsLoading} = useJobs()
  const {platformProfiles, aiSystemPrompt, platformConfigs, companyProfile} = useSettingsStore()
  const safeCompanyProfile = companyProfile || {name: '', address: '', size: '', overview: ''}

  const [workflowStates, setWorkflowStates] = useState<Record<string, WorkflowState>>({
    publish: initState(),
    sourcing: initState(),
    screening: initState(),
    reply: initState(),
  })
  const [publishPlatform, setPublishPlatform] = useState<string>('')
  const [publishProfileId, setPublishProfileId] = useState<string>('')
  const [publishJobId, setPublishJobId] = useState<string>('')
  const [lastResult, setLastResult] = useState<{key: string; state: WorkflowState} | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const textEndRef = useRef<HTMLDivElement>(null)
  const publishCountdownRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activePlatforms = [...new Set(
    platformProfiles.filter(p => p.status === 'active').map(p => p.platform),
  )]
  const activePlatformNames = activePlatforms
    .map(p => PLATFORMS[p as keyof typeof PLATFORMS]?.name || p)
    .join(', ') || '未配置'
  const publishProfiles = platformProfiles.filter((p) => p.platform === publishPlatform)
  const selectedPublishProfile = publishProfiles.find((p) => p.id === publishProfileId)
  const selectedJob = jobs.find((j) => j.id === publishJobId)
  const publishConfig = {
    platform: publishPlatform,
    job_id: publishJobId,
    account_id: publishProfileId,
    account_name: selectedPublishProfile?.accountName || selectedPublishProfile?.name || '',
  }
  const publishContext = {
    job: selectedJob
      ? {
        title: selectedJob.title,
        location: selectedJob.location || undefined,
        salary_min: selectedJob.salary_min || undefined,
        salary_max: selectedJob.salary_max || undefined,
        employment_type: selectedJob.employment_type,
        department: selectedJob.department || undefined,
        description: selectedJob.description || undefined,
        requirements: selectedJob.requirements || undefined,
        benefits: selectedJob.benefits || undefined,
      }
      : undefined,
    companyName: platformConfigs[publishPlatform]?.nickname || safeCompanyProfile.name || '我们公司',
    companyAddress: safeCompanyProfile.address,
    companySize: safeCompanyProfile.size,
    companyOverview: safeCompanyProfile.overview,
    aiSystemPrompt,
  }

  useEffect(() => {
    if (!publishPlatform) {
      setPublishPlatform(activePlatforms[0] || 'boss_zhipin')
    }
  }, [activePlatforms, publishPlatform])

  useEffect(() => {
    const boundProfileId = platformConfigs[publishPlatform]?.boundProfileId
    const fallbackId = publishProfiles[0]?.id || ''
    const nextId = boundProfileId || fallbackId
    if (!publishProfileId || !publishProfiles.find((p) => p.id === publishProfileId)) {
      setPublishProfileId(nextId)
    }
  }, [publishPlatform, publishProfiles, publishProfileId, platformConfigs])

  useEffect(() => {
    if (!publishJobId && jobs.length > 0) {
      setPublishJobId(jobs[0].id)
    }
  }, [jobs, publishJobId])

  // 找到当前运行中的流程
  const activeEntry = Object.entries(workflowStates).find(([, s]) => s.status !== 'stopped')
  const activeKey = activeEntry?.[0]
  const activeState = activeEntry?.[1]
  const displayKey = activeKey ?? lastResult?.key
  const displayState = activeState ?? lastResult?.state
  const displayWfDef = displayKey ? WORKFLOW_DEFS.find(w => w.key === displayKey) : null

  // 订阅 OpenClaw 事件
  useEffect(() => {
    const unsubProgress = service.onTaskProgress((data: TaskProgressPayload) => {
      setWorkflowStates(prev => {
        const updated = {...prev}
        for (const key of Object.keys(updated)) {
          if (updated[key].taskId === data.task_id) {
            const accumulated =
              (data.details?.accumulated as string) ||
              (updated[key].accumulatedText || '') + data.message
            const newMarks = extractStepMarks(accumulated)
            const newFailures = extractStepFailures(accumulated)
            const mergedMarks = {...(updated[key].stepMarks || {}), ...newMarks}
            const announcement = extractAiAnnouncement(accumulated) || updated[key].aiAnnouncement
            const currentStageIndex = updated[key].stageIndex ?? 0
            const currentStageKey = key === 'publish' ? PUBLISH_STAGES[currentStageIndex] : undefined
            const stageJustDone = !!(currentStageKey && newMarks[currentStageKey] && !updated[key].stepMarks?.[currentStageKey])
            const stageFailed = !!(currentStageKey && newFailures[currentStageKey])
            const hasNextStage = key === 'publish' && currentStageIndex < PUBLISH_STAGES.length - 1
            const nextStageIndex = stageJustDone && hasNextStage ? currentStageIndex + 1 : currentStageIndex
            const nextStatus = stageJustDone && hasNextStage ? 'starting' : 'running'
            if (stageFailed) {
              if (publishCountdownRef.current) {
                clearTimeout(publishCountdownRef.current)
                publishCountdownRef.current = null
              }
              if (updated[key].taskId) cancelTask(updated[key].taskId)
              updated[key] = {
                ...updated[key],
                status: 'stopped',
                finalStatus: 'failed',
                message: `❌ 阶段失败：${currentStageKey}`,
                accumulatedText: accumulated,
                stepMarks: mergedMarks,
                aiAnnouncement: announcement,
                failedStep: currentStageKey,
              }
              setLastResult({key, state: updated[key]})
              continue
            }
            updated[key] = {
              ...updated[key],
              progress: key === 'publish'
                ? Math.round((nextStageIndex / PUBLISH_STAGES.length) * 100)
                : (data.progress >= 0 ? data.progress : undefined),
              message: stageJustDone && hasNextStage ? '✅ 阶段完成，进入下一阶段' : data.message,
              accumulatedText: accumulated,
              status: nextStatus,
              finalStatus: undefined,
              stepMarks: mergedMarks,
              aiAnnouncement: announcement,
              stageIndex: nextStageIndex,
              taskId: stageJustDone && hasNextStage ? undefined : updated[key].taskId,
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
            const fullText = (data as any).full_response || updated[key].accumulatedText
            const newMarks = extractStepMarks(fullText)
            const newFailures = extractStepFailures(fullText)
            const mergedMarks = {...(updated[key].stepMarks || {}), ...newMarks}
            const announcement = extractAiAnnouncement(fullText) || updated[key].aiAnnouncement
            if (key === 'publish') {
              const stageIndex = updated[key].stageIndex ?? 0
              const currentStageKey = PUBLISH_STAGES[stageIndex]
              const stageFailed = !!(currentStageKey && newFailures[currentStageKey])
              if (stageFailed) {
                const failedState: WorkflowState = {
                  ...updated[key],
                  status: 'stopped',
                  finalStatus: 'failed',
                  message: `❌ 阶段失败：${currentStageKey}`,
                  accumulatedText: fullText,
                  stepMarks: mergedMarks,
                  aiAnnouncement: announcement,
                  failedStep: currentStageKey,
                }
                updated[key] = failedState
                setLastResult({key, state: failedState})
                continue
              }
              const hasNextStage = stageIndex < PUBLISH_STAGES.length - 1
              if (hasNextStage) {
                const nextStageIndex = stageIndex + 1
                updated[key] = {
                  ...updated[key],
                  status: 'starting',
                  taskId: undefined,
                  stageIndex: nextStageIndex,
                  progress: Math.round((nextStageIndex / PUBLISH_STAGES.length) * 100),
                  message: '✅ 阶段完成，进入下一阶段',
                  accumulatedText: fullText,
                  stepMarks: mergedMarks,
                  aiAnnouncement: announcement,
                }
              } else {
                const completedState: WorkflowState = {
                  ...updated[key],
                  status: 'stopped',
                  finalStatus: 'completed',
                  progress: 100,
                  message: '✅ 任务完成',
                  accumulatedText: fullText,
                  stepMarks: mergedMarks,
                  aiAnnouncement: announcement,
                }
                updated[key] = completedState
                setLastResult({key, state: completedState})
              }
            } else {
              const completedState: WorkflowState = {
                ...updated[key],
                status: 'stopped',
                finalStatus: 'completed',
                progress: 100,
                message: '✅ 任务完成',
                accumulatedText: fullText,
                stepMarks: mergedMarks,
                aiAnnouncement: announcement,
              }
              updated[key] = completedState
              setLastResult({key, state: completedState})
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
            const failedState: WorkflowState = {
              ...updated[key],
              status: 'stopped',
              finalStatus: 'failed',
              message: `❌ ${data.error_message}`,
              error: data.error_message,
            }
            updated[key] = failedState
            setLastResult({key, state: failedState})
          }
        }
        return updated
      })
    })

    const unsubScreenshot = service.onTaskScreenshot((data: TaskScreenshotPayload) => {
      setWorkflowStates(prev => {
        const updated = {...prev}
        for (const key of Object.keys(updated)) {
          if (updated[key].taskId === data.task_id) {
            const node: ActionNode = {
              id: `${data.task_id}-${Date.now()}`,
              time: new Date().toLocaleTimeString('zh-CN', {hour12: false}),
              action: data.action || '操作截图',
              screenshot: data.screenshot,
            }
            updated[key] = {
              ...updated[key],
              actionNodes: [...updated[key].actionNodes, node],
            }
          }
        }
        return updated
      })
    })

    return () => {
      unsubProgress()
      unsubComplete()
      unsubError()
      unsubScreenshot()
    }
  }, [service])

  // 自动滚动 AI 输出到底部
  useEffect(() => {
    textEndRef.current?.scrollIntoView({behavior: 'smooth'})
  }, [displayState?.accumulatedText])

  const startPublishStage = useCallback((stageIndex: number, sessionId: string) => {
    const stage = PUBLISH_STAGES[stageIndex]
    if (!stage) return
    const taskId = `auto_publish-${stage}-${Date.now()}`
    const prompt = buildAutoPublishStagePrompt(stage, publishConfig, publishContext)
    if (stage === 'submit') {
      if (publishCountdownRef.current) {
        clearTimeout(publishCountdownRef.current)
      }
      setWorkflowStates(prev => ({
        ...prev,
        publish: {
          ...prev.publish,
          status: 'running',
          message: '倒计时 5 秒后开始发布...',
          progress: Math.round((stageIndex / PUBLISH_STAGES.length) * 100),
        },
      }))
      publishCountdownRef.current = setTimeout(() => {
        const latest = useSettingsStore.getState()
        if (latest && (latest as any).isCancelled) return
        setWorkflowStates(prev => ({
          ...prev,
          publish: {
            ...prev.publish,
            status: 'running',
            taskId,
            sessionId,
            stageIndex,
          },
        }))
        startTask(prompt, sessionId, taskId)
      }, 5000)
      return
    }
    setWorkflowStates(prev => ({
      ...prev,
      publish: {
        ...prev.publish,
        status: 'running',
        taskId,
        sessionId,
        stageIndex,
        progress: Math.round((stageIndex / PUBLISH_STAGES.length) * 100),
      },
    }))
    startTask(prompt, sessionId, taskId)
  }, [publishConfig, publishContext, startTask])

  useEffect(() => {
    const publishState = workflowStates.publish
    if (
      publishState.status === 'starting' &&
      publishState.sessionId &&
      publishState.stageIndex !== undefined &&
      !publishState.taskId
    ) {
      startPublishStage(publishState.stageIndex, publishState.sessionId)
    }
  }, [workflowStates.publish, startPublishStage])

  const toggleWorkflow = useCallback(async (key: string) => {
    const current = workflowStates[key]
    const skillId = SKILL_MAP[key]

    if ((current.status === 'running' || current.status === 'starting') && current.taskId) {
      if (publishCountdownRef.current) {
        clearTimeout(publishCountdownRef.current)
        publishCountdownRef.current = null
      }
      cancelTask(current.taskId)
      setWorkflowStates(prev => ({
        ...prev,
        [key]: {...prev[key], status: 'stopped', finalStatus: 'cancelled', message: '已停止', isCancelled: true},
      }))
      setLastResult({key, state: {...current, status: 'stopped', finalStatus: 'cancelled', message: '已停止'}})
      return
    }
    if (current.status === 'running' && !current.taskId) {
      if (publishCountdownRef.current) {
        clearTimeout(publishCountdownRef.current)
        publishCountdownRef.current = null
      }
      setWorkflowStates(prev => ({
        ...prev,
        [key]: {...prev[key], status: 'stopped', finalStatus: 'cancelled', message: '已停止', isCancelled: true},
      }))
      setLastResult({key, state: {...current, status: 'stopped', finalStatus: 'cancelled', message: '已停止'}})
      return
    }

    setWorkflowStates(prev => ({
      ...prev,
      [key]: {status: 'starting', progress: 0, accumulatedText: '', actionNodes: [], stepMarks: {}, aiAnnouncement: undefined},
    }))

    try {
      if (key === 'publish') {
        if (!publishPlatform || !publishProfileId || !selectedPublishProfile || !publishJobId || !selectedJob) {
          throw new Error('请先选择平台、账号与招聘岗位')
        }
        const sessionId = crypto.randomUUID()
        setWorkflowStates(prev => ({
          ...prev,
          publish: {
            ...prev.publish,
            status: 'starting',
            taskId: undefined,
            sessionId,
            stageIndex: 0,
            progress: 0,
            accumulatedText: '',
            actionNodes: [],
            stepMarks: {},
            aiAnnouncement: undefined,
          },
        }))
        return
      }

      const platform = activePlatforms[0] || 'boss_zhipin'
      const payload = buildTaskPayload(
        skillId,
        {platform, keywords: ['招聘'], max_results: 30},
        {
          companyName: platformConfigs[platform]?.nickname || '我们公司',
          companyAddress: safeCompanyProfile.address,
          companySize: safeCompanyProfile.size,
          companyOverview: safeCompanyProfile.overview,
          aiSystemPrompt,
        },
      )
      const sessionId = crypto.randomUUID()
      const taskId = `${skillId}-${Date.now()}`

      setWorkflowStates(prev => ({
        ...prev,
        [key]: {status: 'running', taskId, progress: 0, accumulatedText: '', actionNodes: [], stepMarks: {}, aiAnnouncement: undefined},
      }))

      startTask(payload.prompt, sessionId, taskId)
    } catch (err) {
      setWorkflowStates(prev => ({
        ...prev,
        [key]: {
          status: 'stopped',
          finalStatus: 'failed',
          message: err instanceof Error ? err.message : '启动失败',
          actionNodes: [],
        },
      }))
      setLastResult({
        key,
        state: {
          status: 'stopped',
          finalStatus: 'failed',
          message: err instanceof Error ? err.message : '启动失败',
          actionNodes: [],
        },
      })
    }
  }, [workflowStates, startTask, cancelTask, activePlatforms, platformConfigs, aiSystemPrompt])

  // ── 加载骨架屏 ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="智能招聘" description="AI驱动的自动化招聘流程，全程可视化监控"/>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({length: 4}).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-36 w-full"/></CardContent></Card>
          ))}
        </div>
      </div>
    )
  }

  // ── 渲染 ──────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader title="智能招聘" description="AI驱动的自动化招聘流程，全程可视化监控"/>

      {/* OpenClaw 未连接提示 */}
      {!isReady && (
        <motion.div
          initial={{opacity: 0, y: -10}}
          animate={{opacity: 1, y: 0}}
          className="flex items-center gap-3 rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800 p-4"
        >
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0"/>
          <div>
            <p className="font-medium text-yellow-800 dark:text-yellow-400">未连接 OpenClaw</p>
            <p className="text-sm text-yellow-700 dark:text-yellow-500">
              请先在「系统设置」中配置 OpenClaw 连接地址和 Auth Token
            </p>
          </div>
        </motion.div>
      )}

      {/* ── 自动化流程卡片 ── */}
      <section>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          自动化流程
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {WORKFLOW_DEFS.map((wf) => {
            const state = workflowStates[wf.key]
            const isRunning = state.status === 'running'
            const isStarting = state.status === 'starting'
            const isActive = isRunning || isStarting
            const isOtherActive = !!activeKey && activeKey !== wf.key

            return (
              <motion.div
                key={wf.key}
                initial={{opacity: 0, y: 20}}
                animate={{opacity: 1, y: 0}}
              >
                <Card
                  className={`h-full flex flex-col transition-all duration-200 ${
                    isActive
                      ? 'ring-2 ring-primary shadow-lg shadow-primary/10'
                      : isOtherActive
                        ? 'opacity-50'
                        : ''
                  }`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className={`p-2 rounded-lg ${wf.bgColor}`}>
                        <wf.icon className={`h-4 w-4 ${wf.iconColor}`}/>
                      </div>
                      {isActive && (
                        <Badge variant="default" className="text-xs animate-pulse">
                          {isStarting ? '启动中' : '运行中'}
                        </Badge>
                      )}
                      {!isActive && state.message && (
                        <Badge
                          variant="outline"
                          className={`text-xs ${state.error ? 'text-red-500' : 'text-green-600'}`}
                        >
                          {state.error ? '出错' : '完成'}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-sm leading-snug">{wf.title}</CardTitle>
                    <CardDescription className="text-xs">{wf.desc}</CardDescription>
                  </CardHeader>

                  <CardContent className="flex-1 pb-2">
                    {wf.key === 'publish' && (
                      <div className="space-y-2 mb-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">发布平台</Label>
                          <Select
                            value={publishPlatform}
                            onValueChange={setPublishPlatform}
                            disabled={isActive}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="选择平台"/>
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(PLATFORMS).map(([key, p]) => (
                                <SelectItem key={key} value={key}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">账号</Label>
                          <Select
                            value={publishProfileId || ''}
                            onValueChange={setPublishProfileId}
                            disabled={isActive}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="选择账号"/>
                            </SelectTrigger>
                            <SelectContent>
                              {publishProfiles.length === 0 ? (
                                <SelectItem value="_none" disabled>暂无账号，请先在系统设置中添加</SelectItem>
                              ) : (
                                publishProfiles.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.name}{p.accountName ? ` (${p.accountName})` : ''}{p.status === 'active' ? ' ✓' : ''}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">招聘岗位</Label>
                          <Select
                            value={publishJobId || ''}
                            onValueChange={setPublishJobId}
                            disabled={isActive || jobsLoading}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder={jobsLoading ? '加载中...' : '选择岗位'}/>
                            </SelectTrigger>
                            <SelectContent>
                              {jobs.length === 0 ? (
                                <SelectItem value="_none" disabled>暂无岗位，请先在企业管理中创建</SelectItem>
                              ) : (
                                jobs.map((j) => (
                                  <SelectItem key={j.id} value={j.id}>
                                    {j.title}{j.location ? ` - ${j.location}` : ''}{j.status !== 'active' ? ` (${j.status})` : ''}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                    {isRunning && state.progress !== undefined && state.progress >= 0 && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>进度</span>
                          <span>{state.progress}%</span>
                        </div>
                        <Progress value={state.progress} className="h-1"/>
                      </div>
                    )}
                    {!isActive && (
                      <p className="text-xs text-muted-foreground truncate">
                        {state.message || activePlatformNames}
                      </p>
                    )}
                  </CardContent>

                  <CardFooter className="pt-0">
                    <Button
                      size="sm"
                      variant={isRunning ? 'destructive' : 'default'}
                      className="flex-1 h-7 text-xs"
                      onClick={() => toggleWorkflow(wf.key)}
                      disabled={!isReady || isStarting || isOtherActive}
                    >
                      {isStarting ? (
                        <><Loader2 className="mr-1 h-3 w-3 animate-spin"/>启动中</>
                      ) : isRunning ? (
                        <><Square className="mr-1 h-3 w-3"/>停止</>
                      ) : (
                        <><Play className="mr-1 h-3 w-3"/>启动</>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* ── 执行监控面板（运行时展开） ── */}
      <AnimatePresence>
        {displayKey && displayState && displayWfDef && (
          <motion.section
            key="exec-panel"
            initial={{opacity: 0, y: 16}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: -8}}
            transition={{duration: 0.25}}
          >
            <Card className="border-primary/30 overflow-hidden">
              {/* 面板标题栏 */}
              <CardHeader className="bg-primary/5 border-b border-primary/10 py-3">
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg ${displayWfDef.bgColor}`}>
                    <displayWfDef.icon className={`h-4 w-4 ${displayWfDef.iconColor}`}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm">{displayWfDef.title}</CardTitle>
                      <Badge
                        variant="default"
                        className={`text-xs ${
                          displayState.status === 'running' || displayState.status === 'starting'
                            ? 'animate-pulse'
                            : ''
                        }`}
                      >
                        {displayState.status === 'starting'
                          ? '启动中...'
                          : displayState.status === 'running'
                            ? '执行中'
                            : displayState.finalStatus === 'completed'
                              ? '已完成'
                              : displayState.finalStatus === 'failed'
                                ? '已失败'
                                : displayState.finalStatus === 'cancelled'
                                  ? '已停止'
                                  : '已结束'}
                      </Badge>
                    </div>
                    {displayState.message && (
                      <CardDescription className="text-xs mt-0.5 truncate">
                        {displayState.message}
                      </CardDescription>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-4 pb-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                  {/* 左列：步骤进度 */}
                  <div className="space-y-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      执行进度
                    </p>
                    {displayState.progress !== undefined && displayState.progress >= 0 && (
                      <div className="space-y-1.5">
                        <Progress value={displayState.progress} className="h-2"/>
                        <p className="text-center text-2xl font-bold tabular-nums">
                          {displayState.progress}%
                        </p>
                      </div>
                    )}
                    <div className="space-y-2.5">
                      {STEPS.map((step, idx) => {
                        const hasMarks = !!displayState.stepMarks && Object.keys(displayState.stepMarks).length > 0
                        const firstPendingIndex = hasMarks
                          ? STEPS.findIndex((s) => !displayState.stepMarks?.[s.key])
                          : getStepFromProgress(displayState.progress || 0)
                        const done = hasMarks ? !!displayState.stepMarks?.[step.key] : idx < firstPendingIndex
                        const current = displayState.status === 'running' && idx === (firstPendingIndex === -1 ? STEPS.length - 1 : firstPendingIndex)
                        return (
                          <div key={step.key} className="flex items-center gap-2.5">
                            {displayState.failedStep === step.key
                              ? <X className="h-4 w-4 text-red-500 shrink-0"/>
                              : done
                              ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0"/>
                              : current
                                ? <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0"/>
                                : <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0"/>
                            }
                            <span
                              className={`text-sm ${
                                displayState.failedStep === step.key
                                  ? 'text-red-500 font-medium'
                                  : done || current
                                    ? 'text-foreground font-medium'
                                    : 'text-muted-foreground'
                              }`}
                            >
                              {step.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* 中列：操作截图时间线 */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      操作记录节点
                    </p>
                  <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
                    {displayState.actionNodes.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-36 rounded-lg border border-dashed text-muted-foreground">
                        <Camera className="h-8 w-8 mb-2 opacity-30"/>
                        <p className="text-xs">等待 Agent 操作截图...</p>
                      </div>
                    ) : (
                      displayState.actionNodes.map((node, idx) => (
                        <div key={node.id} className="flex gap-3">
                          {/* 时间线轴 */}
                          <div className="flex flex-col items-center shrink-0">
                            <div className="h-6 w-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                              {idx + 1}
                            </div>
                            {idx < displayState.actionNodes.length - 1 && (
                              <div className="w-px flex-1 bg-border mt-1 mb-0"/>
                            )}
                          </div>
                            {/* 节点内容 */}
                            <div className="flex-1 pb-3">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <span className="text-xs font-medium leading-none">{node.action}</span>
                                <span className="text-[10px] text-muted-foreground">{node.time}</span>
                              </div>
                              {node.screenshot ? (
                                <div
                                  className="relative rounded-md border overflow-hidden cursor-zoom-in group"
                                  onClick={() => setLightboxSrc(node.screenshot!)}
                                >
                                  <img
                                    src={node.screenshot}
                                    alt={node.action}
                                    className="w-full h-28 object-cover object-top"
                                  />
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <ZoomIn className="h-5 w-5 text-white"/>
                                  </div>
                                </div>
                              ) : (
                                <div className="h-6 rounded bg-muted/50 flex items-center px-2">
                                  <span className="text-[10px] text-muted-foreground">无截图</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* 右列：AI 实时输出 */}
                  <div className="space-y-3">
                    {displayState.aiAnnouncement && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20 p-3">
                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mb-2">
                          AI 公告内容
                        </p>
                        <pre className="whitespace-pre-wrap break-words text-xs text-foreground leading-relaxed">
                          {displayState.aiAnnouncement}
                        </pre>
                      </div>
                    )}
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      AI助理反馈
                    </p>
                    <div className="h-72 rounded-lg bg-zinc-950 dark:bg-zinc-900 text-zinc-100 p-3 font-mono text-xs overflow-y-auto">
                      {displayState.accumulatedText ? (
                        <>
                          <pre className="whitespace-pre-wrap break-words leading-relaxed">
                            {displayState.accumulatedText}
                          </pre>
                          <div ref={textEndRef}/>
                        </>
                      ) : (
                        <p className="text-zinc-500 flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin"/>
                          等待 AI 输出...
                        </p>
                      )}
                    </div>
                  </div>

                </div>
              </CardContent>
            </Card>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ── 任务监控（嵌入式） ── */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <div className="h-px flex-1 bg-border"/>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">
            任务监控
          </p>
          <div className="h-px flex-1 bg-border"/>
        </div>
        <TaskMonitorPanel/>
      </section>

      {/* ── 截图灯箱 ── */}
      <AnimatePresence>
        {lightboxSrc && (
          <motion.div
            key="lightbox"
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
            onClick={() => setLightboxSrc(null)}
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 text-white hover:bg-white/10"
              onClick={() => setLightboxSrc(null)}
            >
              <X className="h-5 w-5"/>
            </Button>
            <motion.img
              initial={{scale: 0.92, opacity: 0}}
              animate={{scale: 1, opacity: 1}}
              exit={{scale: 0.92, opacity: 0}}
              src={lightboxSrc}
              alt="操作截图"
              className="max-w-full max-h-[90vh] rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
