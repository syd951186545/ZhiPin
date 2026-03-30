import type {ExecutionComposerModel} from '@/components/jiling/useExecutionComposerModel'
import type {ExecutionGroup, ExecutionMode, ScheduleFrequency} from '@/components/jiling/jilingRecruitHelpers'
import {TabsContent} from '@/components/ui/tabs'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import ExecutionComposerCard from '@/components/jiling/ExecutionComposerCard'
import ExecutionLaunchSidebar from '@/components/jiling/ExecutionLaunchSidebar'
import ExecutionPreviewPanels from '@/components/jiling/ExecutionPreviewPanels'
import TaskMonitorPanel from '@/components/dashboard/TaskMonitorPanel'
import {ArrowRight} from 'lucide-react'

export interface ExecutionTabHandlers {
  onSelectedPlatformChange: (value: string) => void
  onActiveTabChange: (value: string) => void
  onSelectedExecutionChange: (value: string) => void
  onMatchThresholdChange: (value: number) => void
  onCustomMessageChange: (value: string) => void
  onMessageSendLimitChange: (value: number) => void
  onExecutionModeChange: (value: ExecutionMode) => void
  onScheduleFrequencyChange: (value: ScheduleFrequency) => void
  onScheduleTimeChange: (value: string) => void
  onScheduleWeekdayChange: (value: string) => void
  onSelectWorkflow: (value: string) => void
  onAddExecutionGroup: (initial?: Partial<Omit<ExecutionGroup, 'id'>>) => void
  onUpdateExecutionGroup: (groupId: string, updates: Partial<Omit<ExecutionGroup, 'id'>>) => void
  onRemoveExecutionGroup: (groupId: string) => void
  onDuplicateExecutionGroup: (groupId: string) => void
  onApplyPlatformToExecutionGroup: (groupId: string, platform: string) => void
  onStartWorkflow: (workflowId: string) => void
  onCancelWorkflow: (executionId: string) => void
  onOpenExecutionDetail: () => void
  onPreviewImage: (src: string) => void
}

interface ExecutionTabProps {
  model: ExecutionComposerModel
  selectedPlatform: string
  selectedExecutionId: string | null
  matchThreshold: number
  customMessage: string
  messageSendLimit: number
  executionMode: ExecutionMode
  scheduleFrequency: ScheduleFrequency
  scheduleTime: string
  scheduleWeekday: string
  handlers: ExecutionTabHandlers
}

export default function ExecutionTab(props: ExecutionTabProps) {
  const {
    model,
    selectedPlatform,
    selectedExecutionId,
    matchThreshold,
    customMessage,
    messageSendLimit,
    executionMode,
    scheduleFrequency,
    scheduleTime,
    scheduleWeekday,
    handlers,
  } = props

  return (
    <TabsContent value="execute" className="space-y-6 mt-0" data-testid="execute-tab">
      <Card className="overflow-hidden border-primary/12" data-testid="execution-flow-guide">
        <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.06),transparent_72%)] py-3">
          <div className="flex items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">Execution Guide</p>
            <CardTitle className="text-sm">执行流程</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            {[
              {label: '1. 配置招聘岗位', tab: 'jobs'},
              {label: '2. 配置平台及账号', tab: 'platform-config'},
              {label: '3. 选择工作流', tab: ''},
              {label: '4. 编排任务', tab: ''},
              {label: '5. 点击执行', tab: ''},
              {label: '6. 等待自动执行', tab: ''},
            ].map((item, index, arr) => (
              <div key={item.label} className="flex items-center gap-3">
                {item.tab ? (
                  <button
                    type="button"
                    onClick={() => handlers.onActiveTabChange(item.tab)}
                    className="rounded-full border border-border/70 bg-background/88 px-3 py-1.5 font-medium text-primary hover:bg-primary/[0.06] transition-colors"
                  >
                    {item.label}
                  </button>
                ) : (
                  <span className="rounded-full border border-border/70 bg-background/88 px-3 py-1.5 font-medium text-foreground">
                    {item.label}
                  </span>
                )}
                {index < arr.length - 1 ? <ArrowRight className="h-4 w-4 text-muted-foreground/60" /> : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_380px]">
        <ExecutionComposerCard
          model={model}
          selectedPlatform={selectedPlatform}
          matchThreshold={matchThreshold}
          customMessage={customMessage}
          messageSendLimit={messageSendLimit}
          executionMode={executionMode}
          scheduleFrequency={scheduleFrequency}
          scheduleTime={scheduleTime}
          scheduleWeekday={scheduleWeekday}
          handlers={handlers}
        />
        <ExecutionLaunchSidebar
          model={model}
          executionMode={executionMode}
          handlers={handlers}
        />
      </div>

      <ExecutionPreviewPanels
        model={model}
        selectedExecutionId={selectedExecutionId}
        handlers={handlers}
      />

      <TaskMonitorPanel/>
    </TabsContent>
  )
}
