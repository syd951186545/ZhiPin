import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Progress} from '@/components/ui/progress'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Slider} from '@/components/ui/slider'
import {Textarea} from '@/components/ui/textarea'
import {cn} from '@/lib/utils'
import {EXECUTION_DISPATCH_BADGE_STYLES, WORKFLOW_THEMES} from '@/components/jiling/jilingRecruitShared'
import type {ExecutionTabHandlers} from '@/components/jiling/ExecutionTab'
import type {ExecutionComposerModel} from '@/components/jiling/useExecutionComposerModel'
import type {ExecutionMode, ScheduleFrequency} from '@/components/jiling/jilingRecruitHelpers'
import {ClipboardCopy, Layers, Link as LinkIcon, Play, RefreshCw, Trash2} from 'lucide-react'
import {motion} from 'motion/react'

interface ExecutionComposerCardProps {
  model: ExecutionComposerModel
  selectedPlatform: string
  matchThreshold: number
  customMessage: string
  messageSendLimit: number
  executionMode: ExecutionMode
  scheduleFrequency: ScheduleFrequency
  scheduleTime: string
  scheduleWeekday: string
  handlers: ExecutionTabHandlers
}

export default function ExecutionComposerCard(props: ExecutionComposerCardProps) {
  const {
    model,
    selectedPlatform,
    matchThreshold,
    customMessage,
    messageSendLimit,
    executionMode,
    scheduleFrequency,
    scheduleTime,
    scheduleWeekday,
    handlers,
  } = props
  const {
    catalog,
    accounts,
    accountsLoading,
    jobs,
    jobsLoading,
    workflowCards,
    selectedWorkflowCard,
    accountUsageCount,
    executionGroupDiagnostics,
    completeExecutionGroups,
    draftExecutionGroups,
    executionPlanPreview,
    workflowStatusMap,
    shouldClampExecutionGroupList,
    resolveDefaultAccountForPlatform,
    resolveDefaultJobForPlatform,
  } = model

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden" data-testid="workflow-cards">
        <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.06),transparent_72%)] pb-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">Workflow Selector</p>
              <CardTitle className="mt-2 text-base">三大工作流</CardTitle>
            </div>
            <div className="flex items-center gap-3 rounded-full border border-border/70 bg-background/80 px-3 py-2 shadow-sm shrink-0">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.18em] whitespace-nowrap">
                筛选阈值 <span className="ml-1 text-foreground font-bold">{matchThreshold}分</span>
              </Label>
              <div className="w-24">
                <Slider value={[matchThreshold]} onValueChange={([value]) => handlers.onMatchThresholdChange(value)} min={0} max={100} step={5}/>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid gap-4 md:grid-cols-3">
            {workflowCards.map((workflow) => {
              const theme = WORKFLOW_THEMES[workflow.id] || WORKFLOW_THEMES.publish_job
              const status = workflowStatusMap[workflow.id]
              const isSelected = selectedWorkflowCard.id === workflow.id
              return (
                <motion.button
                  key={workflow.id}
                  type="button"
                  data-testid={`workflow-card-${workflow.id}`}
                  whileHover={{y: -2}}
                  transition={{duration: 0.2}}
                  onClick={() => handlers.onSelectWorkflow(workflow.id)}
                  className={cn(
                    'rounded-[28px] border bg-background/88 p-4 text-left transition-all duration-200',
                    isSelected ? 'border-primary/40 shadow-[0_18px_48px_-32px_hsl(var(--primary)/0.55)] ring-1 ring-primary/20' : 'border-border/70 hover:border-border hover:shadow-sm',
                  )}
                >
                  <div className={cn('inline-flex h-11 w-11 items-center justify-center rounded-2xl', theme.iconBg)}>
                    <workflow.icon className="h-5 w-5 text-primary"/>
                  </div>
                  <div className="mt-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{workflow.title}</p>
                      <p className="mt-1 text-xs leading-6 text-muted-foreground">{workflow.desc}</p>
                    </div>
                    {workflow.multiPlatform && (
                      <Badge variant="outline" className="gap-1 border-border/70 bg-background/82 text-[10px] uppercase tracking-[0.16em]">
                        <Layers className="h-3 w-3"/>多组
                      </Badge>
                    )}
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">当前状态</span>
                      <Badge variant="outline" className={cn(
                        'border text-[10px] uppercase tracking-[0.16em]',
                        status.state === 'running'
                          ? 'border-primary/30 bg-primary/[0.08] text-primary'
                          : status.state === 'completed'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                            : status.state === 'failed'
                              ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
                              : 'border-border/70 bg-background/82 text-muted-foreground',
                      )}>
                        {status.label}
                      </Badge>
                    </div>
                    <Progress value={status.progress} className="h-2 rounded-full"/>
                    <p className="text-[11px] leading-5 text-muted-foreground">{status.detail}</p>
                  </div>
                </motion.button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="flex flex-col flex-1 overflow-hidden border-primary/12" data-testid="execution-composer">
        <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.05),transparent_72%)] pb-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">Execution Composer</p>
              <CardTitle className="mt-2 text-base">{selectedWorkflowCard.title}</CardTitle>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => handlers.onExecutionModeChange('immediate')} className={cn('rounded-[24px] border px-4 py-3 text-left transition-all', executionMode === 'immediate' ? 'border-primary/35 bg-primary/[0.08] shadow-sm' : 'border-border/70 bg-background/82')}>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Play className="h-4 w-4 text-primary"/>立即执行
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">通过前端校验后立即发起任务。</p>
              </button>
              <button type="button" onClick={() => handlers.onExecutionModeChange('scheduled')} className={cn('rounded-[24px] border px-4 py-3 text-left transition-all', executionMode === 'scheduled' ? 'border-primary/35 bg-primary/[0.08] shadow-sm' : 'border-border/70 bg-background/82')}>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <RefreshCw className="h-4 w-4 text-primary"/>定期执行
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">先在前端排期，等待后端调度适配。</p>
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 space-y-5 pt-5" data-testid="execute-platform-selection">
          {executionMode === 'scheduled' && (
            <div className="grid gap-3 rounded-[28px] border border-amber-200/70 bg-amber-50/70 p-4 dark:border-amber-900/40 dark:bg-amber-950/15 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-900/70 dark:text-amber-100/80">执行频率</Label>
                <Select value={scheduleFrequency} onValueChange={(value: ScheduleFrequency) => handlers.onScheduleFrequencyChange(value)}>
                  <SelectTrigger className="h-10 rounded-2xl border-amber-200/70 bg-background/95 text-sm shadow-none dark:border-amber-900/40">
                    <SelectValue placeholder="选择频率"/>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">每天</SelectItem>
                    <SelectItem value="weekly">每周</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-900/70 dark:text-amber-100/80">执行时间</Label>
                <Input type="time" value={scheduleTime} onChange={(event) => handlers.onScheduleTimeChange(event.target.value)} className="h-10 rounded-2xl border-amber-200/70 bg-background/95 text-sm shadow-none dark:border-amber-900/40"/>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-900/70 dark:text-amber-100/80">周执行日</Label>
                <Select value={scheduleWeekday} onValueChange={handlers.onScheduleWeekdayChange} disabled={scheduleFrequency !== 'weekly'}>
                  <SelectTrigger className="h-10 rounded-2xl border-amber-200/70 bg-background/95 text-sm shadow-none dark:border-amber-900/40">
                    <SelectValue placeholder="选择星期"/>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">周一</SelectItem>
                    <SelectItem value="2">周二</SelectItem>
                    <SelectItem value="3">周三</SelectItem>
                    <SelectItem value="4">周四</SelectItem>
                    <SelectItem value="5">周五</SelectItem>
                    <SelectItem value="6">周六</SelectItem>
                    <SelectItem value="0">周日</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {selectedWorkflowCard.id === 'talent_explore' && (
            <div className="grid gap-4 rounded-[28px] border border-border/70 bg-background/82 p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-2">
                <Label htmlFor="custom-message" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">本次主动沟通覆盖</Label>
                <Textarea id="custom-message" placeholder="留空则沿用平台与账号页中的全局预设。" value={customMessage} onChange={(event) => handlers.onCustomMessageChange(event.target.value)} rows={4} maxLength={500} className="rounded-[22px] border-border/70 bg-background/95 text-sm resize-none"/>
                <p className={cn('text-[11px]', customMessage.length >= 500 ? 'text-destructive font-medium' : customMessage.length >= 450 ? 'text-orange-500' : 'text-muted-foreground')}>
                  {customMessage.length}/500 字符。填写后仅覆盖本次运行。
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">单次发送上限 <span className="ml-1 text-foreground font-bold">{messageSendLimit} 条</span></Label>
                <div className="rounded-[22px] border border-border/70 bg-background/95 p-4">
                  <Slider value={[messageSendLimit]} onValueChange={([value]) => handlers.onMessageSendLimitChange(value)} min={1} max={50} step={1}/>
                  <div className="mt-4 flex items-center gap-3">
                    <Input type="number" min={1} max={50} value={messageSendLimit} onChange={(event) => handlers.onMessageSendLimitChange(Math.max(1, Math.min(50, Number(event.target.value) || 10)))} className="h-10 rounded-2xl text-center text-sm"/>
                    <p className="text-[11px] leading-5 text-muted-foreground">限制一次运行内最多发送多少条消息。</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">执行组编排</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">补齐账号与岗位后即可启动，不同账号可同时运行。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-border/70 bg-background/82 text-[10px] uppercase tracking-[0.16em]">完整 {completeExecutionGroups.length}</Badge>
              <Badge variant="outline" className="border-border/70 bg-background/82 text-[10px] uppercase tracking-[0.16em]">草稿 {draftExecutionGroups.length}</Badge>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={() => handlers.onAddExecutionGroup({platform: selectedPlatform || catalog[0]?.key || '', accountId: selectedPlatform ? resolveDefaultAccountForPlatform(selectedPlatform) : '', jobId: selectedPlatform ? resolveDefaultJobForPlatform(selectedPlatform) : ''})}>
                <Layers className="h-3.5 w-3.5"/>新增执行组
              </Button>
            </div>
          </div>

          <div className="rounded-[24px] border border-primary/12 bg-[linear-gradient(135deg,hsl(var(--primary)/0.08),transparent_78%)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">Execution Plan</p>
            <p className="mt-2 text-sm leading-6 text-foreground/88">{executionPlanPreview.summary}</p>
          </div>

          <div className={cn('space-y-3', shouldClampExecutionGroupList && 'max-h-[36rem] overflow-y-auto pr-1 scrollbar-thin')}>
            {executionGroupDiagnostics.map((item) => {
              const planMeta = executionPlanPreview.metaMap[item.group.id]
              const platformAccounts = accounts.filter((account) => account.platform === item.group.platform && account.status === 'active')
              const hasAccounts = platformAccounts.length > 0
              return (
                <div key={item.group.id} className="rounded-[28px] border border-border/70 bg-background/86 p-4 shadow-sm" data-testid={`execution-group-${item.index}`}>
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-muted/30 text-sm font-semibold text-foreground">{String(item.index + 1).padStart(2, '0')}</div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">执行组 {item.index + 1}</p>
                          <Badge variant="outline" className={cn('border text-[10px] uppercase tracking-[0.16em]', item.complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300' : item.duplicateAccount ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300' : 'border-border/70 bg-background/82 text-muted-foreground')}>
                            {item.complete ? '完整' : item.duplicateAccount ? '冲突' : '草稿'}
                          </Badge>
                          <Badge variant="outline" className={cn('border text-[10px] uppercase tracking-[0.16em]', EXECUTION_DISPATCH_BADGE_STYLES[planMeta?.tone || 'recent'])}>
                            {planMeta?.label || '待补齐'}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.complete ? `${item.platformLabel} · ${item.account?.name || '已选账号'} · ${item.job?.title || '已选岗位'}` : item.missing.join(' / ')}</p>
                        <p className="mt-2 text-[11px] leading-5 text-foreground/78">{planMeta?.detail}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={() => handlers.onDuplicateExecutionGroup(item.group.id)}>
                        <ClipboardCopy className="h-3.5 w-3.5"/>复制
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full text-destructive hover:text-destructive" onClick={() => handlers.onRemoveExecutionGroup(item.group.id)} disabled={executionGroupDiagnostics.length <= 1}>
                        <Trash2 className="h-3.5 w-3.5"/>删除
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">平台</Label>
                      <Select value={item.group.platform || ''} onValueChange={(value) => handlers.onApplyPlatformToExecutionGroup(item.group.id, value)}>
                        <SelectTrigger data-testid={`execution-group-platform-${item.index}`} className="h-11 rounded-2xl border-border/70 bg-background/95 text-sm shadow-none">
                          <SelectValue placeholder="选择平台"/>
                        </SelectTrigger>
                        <SelectContent>
                          {catalog.map((platform) => <SelectItem key={platform.key} value={platform.key}>{platform.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">账号</Label>
                      <Select value={item.group.accountId || ''} onValueChange={(value) => handlers.onUpdateExecutionGroup(item.group.id, {accountId: value})} disabled={!item.group.platform || accountsLoading}>
                        <SelectTrigger data-testid={`execution-group-account-${item.index}`} className="h-11 rounded-2xl border-border/70 bg-background/95 text-sm shadow-none">
                          <SelectValue placeholder={item.group.platform ? '选择账号' : '先选择平台'}/>
                        </SelectTrigger>
                        <SelectContent>
                          {accountsLoading
                            ? <SelectItem value="_loading_accounts" disabled>账号加载中...</SelectItem>
                            : !item.group.platform
                              ? <SelectItem value="_platform_first" disabled>请先选择平台</SelectItem>
                              : platformAccounts.length === 0
                                ? <SelectItem value="_none" disabled>当前平台暂无可用账号</SelectItem>
                                : platformAccounts.map((account) => {
                                  const usedByOthers = Boolean(accountUsageCount.get(account.id)) && account.id !== item.group.accountId
                                  return <SelectItem key={account.id} value={account.id}>{account.name}{usedByOthers ? '（同账号串行）' : ''}</SelectItem>
                                })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">岗位</Label>
                      <Select value={item.group.jobId || ''} onValueChange={(value) => handlers.onUpdateExecutionGroup(item.group.id, {jobId: value})} disabled={jobsLoading}>
                        <SelectTrigger data-testid={`execution-group-job-${item.index}`} className="h-11 rounded-2xl border-border/70 bg-background/95 text-sm shadow-none">
                          <SelectValue placeholder="选择岗位"/>
                        </SelectTrigger>
                        <SelectContent>
                          {jobsLoading
                            ? <SelectItem value="_loading_jobs" disabled>岗位加载中...</SelectItem>
                            : jobs.length === 0
                              ? <SelectItem value="_none" disabled>暂无岗位</SelectItem>
                              : jobs.map((job) => <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <Badge variant="outline" className="border-border/70 bg-background/82 text-muted-foreground">平台可重复</Badge>
                      <Badge variant="outline" className={cn('border-border/70 bg-background/82', item.duplicateAccount ? 'text-sky-700 dark:text-sky-300' : 'text-muted-foreground')}>同账号自动排队</Badge>
                      <Badge variant="outline" className="border-border/70 bg-background/82 text-muted-foreground">岗位可重复</Badge>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => {
                      handlers.onSelectedPlatformChange(item.group.platform || selectedPlatform)
                      handlers.onActiveTabChange('platform-config')
                    }}>
                      <LinkIcon className="h-3.5 w-3.5"/>去平台与账号页补齐长期配置
                    </Button>
                  </div>

                  {!hasAccounts && item.group.platform && (
                    <div className="mt-4 rounded-[22px] border border-amber-200/70 bg-amber-50/75 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                      当前平台还没有可用账号。先到“平台与账号配置”绑定账号，再回到这里编排执行组。
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
