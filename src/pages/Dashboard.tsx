import React from 'react';
import { motion } from 'motion/react';
import { Briefcase, Users, Calendar, Zap, TrendingUp, Clock } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/shared/PageHeader';
import { useI18n } from '@/contexts/I18nContext';
import { useDashboardStats } from '@/hooks/useDashboardStats';

const funnelData = [
  { date: '03/08', views: 120, applicants: 8 },
  { date: '03/09', views: 145, applicants: 12 },
  { date: '03/10', views: 98, applicants: 6 },
  { date: '03/11', views: 167, applicants: 15 },
  { date: '03/12', views: 189, applicants: 18 },
  { date: '03/13', views: 134, applicants: 11 },
  { date: '03/14', views: 210, applicants: 23 },
];

const recentActivity = [
  { id: '1', action: '自动发布职位', detail: '「前端开发工程师」已发布到BOSS直聘', time: '10分钟前' },
  { id: '2', action: '简历智能筛选', detail: '筛选了41份简历，推荐14位候选人', time: '25分钟前' },
  { id: '3', action: '自动搜索人才', detail: '在58同城发现3位匹配的候选人', time: '1小时前' },
  { id: '4', action: '智能自动沟通', detail: '向5位候选人发送了面试邀请', time: '2小时前' },
  { id: '5', action: '简历智能筛选', detail: '「产品经理」收到新简历，AI评95分', time: '3小时前' },
  { id: '6', action: '自动发布职位', detail: '「Java后端工程师」已发布到58同城', time: '5小时前' },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function Dashboard() {
  const { t } = useI18n();
  const { stats, loading } = useDashboardStats();

  const kpiCards = [
    { key: 'activeJobs', label: t('dashboard.activeJobs'), value: stats.activeJobs, icon: Briefcase, color: 'text-blue-600' },
    { key: 'totalCandidates', label: t('dashboard.totalCandidates'), value: stats.totalCandidates, icon: Users, color: 'text-green-600' },
    { key: 'interviewsScheduled', label: t('dashboard.interviewsScheduled'), value: stats.interviewsScheduled, icon: Calendar, color: 'text-purple-600' },
    { key: 'automatedActions', label: t('dashboard.automatedActions'), value: stats.automatedActions, icon: Zap, color: 'text-orange-600' },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('dashboard.title')} description={t('dashboard.desc')} />
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
      <PageHeader title={t('dashboard.title')} description={t('dashboard.desc')} />
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
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex gap-3">
                    <div className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight">{activity.action}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{activity.detail}</p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
