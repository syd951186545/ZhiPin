import React, {useCallback, useEffect, useRef, useState} from 'react'
import {
  AlertTriangle, Camera, CheckCircle2, Circle,
  FileSearch, Loader2, Megaphone, Search,
  Play, Square, X, ZoomIn,
} from 'lucide-react'
import {AnimatePresence, motion} from 'motion/react'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card'
import {Badge} from '@/components/ui/badge'
import {Label} from '@/components/ui/label'
import {Progress} from '@/components/ui/progress'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Slider} from '@/components/ui/slider'
import {Skeleton} from '@/components/ui/skeleton'
import PageHeader from '@/components/shared/PageHeader'
import TaskMonitorPanel from '@/components/dashboard/TaskMonitorPanel'
import {useI18n} from '@/contexts/I18nContext'
import {useAuth} from '@/contexts/AuthContext'
import {useJobs} from '@/hooks/useJobs'
import {useSettingsStore} from '@/stores/useSettingsStore'
import {useWorkflowStore} from '@/stores/useWorkflowStore'
import {testBackendConnection} from '@/services/workflowService'
import {PLATFORMS} from '@/lib/constants'
import type {WorkflowId} from '@/services/workflowService'

// ── 工作流卡片定义 ───────────────────────────────────────

interface WorkflowCardDef {
  id: WorkflowId
  title: string
  desc: string
  icon: React.ElementType
  iconColor: string
  bgColor: string
  multiPlatform: boolean
}

const WORKFLOW_CARDS: WorkflowCardDef[] = [
  {
    id: 'publish_job',
    title: '发布招聘公告',
    desc: 'AI生成招聘公告并自动发布到指定平台',
    icon: Megaphone,
    iconColor: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    multiPlatform: false,
  },
  {
    id: 'talent_explore',
    title: '市场人才探索',
    desc: '搜索匹配候选人，主动沟通并记录结果',
    icon: Search,
    iconColor: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    multiPlatform: false,
  },
  {
    id: 'resume_screen',
    title: '简历筛选及AI沟通',
    desc: '多平台简历采集分析，达标者自动沟通邀约',
    icon: FileSearch,
    iconColor: 'text-green-500',
    bgColor: 'bg-green-500/10',
    multiPlatform: true,
  },
]

// ── 主组件 ────────────────────────────────────────────────

