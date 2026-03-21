import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
  AlertTriangle, Camera, CheckCircle2, Circle, Cpu, FileSearch, Link as LinkIcon, Loader2,
  LogIn, Megaphone, Play, RefreshCw, Search, ShieldCheck, Square, Unplug, UserPlus, X,
} from 'lucide-react'
import {AnimatePresence, motion} from 'motion/react'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card'
import {Label} from '@/components/ui/label'
import {Progress} from '@/components/ui/progress'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Skeleton} from '@/components/ui/skeleton'
import {Slider} from '@/components/ui/slider'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import AddProfileDialog from '@/components/settings/AddProfileDialog'
import PlatformLoginDialog from '@/components/settings/PlatformLoginDialog'
import TaskMonitorPanel from '@/components/dashboard/TaskMonitorPanel'
import {useAuth} from '@/contexts/AuthContext'
import {useJobs} from '@/hooks/useJobs'
import {usePlatformAccounts} from '@/hooks/usePlatformAccounts'
import {PLATFORMS} from '@/lib/constants'
import {cn} from '@/lib/utils'
import {JobManagementPanel} from '@/pages/Jobs'
import Candidates from '@/pages/Candidates'
import {testBackendConnection} from '@/services/workflowService'
import type {WorkflowId} from '@/services/workflowService'
import {useSettingsStore} from '@/stores/useSettingsStore'
import {useWorkflowStore} from '@/stores/useWorkflowStore'

const WORKFLOW_CARDS: Array<{
  id: WorkflowId
  title: string
  desc: string
  icon: React.ElementType
  multiPlatform: boolean
}> = [
  {id: 'publish_job', title: '发布招聘公告', desc: '复用已绑定账号发布岗位。', icon: Megaphone, multiPlatform: false},
  {id: 'talent_explore', title: '市场人才探索', desc: '进入人才库采集并沟通候选人。', icon: Search, multiPlatform: false},
  {id: 'resume_screen', title: '简历筛选及AI沟通', desc: '多平台依次复用默认账号执行。', icon: FileSearch, multiPlatform: true},
]

const statusBadge = (status: string) => {
  switch (status) {
    case 'active': return <Badge variant="default">已绑定</Badge>
    case 'verifying': return <Badge variant="secondary">处理中</Badge>
    case 'expired': return <Badge variant="destructive">已失效</Badge>
    default: return <Badge variant="outline">待绑定</Badge>
  }
}

const bindingStatus = (status?: string | null) => {
  switch (status) {
    case 'running': return '执行中'
    case 'awaiting_sms': return '等待验证码'
    case 'awaiting_qr': return '等待扫码'
    case 'awaiting_password_2fa': return '等待二次验证'
    case 'completed': return '最近成功'
    case 'failed': return '最近失败'
    default: return '暂无会话'
  }
}

