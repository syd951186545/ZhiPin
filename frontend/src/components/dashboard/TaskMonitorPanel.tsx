import React, { useState } from 'react';
import {useNavigate} from 'react-router-dom';
import {CheckCircle2, Clock, Eye, Loader2, PauseCircle, Square, XCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {Progress} from '@/components/ui/progress';
import {Skeleton} from '@/components/ui/skeleton';
import EmptyState from '@/components/shared/EmptyState';
import {useI18n} from '@/contexts/I18nContext';
import {useAutomationTasks} from '@/hooks/useAutomationTasks';
import {PLATFORMS, TASK_STATUS, TASK_TYPE} from '@/lib/constants';

const statusIcons: Record<string, React.ReactNode> = {
  running: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
  queued: <Clock className="h-4 w-4 text-muted-foreground" />,
  paused: <PauseCircle className="h-4 w-4 text-amber-500" />,
  completed: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  cancelled: <XCircle className="h-4 w-4 text-muted-foreground" />,
};

export default function TaskMonitorPanel() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { tasks, loading, cancelTask } = useAutomationTasks();
  const [stoppingTaskId, setStoppingTaskId] = useState<string | null>(null);

  const runningTasks = tasks.filter((t) => t.status === 'running' || t.status === 'queued' || t.status === 'paused');
  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tasks.length === 0) {
    return <EmptyState title={t('dashboard.tab.monitor')} description={t('dashboard.desc')} />;
  }

  const handleStopTask = async (taskId: string) => {
    setStoppingTaskId(taskId);
    try {
      await cancelTask(taskId);
    } finally {
      setStoppingTaskId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Running / Queued Tasks */}
      {runningTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {t('monitor.status.running')} ({runningTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {runningTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-4 p-4 rounded-lg border bg-card">
                <div className="shrink-0">{statusIcons[task.status]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium truncate">{task.name}</p>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {TASK_TYPE[task.type as keyof typeof TASK_TYPE] || task.type}
                    </Badge>
                    {task.platform && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        {PLATFORMS[task.platform as keyof typeof PLATFORMS]?.name || task.platform}
                      </Badge>
                    )}
                  </div>
                  {task.status === 'running' && (
                    <div className="flex items-center gap-3">
                      <Progress value={task.progress} className="h-2 flex-1" />
                      <span className="text-xs text-muted-foreground shrink-0">{task.progress}%</span>
                    </div>
                  )}
                  {task.status === 'queued' && (
                    <p className="text-xs text-muted-foreground">
                      {TASK_STATUS[task.status as keyof typeof TASK_STATUS]}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/monitor/${task.id}`)}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  {t('history.action.view')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleStopTask(task.id)}
                  disabled={stoppingTaskId === task.id}
                >
                  {stoppingTaskId === task.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="h-4 w-4 mr-1" />
                  )}
                  停止任务
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
