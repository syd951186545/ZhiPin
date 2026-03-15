import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Search, Eye, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import EmptyState from '@/components/shared/EmptyState';
import { useI18n } from '@/contexts/I18nContext';
import { useAutomationTasks } from '@/hooks/useAutomationTasks';
import { PLATFORMS } from '@/lib/constants';

const statusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
  failed: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
  cancelled: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-800',
};

export default function ExecutionRecords() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { tasks, loading } = useAutomationTasks();
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Only show completed/failed/cancelled tasks
  const completedTasks = useMemo(() => {
    return tasks
      .filter((task) => ['completed', 'failed', 'cancelled'].includes(task.status))
      .filter((task) => {
        if (search && !task.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (platformFilter !== 'all' && task.platform !== platformFilter) return false;
        if (statusFilter !== 'all' && task.status !== statusFilter) return false;
        return true;
      });
  }, [tasks, search, platformFilter, statusFilter]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          {t('history.export')}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('history.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('history.filter.all')}</SelectItem>
            {Object.entries(PLATFORMS).map(([key, p]) => (
              <SelectItem key={key} value={key}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('history.filter.all')}</SelectItem>
            <SelectItem value="completed">{t('history.status.success')}</SelectItem>
            <SelectItem value="failed">{t('history.status.failed')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {completedTasks.length === 0 ? (
        <EmptyState title={t('history.title')} description={t('history.desc')} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">{t('history.table.task')}</th>
                    <th className="text-left p-3 font-medium hidden md:table-cell">{t('history.table.time')}</th>
                    <th className="text-center p-3 font-medium">{t('history.table.platform')}</th>
                    <th className="text-left p-3 font-medium">{t('history.table.metrics')}</th>
                    <th className="text-center p-3 font-medium">{t('history.table.status')}</th>
                    <th className="text-right p-3 font-medium">{t('history.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {completedTasks.map((task) => {
                    const platform = task.platform ? PLATFORMS[task.platform as keyof typeof PLATFORMS] : null;
                    const summary = task.result_summary as Record<string, number> | null;
                    const statusLabel = task.status === 'completed' ? t('history.status.success') : t('history.status.failed');

                    return (
                      <tr key={task.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-medium">{task.name}</td>
                        <td className="p-3 text-muted-foreground hidden md:table-cell">
                          {task.completed_at ? new Date(task.completed_at).toLocaleString('zh-CN') : '-'}
                        </td>
                        <td className="p-3 text-center">
                          {platform && (
                            <Badge variant="outline" className="text-xs">{platform.name}</Badge>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="text-muted-foreground">
                            {summary?.jobs_posted !== undefined && `${t('history.metrics.jobs')} ${summary.jobs_posted} 个`}
                            {summary?.resumes_screened !== undefined && `${t('history.metrics.resumes')} ${summary.resumes_screened} 份`}
                            {summary?.candidates_found !== undefined && `发现 ${summary.candidates_found} 位候选人`}
                            {summary?.messages_sent !== undefined && `发送 ${summary.messages_sent} 条消息`}
                            {summary?.match_rate !== undefined && (
                              <span className="ml-2 text-primary">{t('history.metrics.match')} {Math.round(summary.match_rate * 100)}%</span>
                            )}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusColors[task.status] || ''}`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => navigate(`/monitor/${task.id}`)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <FileText className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
