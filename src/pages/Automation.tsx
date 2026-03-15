import React, { useState, useRef, useEffect } from 'react';
import { Search, FileSearch, MessageCircle, AlertTriangle, Play, Pause, Settings, Send, Terminal, Wifi, WifiOff } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import { useI18n } from '@/contexts/I18nContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAutomationTasks } from '@/hooks/useAutomationTasks';

interface WorkflowCard {
  key: string;
  titleKey: string;
  descKey: string;
  icon: React.ElementType;
  status: 'running' | 'paused' | 'stopped';
}

export default function Automation() {
  const { t } = useI18n();
  const { isConnected, sendMessage, lastMessage } = useWebSocket();
  const { tasks, loading } = useAutomationTasks();
  const [commandInput, setCommandInput] = useState('');
  const [terminalLogs, setTerminalLogs] = useState<{ type: 'cmd' | 'res'; text: string; time: string }[]>([]);
  const terminalRef = useRef<HTMLDivElement>(null);

  const [workflowStates, setWorkflowStates] = useState<Record<string, 'running' | 'paused' | 'stopped'>>({
    sourcing: 'running',
    screening: 'paused',
    reply: 'stopped',
  });

  const workflows: WorkflowCard[] = [
    { key: 'sourcing', titleKey: 'automation.workflow.sourcing.title', descKey: 'automation.workflow.sourcing.desc', icon: Search, status: workflowStates.sourcing },
    { key: 'screening', titleKey: 'automation.workflow.screening.title', descKey: 'automation.workflow.screening.desc', icon: FileSearch, status: workflowStates.screening },
    { key: 'reply', titleKey: 'automation.workflow.reply.title', descKey: 'automation.workflow.reply.desc', icon: MessageCircle, status: workflowStates.reply },
  ];

  const toggleWorkflow = (key: string) => {
    setWorkflowStates((prev) => ({
      ...prev,
      [key]: prev[key] === 'running' ? 'paused' : 'running',
    }));
  };

  useEffect(() => {
    if (lastMessage) {
      setTerminalLogs((prev) => [...prev, {
        type: 'res',
        text: JSON.stringify(lastMessage, null, 2),
        time: new Date().toLocaleTimeString('zh-CN'),
      }]);
    }
  }, [lastMessage]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  const handleSendCommand = () => {
    if (!commandInput.trim()) return;
    const time = new Date().toLocaleTimeString('zh-CN');
    setTerminalLogs((prev) => [...prev, { type: 'cmd', text: commandInput, time }]);
    try {
      const parsed = JSON.parse(commandInput);
      sendMessage(parsed.action || 'custom', parsed);
    } catch {
      sendMessage('raw', { command: commandInput });
    }
    setCommandInput('');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('automation.title')} description={t('automation.desc')} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('automation.title')} description={t('automation.desc')} />

      {!isConnected && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800 p-4"
        >
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
          <div>
            <p className="font-medium text-yellow-800 dark:text-yellow-400">{t('automation.disconnected.title')}</p>
            <p className="text-sm text-yellow-700 dark:text-yellow-500">{t('automation.disconnected.desc')}</p>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {workflows.map((wf) => (
          <motion.div key={wf.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="h-full flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <wf.icon className="h-5 w-5 text-primary" />
                  </div>
                  <Badge variant={wf.status === 'running' ? 'default' : 'secondary'}>
                    {wf.status === 'running' ? t('automation.status.running') : t('automation.status.paused')}
                  </Badge>
                </div>
                <CardTitle className="text-base">{t(wf.titleKey as any)}</CardTitle>
                <CardDescription>{t(wf.descKey as any)}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex justify-between">
                    <span>{t('automation.freq')}</span>
                    <span>{t('automation.freq.15m')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('automation.platforms')}</span>
                    <span>BOSS直聘, 58同城</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                <Button
                  size="sm"
                  variant={wf.status === 'running' ? 'secondary' : 'default'}
                  className="flex-1"
                  onClick={() => toggleWorkflow(wf.key)}
                  disabled={!isConnected}
                >
                  {wf.status === 'running' ? (
                    <><Pause className="mr-1 h-3 w-3" />{t('automation.action.pause')}</>
                  ) : (
                    <><Play className="mr-1 h-3 w-3" />{t('automation.action.start')}</>
                  )}
                </Button>
                <Button size="sm" variant="outline">
                  <Settings className="h-3 w-3" />
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">{t('automation.terminal.title')}</CardTitle>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {isConnected ? (
                <><Wifi className="h-4 w-4 text-green-500" /><span className="text-green-600">{t('status.connected')}</span></>
              ) : (
                <><WifiOff className="h-4 w-4 text-red-500" /><span className="text-red-600">{t('status.disconnected')}</span></>
              )}
            </div>
          </div>
          <CardDescription>{t('automation.terminal.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            ref={terminalRef}
            className="h-64 rounded-lg bg-zinc-950 text-zinc-100 p-4 font-mono text-xs overflow-y-auto space-y-1"
          >
            {terminalLogs.length === 0 && (
              <p className="text-zinc-500">{t('automation.terminal.ready')}</p>
            )}
            {terminalLogs.map((log, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-zinc-500 shrink-0">[{log.time}]</span>
                {log.type === 'cmd' ? (
                  <span className="text-cyan-400">&gt; {log.text}</span>
                ) : (
                  <pre className="text-green-400 whitespace-pre-wrap">{log.text}</pre>
                )}
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter>
          <div className="flex w-full gap-2">
            <Input
              placeholder='{"action": "list_tasks"}'
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendCommand()}
              className="font-mono text-sm flex-1"
            />
            <Button onClick={handleSendCommand} disabled={!isConnected || !commandInput.trim()}>
              <Send className="mr-2 h-4 w-4" />
              {t('automation.terminal.send')}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
