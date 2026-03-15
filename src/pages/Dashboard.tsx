import React from 'react';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import PageHeader from '@/components/shared/PageHeader';
import OverviewPanel from '@/components/dashboard/OverviewPanel';
import ExecutionRecords from '@/components/dashboard/ExecutionRecords';
import {useI18n} from '@/contexts/I18nContext';

export default function Dashboard() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <PageHeader title={t('dashboard.title')} description={t('dashboard.desc')} />
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('dashboard.tab.overview')}</TabsTrigger>
          <TabsTrigger value="history">{t('dashboard.tab.history')}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewPanel />
        </TabsContent>
        <TabsContent value="history">
          <ExecutionRecords />
        </TabsContent>
      </Tabs>
    </div>
  );
}