export default function JilingRecruit() {
  const {user} = useAuth()
  const {jobs, loading: jobsLoading} = useJobs()
  const {catalog, accounts, loading: accountsLoading, startVerify, startUnbind, load: reloadPlatformAccounts} = usePlatformAccounts()
  const {platformConfigs, companyProfile, updatePlatformConfig} = useSettingsStore()
  const {activeExecution, lastExecution, backendReady, startWorkflow, cancelWorkflow, setBackendReady} = useWorkflowStore()
  const safeCompanyProfile = companyProfile || {name: '', address: '', size: '', overview: ''}

  const [selectedPlatform, setSelectedPlatform] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [selectedJobId, setSelectedJobId] = useState('')
  const [matchThreshold, setMatchThreshold] = useState(60)
  const [pageLoading, setPageLoading] = useState(true)
  const [addAccountOpen, setAddAccountOpen] = useState(false)
  const [bindDialogOpen, setBindDialogOpen] = useState(false)
  const [bindAccountId, setBindAccountId] = useState<string | null>(null)
  const [actionPendingAccountId, setActionPendingAccountId] = useState<string | null>(null)
  const [workflowError, setWorkflowError] = useState<string | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  const textEndRef = useRef<HTMLDivElement>(null)
  const displayExec = activeExecution || lastExecution
  const selectedJob = jobs.find((job) => job.id === selectedJobId)
  const selectedPlatformAccounts = useMemo(() => accounts.filter((item) => item.platform === selectedPlatform), [accounts, selectedPlatform])
  const selectedAccount = useMemo(() => selectedPlatformAccounts.find((item) => item.id === selectedAccountId), [selectedAccountId, selectedPlatformAccounts])
  const progressPercent = displayExec ? Math.round((displayExec.steps.filter((step) => step.status === 'done').length / Math.max(displayExec.totalSteps, 1)) * 100) : 0

  useEffect(() => {
    testBackendConnection().then(() => setBackendReady(true)).catch(() => setBackendReady(false)).finally(() => setPageLoading(false))
  }, [setBackendReady])

  useEffect(() => {
    if (!selectedPlatform && catalog[0]) setSelectedPlatform(catalog[0].key)
  }, [catalog, selectedPlatform])

  useEffect(() => {
    if (!selectedPlatforms.length && catalog.length) setSelectedPlatforms(catalog.map((item) => item.key))
  }, [catalog, selectedPlatforms.length])

  useEffect(() => {
    if (!selectedJobId && jobs.length) setSelectedJobId(jobs[0].id)
  }, [jobs, selectedJobId])

  useEffect(() => {
    if (!selectedPlatform) return
    const boundId = platformConfigs[selectedPlatform]?.boundProfileId
    const fallbackId = selectedPlatformAccounts[0]?.id || ''
    if (!selectedAccountId || !selectedPlatformAccounts.some((item) => item.id === selectedAccountId)) {
      setSelectedAccountId(boundId || fallbackId)
    }
  }, [platformConfigs, selectedAccountId, selectedPlatform, selectedPlatformAccounts])

  useEffect(() => {
    textEndRef.current?.scrollIntoView({behavior: 'smooth'})
  }, [displayExec?.accumulatedText])

  const togglePlatformSelection = (platform: string) => {
    setSelectedPlatforms((prev) => prev.includes(platform) ? prev.filter((item) => item !== platform) : [...prev, platform])
  }

  const resolveBoundAccountId = useCallback((platform: string) => {
    return platformConfigs[platform]?.boundProfileId || accounts.find((item) => item.platform === platform && item.status === 'active')?.id || ''
  }, [accounts, platformConfigs])

  const handleStartWorkflow = useCallback(async (workflowId: WorkflowId) => {
    if (!selectedJob) return
    setWorkflowError(null)
    const workflow = WORKFLOW_CARDS.find((item) => item.id === workflowId)
    if (!workflow) return

    if (!workflow.multiPlatform) {
      if (!selectedPlatform || !selectedAccountId || !selectedAccount || selectedAccount.status !== 'active') {
        setWorkflowError('请先为当前平台选择一个已绑定的有效账号')
        return
      }
      await startWorkflow({
        workflow_id: workflowId,
        tenant_id: user?.tenantId || '',
        user_id: user?.id || '',
        platform: selectedPlatform,
        account_id: selectedAccountId,
        account_name: selectedAccount.accountName || selectedAccount.name,
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
        company_name: platformConfigs[selectedPlatform]?.nickname || safeCompanyProfile.name || '我们公司',
        company_address: safeCompanyProfile.address,
        company_size: safeCompanyProfile.size,
        company_overview: safeCompanyProfile.overview,
        min_match_score: matchThreshold,
        max_results: 30,
      })
      return
    }

    const platformAccountIds: Record<string, string> = {}
    for (const platform of selectedPlatforms) {
      const accountId = resolveBoundAccountId(platform)
      if (!accountId) {
        setWorkflowError(`平台 ${PLATFORMS[platform as keyof typeof PLATFORMS]?.name || platform} 尚未配置默认执行账号`)
        return
      }
      platformAccountIds[platform] = accountId
    }
    await startWorkflow({
      workflow_id: workflowId,
      tenant_id: user?.tenantId || '',
      user_id: user?.id || '',
      platform: selectedPlatforms[0] || '',
      platforms: selectedPlatforms,
      platform_account_ids: platformAccountIds,
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
      company_name: platformConfigs[selectedPlatforms[0] || '']?.nickname || safeCompanyProfile.name || '我们公司',
      company_address: safeCompanyProfile.address,
      company_size: safeCompanyProfile.size,
      company_overview: safeCompanyProfile.overview,
      min_match_score: matchThreshold,
      max_results: 30,
    })
  }, [matchThreshold, platformConfigs, resolveBoundAccountId, safeCompanyProfile, selectedAccount, selectedAccountId, selectedJob, selectedPlatform, selectedPlatforms, startWorkflow, user])

  const handleAction = async (type: 'verify' | 'unbind', accountId: string) => {
    setActionPendingAccountId(accountId)
    setWorkflowError(null)
    try {
      if (type === 'verify') await startVerify(accountId)
      else await startUnbind(accountId)
      setBindAccountId(accountId)
      setBindDialogOpen(true)
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : `${type === 'verify' ? '验证' : '解绑'}失败`)
    } finally {
      setActionPendingAccountId(null)
    }
  }

  if (pageLoading || accountsLoading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-56"/><div className="grid gap-4 xl:grid-cols-3">{Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-72 rounded-xl"/>)}</div></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/15 bg-gradient-to-br from-primary/20 to-primary/5">
            <Cpu className="h-5 w-5 text-primary"/>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">机灵招聘</h1>
            <p className="text-sm text-muted-foreground">平台账号绑定、持久登录、招聘工作流统一编排</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setAddAccountOpen(true)}><UserPlus className="h-4 w-4"/>新增平台账号</Button>
      </div>

      {!backendReady && <div className="flex items-center gap-3 rounded-xl border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800"><AlertTriangle className="h-5 w-5 shrink-0"/>后端服务未连接，请确认 FastAPI 已启动。</div>}
      {workflowError && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{workflowError}</div>}

      <div className="grid gap-4 xl:grid-cols-[1.15fr,1.15fr,1fr]">
        <Card><CardHeader><CardTitle className="text-base">平台目录</CardTitle><CardDescription>固定 6 个国内招聘平台，预置企业端地址。</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{catalog.map((item) => {
          const count = accounts.filter((account) => account.platform === item.key).length
          return <button key={item.key} type="button" onClick={() => setSelectedPlatform(item.key)} className={cn('rounded-xl border p-4 text-left transition-colors', selectedPlatform === item.key ? 'border-primary bg-primary/5' : 'border-border')}>
            <div className="flex items-center justify-between gap-2"><p className="font-medium">{item.name}</p><Badge variant={count ? 'default' : 'outline'}>{count}</Badge></div>
            <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><LinkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0"/><span className="break-all">{item.enterprise_url}</span></div>
          </button>
        })}</CardContent></Card>

        <Card><CardHeader><CardTitle className="text-base">{PLATFORMS[selectedPlatform as keyof typeof PLATFORMS]?.name || '平台'}账号列表</CardTitle><CardDescription>同平台多账号并存，每个账号独立持久会话。</CardDescription></CardHeader><CardContent className="space-y-3">{selectedPlatformAccounts.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">当前平台暂无账号。</div> : selectedPlatformAccounts.map((account) => <div key={account.id} className={cn('rounded-xl border p-4', selectedAccountId === account.id ? 'border-primary bg-primary/5' : 'border-border')}>
          <div className="flex items-start justify-between gap-3">
            <button type="button" className="flex-1 text-left" onClick={() => setSelectedAccountId(account.id)}>
              <div className="flex items-center gap-2 flex-wrap"><p className="text-sm font-medium">{account.name}</p>{statusBadge(account.status)}</div>
              <p className="mt-2 text-xs text-muted-foreground">登录名：{account.accountName || account.loginIdentifierMasked || '未填写'}</p>
              <p className="mt-1 text-xs text-muted-foreground">最近会话：{bindingStatus(account.latestBindingSession?.status)}</p>
              {account.lastError && <p className="mt-2 text-xs text-red-500">{account.lastError}</p>}
            </button>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => { setBindAccountId(account.id); setBindDialogOpen(true) }}><LogIn className="h-4 w-4"/></Button>
              <Button variant="ghost" size="sm" onClick={() => handleAction('verify', account.id)} disabled={actionPendingAccountId === account.id}>{actionPendingAccountId === account.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>}</Button>
              <Button variant="ghost" size="sm" onClick={() => handleAction('unbind', account.id)} disabled={actionPendingAccountId === account.id}><Unplug className="h-4 w-4"/></Button>
            </div>
          </div>
        </div>)}</CardContent></Card>

        <Card><CardHeader><CardTitle className="text-base">账号任务面板</CardTitle><CardDescription>默认执行账号、最近状态、绑定/验证/解绑入口。</CardDescription></CardHeader><CardContent className="space-y-4">
          <div className="space-y-2"><Label className="text-xs text-muted-foreground">当前平台默认执行账号</Label><Select value={platformConfigs[selectedPlatform]?.boundProfileId || selectedAccountId || ''} onValueChange={(value) => { updatePlatformConfig(selectedPlatform, {boundProfileId: value}); setSelectedAccountId(value) }}><SelectTrigger><SelectValue placeholder="选择默认执行账号"/></SelectTrigger><SelectContent>{selectedPlatformAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent></Select></div>
          {selectedAccount ? <div className="rounded-xl border p-4">
            <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{selectedAccount.name}</p>{statusBadge(selectedAccount.status)}</div>
            <p className="mt-3 text-xs text-muted-foreground">最近会话：{bindingStatus(selectedAccount.latestBindingSession?.status)}</p>
            <p className="mt-1 text-xs text-muted-foreground">会话键：{selectedAccount.browserSessionKey || '未生成'}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" className="gap-2" onClick={() => { setBindAccountId(selectedAccount.id); setBindDialogOpen(true) }}><LogIn className="h-4 w-4"/>开始绑定</Button>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => handleAction('verify', selectedAccount.id)}><ShieldCheck className="h-4 w-4"/>验证登录</Button>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => handleAction('unbind', selectedAccount.id)}><Unplug className="h-4 w-4"/>解绑账号</Button>
            </div>
            {selectedAccount.latestBindingSession?.latest_screenshot_url && <button type="button" className="mt-4 overflow-hidden rounded-lg border" onClick={() => setLightboxSrc(selectedAccount.latestBindingSession?.latest_screenshot_url || null)}><img src={selectedAccount.latestBindingSession.latest_screenshot_url} alt="最近任务截图" className="h-36 w-full object-cover object-top"/></button>}
          </div> : <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">请选择一个账号。</div>}
        </CardContent></Card>
      </div>

      <Tabs defaultValue="execute" className="space-y-6">
        <TabsList className="h-9"><TabsTrigger value="execute" className="gap-1.5"><Play className="h-3.5 w-3.5"/>招聘执行</TabsTrigger><TabsTrigger value="jobs" className="gap-1.5"><Cpu className="h-3.5 w-3.5"/>岗位管理</TabsTrigger><TabsTrigger value="candidates" className="gap-1.5"><FileSearch className="h-3.5 w-3.5"/>候选人</TabsTrigger></TabsList>
        <TabsContent value="execute" className="space-y-6 mt-0">
          <Card><CardContent className="pt-4 pb-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="flex-1 space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">招聘岗位</Label><Select value={selectedJobId || ''} onValueChange={setSelectedJobId} disabled={jobsLoading || !!activeExecution}><SelectTrigger><SelectValue placeholder={jobsLoading ? '加载中...' : '选择岗位'}/></SelectTrigger><SelectContent>{jobs.length === 0 ? <SelectItem value="_none" disabled>暂无岗位</SelectItem> : jobs.map((job) => <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>)}</SelectContent></Select></div>
            <div className="w-full lg:w-56 space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">单平台执行平台</Label><Select value={selectedPlatform} onValueChange={setSelectedPlatform} disabled={!!activeExecution}><SelectTrigger><SelectValue placeholder="选择平台"/></SelectTrigger><SelectContent>{catalog.map((item) => <SelectItem key={item.key} value={item.key}>{item.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="w-full lg:w-56 space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">单平台执行账号</Label><Select value={selectedAccountId || ''} onValueChange={setSelectedAccountId} disabled={!!activeExecution}><SelectTrigger><SelectValue placeholder="选择账号"/></SelectTrigger><SelectContent>{selectedPlatformAccounts.length === 0 ? <SelectItem value="_none" disabled>暂无账号</SelectItem> : selectedPlatformAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="w-full lg:w-56 space-y-1.5"><Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">筛选阈值 · {matchThreshold}分</Label><Slider value={[matchThreshold]} onValueChange={([value]) => setMatchThreshold(value)} min={0} max={100} step={5} disabled={!!activeExecution}/></div>
          </div></CardContent></Card>

          <Card><CardHeader><CardTitle className="text-base">多平台默认执行账号</CardTitle><CardDescription>简历筛选工作流会按下面的映射执行。</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2">{catalog.map((item) => <Button key={item.key} size="sm" variant={selectedPlatforms.includes(item.key) ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => togglePlatformSelection(item.key)} disabled={!!activeExecution}>{item.name}</Button>)}</div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{catalog.map((item) => {
            const platformAccounts = accounts.filter((account) => account.platform === item.key)
            return <div key={item.key} className="rounded-xl border p-4"><p className="text-sm font-medium">{item.name}</p><div className="mt-3"><Select value={platformConfigs[item.key]?.boundProfileId || ''} onValueChange={(value) => updatePlatformConfig(item.key, {boundProfileId: value})}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="选择默认账号"/></SelectTrigger><SelectContent>{platformAccounts.length === 0 ? <SelectItem value="_none" disabled>暂无账号</SelectItem> : platformAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent></Select></div></div>
          })}</div></CardContent></Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{WORKFLOW_CARDS.map((workflow) => {
            const isThisActive = !!activeExecution && activeExecution.workflowId === workflow.id
            const isOtherActive = !!activeExecution && activeExecution.workflowId !== workflow.id
            return <Card key={workflow.id} className={cn(isOtherActive && 'opacity-40', isThisActive && 'ring-2 ring-primary')}><CardHeader><div className="flex items-center justify-between gap-2"><workflow.icon className="h-5 w-5 text-primary"/>{workflow.multiPlatform && <Badge variant="outline">多平台</Badge>}</div><CardTitle className="text-base">{workflow.title}</CardTitle><CardDescription className="text-xs">{workflow.desc}</CardDescription></CardHeader><CardContent><Button className="w-full gap-2" variant={isThisActive ? 'destructive' : 'default'} onClick={() => isThisActive ? cancelWorkflow() : handleStartWorkflow(workflow.id)} disabled={(!!activeExecution && !isThisActive) || !backendReady}>{isThisActive ? <><Square className="h-4 w-4"/>停止执行</> : <><Play className="h-4 w-4"/>开始执行</>}</Button></CardContent></Card>
          })}</div>

          {displayExec && <Card className="overflow-hidden"><CardHeader className="bg-primary/5"><CardTitle className="text-sm">{displayExec.workflowName || '执行监控'}</CardTitle><CardDescription>{displayExec.error || '实时监控当前执行步骤、截图与完整输出。'}</CardDescription></CardHeader><CardContent className="pt-4"><div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-3"><Progress value={progressPercent} className="h-2"/><p className="text-center text-2xl font-bold">{progressPercent}%</p><div className="space-y-2">{displayExec.steps.map((step) => <div key={step.id} className="flex items-center gap-2">{step.status === 'failed' ? <X className="h-4 w-4 text-red-500"/> : step.status === 'done' ? <CheckCircle2 className="h-4 w-4 text-green-500"/> : step.status === 'running' ? <Loader2 className="h-4 w-4 animate-spin text-primary"/> : <Circle className="h-4 w-4 text-muted-foreground/40"/>}<span className="text-sm">{step.nameZh}</span></div>)}</div></div>
            <div className="space-y-3"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">截图节点</p>{displayExec.actionNodes.length === 0 ? <div className="flex h-36 flex-col items-center justify-center rounded-lg border border-dashed text-muted-foreground"><Camera className="mb-2 h-8 w-8 opacity-30"/><p className="text-xs">等待截图...</p></div> : <div className="space-y-3 max-h-72 overflow-y-auto">{displayExec.actionNodes.map((node) => <button key={node.id} type="button" className="w-full overflow-hidden rounded-lg border text-left" onClick={() => setLightboxSrc(node.screenshot || null)}>{node.screenshot ? <img src={node.screenshot} alt={node.action} className="h-28 w-full object-cover object-top"/> : <div className="p-3 text-xs text-muted-foreground">{node.action}</div>}</button>)}</div>}</div>
            <div className="space-y-3"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI 完整输出</p><div className="h-64 overflow-y-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-100">{displayExec.accumulatedText ? <><pre className="whitespace-pre-wrap break-words">{displayExec.accumulatedText}</pre><div ref={textEndRef}/></> : <p className="flex items-center gap-2 text-zinc-500"><Loader2 className="h-3 w-3 animate-spin"/>等待 AI 输出...</p>}</div></div>
          </div></CardContent></Card>}

          <TaskMonitorPanel/>
        </TabsContent>
        <TabsContent value="jobs" className="mt-0"><JobManagementPanel/></TabsContent>
        <TabsContent value="candidates" className="mt-0"><Candidates embedded/></TabsContent>
      </Tabs>

      <AnimatePresence>{lightboxSrc && <motion.div key="lightbox" initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setLightboxSrc(null)}><Button variant="ghost" size="icon" className="absolute right-4 top-4 text-white hover:bg-white/10" onClick={() => setLightboxSrc(null)}><X className="h-5 w-5"/></Button><img src={lightboxSrc} alt="截图放大" className="max-h-[90vh] max-w-full rounded-xl shadow-2xl" onClick={(event) => event.stopPropagation()}/></motion.div>}</AnimatePresence>

      <AddProfileDialog open={addAccountOpen} onOpenChange={setAddAccountOpen} onCreated={reloadPlatformAccounts}/>
      <PlatformLoginDialog open={bindDialogOpen} onOpenChange={setBindDialogOpen} profileId={bindAccountId} onDataChanged={reloadPlatformAccounts}/>
    </div>
  )
}