export default function Automation() {
  const {lang} = useI18n()
  const {user} = useAuth()
  const {jobs, loading: jobsLoading} = useJobs()
  const {platformProfiles, platformConfigs, companyProfile} = useSettingsStore()
  const safeCompanyProfile = companyProfile || {name: '', address: '', size: '', overview: ''}

  const {
    activeExecution,
    lastExecution,
    backendReady,
    startWorkflow,
    cancelWorkflow,
    setBackendReady,
  } = useWorkflowStore()

  // ── 配置状态 ────────────────────────────────────────────
  const [selectedPlatform, setSelectedPlatform] = useState<string>('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState<string>('')
  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [matchThreshold, setMatchThreshold] = useState<number>(60)
  const [maxResults] = useState<number>(30)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const textEndRef = useRef<HTMLDivElement>(null)

  // ── 派生数据 ────────────────────────────────────────────
  const activePlatforms = [...new Set(
    platformProfiles.filter(p => p.status === 'active').map(p => p.platform),
  )]
  const profilesForPlatform = platformProfiles.filter((p) => p.platform === selectedPlatform)
  const selectedProfile = profilesForPlatform.find((p) => p.id === selectedProfileId)
  const selectedJob = jobs.find((j) => j.id === selectedJobId)

  const displayExec = activeExecution || lastExecution
  const displayCard = displayExec ? WORKFLOW_CARDS.find(c => c.id === displayExec.workflowId) : null
  const isActive = !!activeExecution

  // ── 初始化 ──────────────────────────────────────────────
  useEffect(() => {
    testBackendConnection()
      .then(() => setBackendReady(true))
      .catch(() => setBackendReady(false))
      .finally(() => setLoading(false))
  }, [setBackendReady])

  useEffect(() => {
    if (!selectedPlatform && activePlatforms.length > 0) {
      setSelectedPlatform(activePlatforms[0])
    }
  }, [activePlatforms, selectedPlatform])

  useEffect(() => {
    const boundId = platformConfigs[selectedPlatform]?.boundProfileId
    const fallbackId = profilesForPlatform[0]?.id || ''
    if (!selectedProfileId || !profilesForPlatform.find(p => p.id === selectedProfileId)) {
      setSelectedProfileId(boundId || fallbackId)
    }
  }, [selectedPlatform, profilesForPlatform, selectedProfileId, platformConfigs])

  useEffect(() => {
    if (!selectedJobId && jobs.length > 0) {
      setSelectedJobId(jobs[0].id)
    }
  }, [jobs, selectedJobId])

  useEffect(() => {
    if (selectedPlatforms.length === 0 && activePlatforms.length > 0) {
      setSelectedPlatforms([...activePlatforms])
    }
  }, [activePlatforms, selectedPlatforms.length])

  useEffect(() => {
    textEndRef.current?.scrollIntoView({behavior: 'smooth'})
  }, [displayExec?.accumulatedText])

  // ── 启动工作流 ──────────────────────────────────────────
  const handleStart = useCallback(async (workflowId: WorkflowId) => {
    if (!selectedJob) return
    const card = WORKFLOW_CARDS.find(c => c.id === workflowId)
    if (!card) return

    const platform = card.multiPlatform ? selectedPlatforms[0] : selectedPlatform
    const platforms = card.multiPlatform ? selectedPlatforms : undefined

    await startWorkflow({
      workflow_id: workflowId,
      tenant_id: user?.tenantId || '',
      user_id: user?.id || '',
      platform: platform || '',
      platforms,
      account_name: selectedProfile?.accountName || selectedProfile?.name || '',
      job_id: selectedJob.id,
      job_title: selectedJob.title,
      job_location: selectedJob.location || '',
      job_salary_min: selectedJob.salary_min || undefined,
      job_salary_max: selectedJob.salary_max || undefined,
      job_employment_type: selectedJob.employment_type,
      job_department: selectedJob.department || '',
      job_description: selectedJob.description || '',
      job_requirements: selectedJob.requirements || '',
      job_benefits: selectedJob.benefits || '',
      company_name: platformConfigs[platform]?.nickname || safeCompanyProfile.name || '我们公司',
      company_address: safeCompanyProfile.address,
      company_size: safeCompanyProfile.size,
      company_overview: safeCompanyProfile.overview,
      min_match_score: matchThreshold,
      max_results: maxResults,
    })
  }, [selectedJob, selectedPlatform, selectedPlatforms, selectedProfile, user, platformConfigs, safeCompanyProfile, matchThreshold, maxResults, startWorkflow])

  // ── 多平台选择切换 ──────────────────────────────────────
  const togglePlatformSelection = (key: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key],
    )
  }

  // ── 加载骨架屏 ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="智能招聘" description="AI驱动的自动化招聘流程，全程可视化监控"/>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({length: 3}).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-44 w-full"/></CardContent></Card>
          ))}
        </div>
      </div>
    )
  }

  // ── 步骤进度 ────────────────────────────────────────────
  const progressPercent = displayExec
    ? Math.round(
        (displayExec.steps.filter(s => s.status === 'done').length / Math.max(displayExec.totalSteps, 1)) * 100,
      )
    : 0

  // ── 渲染 ──────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader title="智能招聘" description="AI驱动的自动化招聘流程，全程可视化监控"/>

      {/* 后端未连接提示 */}
      {!backendReady && (
        <motion.div
          initial={{opacity: 0, y: -10}}
          animate={{opacity: 1, y: 0}}
          className="flex items-center gap-3 rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800 p-4"
        >
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0"/>
          <div>
            <p className="font-medium text-yellow-800 dark:text-yellow-400">后端服务未连接</p>
            <p className="text-sm text-yellow-700 dark:text-yellow-500">
              请确认 FastAPI 后端已启动（python server/main.py）
            </p>
          </div>
        </motion.div>
      )}

      {/* ── 工作流卡片 ── */}
      <section>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          自动化流程
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {WORKFLOW_CARDS.map((wf) => {
            const isThisActive = isActive && activeExecution?.workflowId === wf.id
            const isOtherActive = isActive && activeExecution?.workflowId !== wf.id

            return (
              <motion.div
                key={wf.id}
                initial={{opacity: 0, y: 20}}
                animate={{opacity: 1, y: 0}}
              >
                <Card
                  className={`h-full flex flex-col transition-all duration-200 ${
                    isThisActive
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
                      {isThisActive && (
                        <Badge variant="default" className="text-xs animate-pulse">
                          {activeExecution?.status === 'starting' ? '启动中' : '运行中'}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-sm leading-snug">{wf.title}</CardTitle>
                    <CardDescription className="text-xs">{wf.desc}</CardDescription>
                  </CardHeader>

                  <CardContent className="flex-1 pb-2">
                    {/* 单平台选择 */}
                    {!wf.multiPlatform && (
                      <div className="space-y-2 mb-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">目标平台</Label>
                          <Select value={selectedPlatform} onValueChange={setSelectedPlatform} disabled={isActive}>
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
                          <Select value={selectedProfileId || ''} onValueChange={setSelectedProfileId} disabled={isActive}>
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="选择账号"/>
                            </SelectTrigger>
                            <SelectContent>
                              {profilesForPlatform.length === 0 ? (
                                <SelectItem value="_none" disabled>暂无账号</SelectItem>
                              ) : (
                                profilesForPlatform.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.name}{p.accountName ? ` (${p.accountName})` : ''}{p.status === 'active' ? ' ✓' : ''}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {/* 多平台选择 */}
                    {wf.multiPlatform && (
                      <div className="space-y-2 mb-3">
                        <Label className="text-xs text-muted-foreground">选择平台（可多选）</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(PLATFORMS).map(([key, p]) => (
                            <Button
                              key={key}
                              size="sm"
                              variant={selectedPlatforms.includes(key) ? 'default' : 'outline'}
                              className="h-6 text-xs px-2"
                              onClick={() => togglePlatformSelection(key)}
                              disabled={isActive}
                            >
                              {p.name}
                            </Button>
                          ))}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">匹配阈值: {matchThreshold}分</Label>
                          <Slider
                            value={[matchThreshold]}
                            onValueChange={([v]) => setMatchThreshold(v)}
                            min={0}
                            max={100}
                            step={5}
                            disabled={isActive}
                            className="py-1"
                          />
                        </div>
                      </div>
                    )}

                    {/* 岗位选择 */}
                    <div className="space-y-1 mb-2">
                      <Label className="text-xs text-muted-foreground">招聘岗位</Label>
                      <Select value={selectedJobId || ''} onValueChange={setSelectedJobId} disabled={isActive || jobsLoading}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder={jobsLoading ? '加载中...' : '选择岗位'}/>
                        </SelectTrigger>
                        <SelectContent>
                          {jobs.length === 0 ? (
                            <SelectItem value="_none" disabled>暂无岗位</SelectItem>
                          ) : (
                            jobs.map((j) => (
                              <SelectItem key={j.id} value={j.id}>
                                {j.title}{j.location ? ` - ${j.location}` : ''}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>

                  <CardFooter className="pt-0">
                    <Button
                      size="sm"
                      variant={isThisActive ? 'destructive' : 'default'}
                      className="flex-1 h-7 text-xs"
                      onClick={() => isThisActive ? cancelWorkflow() : handleStart(wf.id)}
                      disabled={!backendReady || (isActive && !isThisActive) || activeExecution?.status === 'starting'}
                    >
                      {activeExecution?.status === 'starting' && isThisActive ? (
                        <><Loader2 className="mr-1 h-3 w-3 animate-spin"/>启动中</>
                      ) : isThisActive ? (
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

      {/* ── 执行监控面板 ── */}
      <AnimatePresence>
        {displayExec && displayCard && (
          <motion.section
            key="exec-panel"
            initial={{opacity: 0, y: 16}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: -8}}
            transition={{duration: 0.25}}
          >
            <Card className="border-primary/30 overflow-hidden">
              {/* 标题栏 */}
              <CardHeader className="bg-primary/5 border-b border-primary/10 py-3">
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg ${displayCard.bgColor}`}>
                    <displayCard.icon className={`h-4 w-4 ${displayCard.iconColor}`}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm">
                        {displayExec.workflowName || displayCard.title}
                      </CardTitle>
                      <Badge
                        variant="default"
                        className={`text-xs ${
                          displayExec.status === 'running' || displayExec.status === 'starting' ? 'animate-pulse' : ''
                        }`}
                      >
                        {displayExec.status === 'starting' ? '启动中...'
                          : displayExec.status === 'running' ? '执行中'
                          : displayExec.status === 'completed' ? '已完成'
                          : displayExec.status === 'failed' ? '已失败'
                          : displayExec.status === 'cancelled' ? '已停止'
                          : '已结束'}
                      </Badge>
                      {displayExec.multiPlatform && displayExec.currentPlatform && (
                        <Badge variant="outline" className="text-xs">
                          平台 {(displayExec.currentPlatformIndex || 0) + 1}/{displayExec.totalPlatforms} · {displayExec.currentPlatform}
                        </Badge>
                      )}
                    </div>
                    {displayExec.error && (
                      <CardDescription className="text-xs mt-0.5 text-red-500 truncate">
                        {displayExec.error}
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
                    {progressPercent >= 0 && (
                      <div className="space-y-1.5">
                        <Progress value={progressPercent} className="h-2"/>
                        <p className="text-center text-2xl font-bold tabular-nums">
                          {progressPercent}%
                        </p>
                      </div>
                    )}
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {displayExec.steps.map((step) => (
                        <div key={step.id} className="flex items-center gap-2.5">
                          {step.status === 'failed'
                            ? <X className="h-4 w-4 text-red-500 shrink-0"/>
                            : step.status === 'done'
                            ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0"/>
                            : step.status === 'running'
                            ? <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0"/>
                            : <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0"/>
                          }
                          <span
                            className={`text-sm ${
                              step.status === 'failed'
                                ? 'text-red-500 font-medium'
                                : step.status === 'done' || step.status === 'running'
                                  ? 'text-foreground font-medium'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {step.nameZh}
                          </span>
                        </div>
                      ))}
                      {displayExec.steps.length === 0 && (
                        <p className="text-xs text-muted-foreground">等待后端返回步骤列表...</p>
                      )}
                    </div>
                  </div>

                  {/* 中列：操作截图时间线 */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        操作截图节点
                      </p>
                      {displayExec.actionNodes.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          {displayExec.actionNodes.length}
                        </Badge>
                      )}
                    </div>
                    <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
                      {displayExec.actionNodes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-36 rounded-lg border border-dashed text-muted-foreground">
                          <Camera className="h-8 w-8 mb-2 opacity-30"/>
                          <p className="text-xs">等待 Agent 操作截图...</p>
                        </div>
                      ) : (
                        displayExec.actionNodes.map((node, idx) => (
                          <div key={node.id} className="flex gap-3">
                            <div className="flex flex-col items-center shrink-0">
                              <div className="h-6 w-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                                {idx + 1}
                              </div>
                              {idx < displayExec.actionNodes.length - 1 && (
                                <div className="w-px flex-1 bg-border mt-1"/>
                              )}
                            </div>
                            <div className="flex-1 pb-3">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <span className="text-xs font-medium leading-none truncate max-w-[110px]">
                                  {node.action}
                                </span>
                                <span className="text-[10px] text-muted-foreground shrink-0">{node.time}</span>
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
                                    onError={(e) => {
                                      const img = e.target as HTMLImageElement
                                      img.style.display = 'none'
                                      const box = img.closest('.relative') as HTMLElement | null
                                      if (box) {
                                        box.className = 'h-12 rounded bg-muted/40 flex items-center justify-center'
                                        box.innerHTML = '<span class="text-[10px] text-muted-foreground">截图加载失败</span>'
                                      }
                                    }}
                                  />
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <ZoomIn className="h-5 w-5 text-white"/>
                                  </div>
                                </div>
                              ) : (
                                <div className="h-6 rounded bg-muted/50 flex items-center px-2">
                                  <span className="text-[10px] text-muted-foreground">仅文本输出</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* 右列：AI 完整输出（含全部步骤，完成后持续展示） */}
                  <div className="space-y-3">
                    {/* 完成结果摘要 */}
                    {(displayExec.status === 'completed' || displayExec.status === 'failed') &&
                      displayExec.result && (
                      <div className={`rounded-lg border p-3 ${
                        displayExec.status === 'completed'
                          ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                          : 'border-red-200 bg-red-50/40 dark:border-red-900/40 dark:bg-red-950/20'
                      }`}>
                        <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                          displayExec.status === 'completed'
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'text-red-700 dark:text-red-300'
                        }`}>
                          {displayExec.status === 'completed' ? '✅ 执行完成' : '❌ 执行失败'}
                        </p>
                        {displayExec.result.announcement && (
                          <details className="mb-2" open>
                            <summary className="text-xs font-medium cursor-pointer mb-1 select-none">
                              📄 AI 生成公告内容
                            </summary>
                            <pre className="whitespace-pre-wrap break-words text-xs text-foreground leading-relaxed mt-1.5 max-h-40 overflow-y-auto">
                              {displayExec.result.announcement}
                            </pre>
                          </details>
                        )}
                        {displayExec.result.result_summary &&
                          Object.keys(displayExec.result.result_summary).length > 0 && (
                          <div className="space-y-1">
                            {Object.entries(displayExec.result.result_summary).map(([k, v]) => (
                              <div key={k} className="flex justify-between text-xs">
                                <span className="text-muted-foreground">{k}</span>
                                <span className="font-medium">{String(v)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      AI 助理完整输出
                    </p>
                    <div className="h-64 rounded-lg bg-zinc-950 dark:bg-zinc-900 text-zinc-100 p-3 font-mono text-xs overflow-y-auto">
                      {displayExec.accumulatedText ? (
                        <>
                          <pre className="whitespace-pre-wrap break-words leading-relaxed">
                            {displayExec.accumulatedText}
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

      {/* ── 任务监控 ── */}
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
