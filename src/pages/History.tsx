import React, { useState, useMemo } from 'react';
import { Download, Search, Eye, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { useI18n } from '@/contexts/I18nContext';
import { PLATFORMS } from '@/lib/constants';

interface HistoryEntry {
  id: string;
  name: string;
  executedAt: string;
  platform: string;
  metricsType: 'jobs' | 'resumes';
  metricsCount: number;
  matchRate?: number;
  status: 'success' | 'partial' | 'failed';
}

const MOCK_HISTORY: HistoryEntry[] = [
  {
    id: 'hist_1',
    name: '自动发布「前端开发工程师」',
    executedAt: '2026-03-14 10:30',
    platform: 'boss_zhipin',
    metricsType: 'jobs',
    metricsCount: 1,
    status: 'success',
  },
  {
    id: 'hist_2',
    name: '简历智能筛选 - Java后端',
    executedAt: '2026-03-14 08:15',
    platform: 'boss_zhipin',
    metricsType: 'resumes',
    metricsCount: 41,
    matchRate: 34,
    status: 'success',
  },
  {
    id: 'hist_3',
    name: '自动搜索产品经理人才',
    executedAt: '2026-03-13 16:45',
    platform: '58',
    metricsType: 'resumes',
    metricsCount: 18,
    matchRate: 22,
    status: 'partial',
  },
  {
    id: 'hist_4',
    name: '自动发布「Java后端工程师」',
    executedAt: '2026-03-13 09:00',
    platform: '58',
    metricsType: 'jobs',
    metricsCount: 1,
    status: 'success',
  },
  {
    id: 'hist_5',
    name: '智能自动沟通 - 批量发送',
    executedAt: '2026-03-12 14:20',
    platform: 'boss_zhipin',
    metricsType: 'resumes',
    metricsCount: 5,
    status: 'failed',
  },
];

const statusColors: Record<string, string> = {
  success: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
  partial: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800',
  failed: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
};

export default function History() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading] = useState(false);

  const filtered = useMemo(() => {
    return MOCK_HISTORY.filter((entry) => {
      if (search && !entry.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (platformFilter !== 'all' && entry.platform !== platformFilter) return false;
      if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
      return true;
    });
  }, [search, platformFilter, statusFilter]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('history.title')} description={t('history.desc')} />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('history.title')} description={t('history.desc')}>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          {t('history.export')}
        </Button>
      </PageHeader>

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
            <SelectItem value="success">{t('history.status.success')}</SelectItem>
            <SelectItem value="partial">{t('history.status.partial')}</SelectItem>
            <SelectItem value="failed">{t('history.status.failed')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
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
                  {filtered.map((entry) => {
                    const platform = PLATFORMS[entry.platform as keyof typeof PLATFORMS];
                    const statusKey = ('history.status.' + entry.status) as any;
                    return (
                      <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-medium">{entry.name}</td>
                        <td className="p-3 text-muted-foreground hidden md:table-cell">{entry.executedAt}</td>
                        <td className="p-3 text-center">
                          {platform && (
                            <Badge variant="outline" className="text-xs">{platform.name}</Badge>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="text-muted-foreground">
                            {entry.metricsType === 'jobs'
                              ? t('history.metrics.jobs') + ' ' + entry.metricsCount + ' 个'
                              : t('history.metrics.resumes') + ' ' + entry.metricsCount + ' 份'}
                            {entry.matchRate !== undefined && (
                              <span className="ml-2 text-primary">{t('history.metrics.match')} {entry.matchRate}%</span>
                            )}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusColors[entry.status] || ''}`}>
                            {t(statusKey)}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm">
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
