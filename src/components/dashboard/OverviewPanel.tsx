import React from 'react';
import { motion } from 'motion/react';
import { Briefcase, Users, Calendar, Zap, TrendingUp, Clock } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/contexts/I18nContext';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useActivityLogs } from '@/hooks/useActivityLogs';
import { TASK_TYPE } from '@/lib/constants';

const funnelData = [
  { date: '03/08', views: 120, applicants: 8 },
  { date: '03/09', views: 145, applicants: 12 },
  { date: '03/10', views: 98, applicants: 6 },
  { date: '03/11', views: 167, applicants: 15 },
  { date: '03/12', views: 189, applicants: 18 },
  { date: '03/13', views: 134, applicants: 11 },
  { date: '03/14', views: 210, applicants: 23 },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

function formatActivityAction(action: string): string {
  return TASK_TYPE[action as keyof typeof TASK_TYPE] || action;
}

function formatActivityDetail(action: string, details: Record<string, unknown> | null): string {
  if (!details) return '';
  switch (action) {
    case 'auto_publish':
      return `「${details.job_title}」已发布到${details.platform === 'boss_zhipin' ? 'BOSS直聘' : details.platform === '58' ? '58同城' : details.platform}`;
    case 'resume_screen':
      if (details.screened) return `筛选了${details.screened}份简历，推荐${details.recommended}位候选人`;
      if (details.candidate) return `「${details.job_title}」收到新简历，AI评${details.score}分`;
      return `筛选「${details.job_title}」简历`;
    case 'auto_source':
      return `在${details.platform === '58' ? '58同城' : details.platform}发现${details.candidates_found}位匹配的候选人`;
    case 'auto_reply':
      return `向${details.count}位候选人发送了${details.action}`;
    default:
      return JSON.stringify(details);
  }
}

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}小时前`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}天前`;
}

export default function OverviewPanel() {
  const { t } = useI18n();
  const { stats, loading } = useDashboardStats();
  const { activities, loading: activitiesLoading } = useActivityLogs(6);

  const kpiCards = [
    { key: 'activeJobs', label: t('dashboard.activeJobs'), value: stats.activeJobs, icon: Briefcase, color: 'text-blue-600' },
    { key: 'totalCandidates', label: t('dashboard.totalCandidates'), value: stats.totalCandidates, icon: Users, color: 'text-green-600' },
    { key: 'interviewsScheduled', label: t('dashboard.interviewsScheduled'), value: stats.interviewsScheduled, icon: Calendar, color: 'text-purple-600' },
    { key: 'automatedActions', label: t('dashboard.automatedActions'), value: stats.automatedActions, icon: Zap, color: 'text-orange-600' },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-4 w-24 mb-3" /><Skeleton className="h-8 w-16" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2"><CardContent className="pt-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
          <Card><CardContent className="pt-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <motion.div key={card.key} variants={itemVariants}>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className="text-3xl font-bold mt-1">{card.value}</p>
                  </div>
                  <div className="p-3 rounded-full bg-muted">
                    <card.icon className={`h-6 w-6 ${card.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">{t('dashboard.funnel.title')}</CardTitle>
              </div>
              <CardDescription>{t('dashboard.funnel.desc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={funnelData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="applicantsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--popover-foreground))' }} />
                    <Area type="monotone" dataKey="views" stroke="hsl(var(--primary))" fill="url(#viewsGradient)" strokeWidth={2} name="浏览量" />
                    <Area type="monotone" dataKey="applicants" stroke="#22c55e" fill="url(#applicantsGradient)" strokeWidth={2} name="申请量" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">{t('dashboard.activity.title')}</CardTitle>
              </div>
              <CardDescription>{t('dashboard.activity.desc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {activitiesLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {activities.map((activity) => (
                    <div key={activity.id} className="flex gap-3">
                      <div className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-tight">{formatActivityAction(activity.action)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {formatActivityDetail(activity.action, activity.details as Record<string, unknown> | null)}
                        </p>
                        <p className="text-xs text-muted-foreground/60 mt-0.5">{formatTimeAgo(activity.created_at)}</p>
                      </div>
                    </div>
                  ))}
                  {activities.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">暂无动态</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
