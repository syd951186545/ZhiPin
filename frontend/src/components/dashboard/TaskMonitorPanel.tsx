import React from 'react';
import {useNavigate} from 'react-router-dom';
import {CheckCircle2, Clock, Eye, Loader2, PauseCircle, XCircle} from 'lucide-react';
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
  running: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
  queued: <Clock className="h-4 w-4 text-muted-foreground" />,
  paused: <PauseCircle className="h-4 w-4 text-yellow-500" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  cancelled: <XCircle className="h-4 w-4 text-muted-foreground" />,
};

const statusColors: Record<string, string> = {
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  queued: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  paused: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
};

export default function TaskMonitorPanel() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { tasks, loading } = useAutomationTasks();

  const runningTasks = tasks.filter((t) => t.status === 'running' || t.status === 'queued' || t.status === 'paused');
  const recentTasks = tasks.filter((t) => t.status === 'completed' || t.status === 'failed').slice(0, 5);

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

  return (
    <div className="space-y-6">
      {/* Running / Queued Tasks */}
      {runningTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
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
                      <Progress value={task.progress} className="h-1.5 flex-1" />
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
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recently Completed Tasks */}
      {recentTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.activity.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 py-2">
                  <div className="shrink-0">{statusIcons[task.status]}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{task.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {task.completed_at ? new Date(task.completed_at).toLocaleString('zh-CN') : ''}
                    </p>
                  </div>
                  <Badge className={`text-xs ${statusColors[task.status] || ''}`} variant="outline">
                    {TASK_STATUS[task.status as keyof typeof TASK_STATUS] || task.status}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/monitor/${task.id}`)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
