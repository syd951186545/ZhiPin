import React, { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Circle, Loader2, MonitorPlay, ScrollText, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/contexts/I18nContext';
import { useTaskLogs } from '@/hooks/useTaskLogs';
import { useAutomationTasks } from '@/hooks/useAutomationTasks';
import { TASK_TYPE, PLATFORMS } from '@/lib/constants';

const STEPS = [
  { key: 'init', zh: '准备环境', en: 'Initialize' },
  { key: 'login', zh: '验证登录', en: 'Verify Login' },
  { key: 'generate', zh: '生成内容', en: 'Generate Content' },
  { key: 'fill', zh: '填写信息', en: 'Fill Form' },
  { key: 'submit', zh: '提交确认', en: 'Submit & Verify' },
];

function getStepFromProgress(progress: number): number {
  if (progress >= 80) return 4;
  if (progress >= 60) return 3;
  if (progress >= 40) return 2;
  if (progress >= 20) return 1;
  return 0;
}

const getLogColor = (level: string) => {
  switch (level) {
    case 'success': return 'text-green-400';
    case 'warning': return 'text-yellow-400';
    case 'error': return 'text-red-400';
    default: return 'text-zinc-300';
  }
};

export default function Monitor() {
  const { taskId } = useParams<{ taskId: string }>();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const logsEndRef = useRef<HTMLDivElement>(null);

  const { tasks, loading: tasksLoading } = useAutomationTasks();
  const { logs, loading: logsLoading } = useTaskLogs(taskId);

  const task = tasks.find((t) => t.id === taskId);
  const progress = task?.progress ?? 0;
  const currentStep = getStepFromProgress(progress);
  const taskStatus = task?.status ?? 'queued';

  const isRunning = taskStatus === 'running';

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getStepIcon = (idx: number) => {
    if (idx < currentStep) return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    if (idx === currentStep && isRunning) return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
    return <Circle className="h-5 w-5 text-muted-foreground" />;
  };

  const statusLabel = isRunning
    ? t('monitor.status.running')
    : taskStatus === 'paused'
    ? t('monitor.status.paused')
    : t('monitor.status.stopped');

  const statusColor = isRunning
    ? 'bg-blue-500 text-white'
    : taskStatus === 'paused'
    ? 'bg-yellow-500 text-white'
    : '';

  if (tasksLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96 lg:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              {lang === 'zh' ? '返回工作台' : 'Back'}
            </Button>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{task?.name || t('monitor.title')}</h1>
          <p className="text-muted-foreground text-sm">ID: {taskId}</p>
        </div>
        <Badge className={statusColor} variant={!isRunning && taskStatus !== 'paused' ? 'secondary' : 'default'}>
          {statusLabel}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Progress + Context */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('monitor.progress')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={progress} className="h-2" />
              <p className="text-center text-2xl font-bold">{progress}%</p>

              <div className="space-y-3">
                {STEPS.map((step, idx) => (
                  <div key={step.key} className="flex items-center gap-3">
                    {getStepIcon(idx)}
                    <span className={`text-sm ${idx <= currentStep ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                      {lang === 'zh' ? step.zh : step.en}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('monitor.context')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('monitor.context.platform')}</span>
                <span className="font-medium">
                  {task?.platform ? (PLATFORMS[task.platform as keyof typeof PLATFORMS]?.name || task.platform) : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('monitor.context.action')}</span>
                <span className="font-medium">
                  {task?.type ? (TASK_TYPE[task.type as keyof typeof TASK_TYPE] || task.type) : '-'}
                </span>
              </div>
              {task?.error_message && (
                <div className="p-2 rounded bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-xs">
                  {task.error_message}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Logs + Screenshot */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ScrollText className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">{t('monitor.logs')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-80 rounded-lg bg-zinc-950 text-zinc-100 p-4 font-mono text-xs overflow-y-auto space-y-1">
                {logsLoading && (
                  <p className="text-zinc-500">{lang === 'zh' ? '加载日志...' : 'Loading logs...'}</p>
                )}
                {!logsLoading && logs.length === 0 && (
                  <p className="text-zinc-500">{lang === 'zh' ? '暂无日志' : 'No logs yet'}</p>
                )}
                {logs.map((log) => (
                  <div key={log.id} className="flex gap-2">
                    <span className="text-zinc-500 shrink-0">
                      [{new Date(log.created_at).toLocaleTimeString('zh-CN', { hour12: false })}]
                    </span>
                    <span className={getLogColor(log.level)}>{log.message}</span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">{t('monitor.snapshot')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-48 rounded-lg bg-muted flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <MonitorPlay className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">
                    {isRunning
                      ? (lang === 'zh' ? '正在执行中...' : 'Running...')
                      : (lang === 'zh' ? '暂无截图' : 'No screenshot')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
