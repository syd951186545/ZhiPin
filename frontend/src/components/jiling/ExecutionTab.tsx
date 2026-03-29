import type {ExecutionComposerModel} from '@/components/jiling/useExecutionComposerModel'
import type {ExecutionGroup, ExecutionMode, ScheduleFrequency} from '@/components/jiling/jilingRecruitHelpers'
import {TabsContent} from '@/components/ui/tabs'
import ExecutionComposerCard from '@/components/jiling/ExecutionComposerCard'
import ExecutionLaunchSidebar from '@/components/jiling/ExecutionLaunchSidebar'
import ExecutionPreviewPanels from '@/components/jiling/ExecutionPreviewPanels'
import TaskMonitorPanel from '@/components/dashboard/TaskMonitorPanel'

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
