import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Pause, Play, Square, RotateCcw, CheckCircle2, Circle, Loader2, MonitorPlay, ScrollText, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useI18n } from '@/contexts/I18nContext';

interface LogEntry {
  time: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

const STEPS = [
  { key: 'init', zh: '准备环境', en: 'Initialize' },
  { key: 'login', zh: '验证登录', en: 'Verify Login' },
  { key: 'generate', zh: '生成内容', en: 'Generate Content' },
  { key: 'fill', zh: '填写信息', en: 'Fill Form' },
  { key: 'submit', zh: '提交确认', en: 'Submit & Verify' },
];

const MOCK_LOGS: LogEntry[] = [
  { time: '14:30:01', level: 'info', message: '正在初始化浏览器环境...' },
  { time: '14:30:03', level: 'success', message: '浏览器启动成功' },
  { time: '14:30:05', level: 'info', message: '正在访问BOSS直聘登录页...' },
  { time: '14:30:08', level: 'success', message: '登录验证通过' },
  { time: '14:30:10', level: 'info', message: '正在使用AI生成职位描述...' },
  { time: '14:30:15', level: 'success', message: 'AI内容生成完成 (648字)' },
  { time: '14:30:16', level: 'info', message: '正在填写职位信息...' },
  { time: '14:30:20', level: 'info', message: '已填写: 职位名称, 工作地点, 薪资范围' },
  { time: '14:30:22', level: 'warning', message: '检测到验证码，正在自动处理...' },
  { time: '14:30:25', level: 'success', message: '验证码处理成功' },
];

export default function Monitor() {
  const { taskId } = useParams<{ taskId: string }>();
  const { t, lang } = useI18n();

  const [taskStatus, setTaskStatus] = useState<'running' | 'paused' | 'stopped'>('running');
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logIndexRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (taskStatus !== 'running') return;

    logIndexRef.current = logs.length; // resume from current position

    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        const next = Math.min(prev + 2, 100);
        if (next >= 20 && next < 40) setCurrentStep(1);
        else if (next >= 40 && next < 60) setCurrentStep(2);
        else if (next >= 60 && next < 80) setCurrentStep(3);
        else if (next >= 80) setCurrentStep(4);

        if (next >= 100) {
          clearTimer();
          setTaskStatus('stopped');
        }
        return next;
      });

      const idx = logIndexRef.current;
      if (idx < MOCK_LOGS.length) {
        setLogs((prev) => [...prev, MOCK_LOGS[idx]]);
        logIndexRef.current = idx + 1;
      }
    }, 800);

    return clearTimer;
  }, [taskStatus, clearTimer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handlePause = () => {
    clearTimer();
    setTaskStatus('paused');
  };

  const handleResume = () => {
    setTaskStatus('running');
  };

  const handleStop = () => {
    clearTimer();
    setTaskStatus('stopped');
  };

  const handleRetry = () => {
    setProgress(0);
    setCurrentStep(0);
    setLogs([]);
    logIndexRef.current = 0;
    setTaskStatus('running');
  };

  const getStepIcon = (idx: number) => {
    if (idx < currentStep) return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    if (idx === currentStep && taskStatus === 'running') return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
    return <Circle className="h-5 w-5 text-muted-foreground" />;
  };

  const getLogColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'success': return 'text-green-400';
      case 'warning': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-zinc-300';
    }
  };

  const statusLabel = taskStatus === 'running'
    ? t('monitor.status.running')
    : taskStatus === 'paused'
    ? t('monitor.status.paused')
    : t('monitor.status.stopped');

  const statusColor = taskStatus === 'running'
    ? 'bg-blue-500 text-white'
    : taskStatus === 'paused'
    ? 'bg-yellow-500 text-white'
    : '';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{t('monitor.title')}</h1>
          <p className="text-muted-foreground text-sm">ID: {taskId || 'task_mock_1'}</p>
        </div>
        <Badge className={statusColor} variant={taskStatus === 'stopped' ? 'secondary' : 'default'}>
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

              <div className="flex gap-2 pt-2">
                {taskStatus === 'running' && (
                  <Button size="sm" variant="secondary" onClick={handlePause} className="flex-1">
                    <Pause className="mr-1 h-3 w-3" />{t('monitor.pause')}
                  </Button>
                )}
                {taskStatus === 'paused' && (
                  <Button size="sm" onClick={handleResume} className="flex-1">
                    <Play className="mr-1 h-3 w-3" />{t('monitor.resume')}
                  </Button>
                )}
                {taskStatus !== 'stopped' && (
                  <Button size="sm" variant="destructive" onClick={handleStop} className="flex-1">
                    <Square className="mr-1 h-3 w-3" />{t('monitor.stop')}
                  </Button>
                )}
                {taskStatus === 'stopped' && (
                  <Button size="sm" onClick={handleRetry} className="flex-1">
                    <RotateCcw className="mr-1 h-3 w-3" />{t('monitor.retry')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('monitor.context')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{lang === 'zh' ? '使用账号' : 'Account'}</span>
                <span className="font-medium">hr@company.com</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{lang === 'zh' ? '目标平台' : 'Platform'}</span>
                <span className="font-medium">BOSS直聘</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{lang === 'zh' ? '任务类型' : 'Task Type'}</span>
                <span className="font-medium">{lang === 'zh' ? '自动发布职位' : 'Auto-Publish Job'}</span>
              </div>
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
                {logs.length === 0 && (
                  <p className="text-zinc-500">{lang === 'zh' ? '等待日志输出...' : 'Waiting for logs...'}</p>
                )}
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-zinc-500 shrink-0">[{log.time}]</span>
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
                    {taskStatus === 'running'
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
