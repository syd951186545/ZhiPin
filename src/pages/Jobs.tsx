import React, { useState, useMemo } from 'react';
import { Plus, Search, Pencil, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import EmptyState from '@/components/shared/EmptyState';
import { useI18n } from '@/contexts/I18nContext';
import { useJobs } from '@/hooks/useJobs';
import { JOB_STATUS, EMPLOYMENT_TYPE } from '@/lib/constants';
import type { Job } from '@/types/database';

interface JobFormData {
  title: string;
  department: string;
  location: string;
  employment_type: string;
  salary_min: number;
  salary_max: number;
  description: string;
  requirements: string;
}

const emptyForm: JobFormData = {
  title: '', department: '', location: '', employment_type: 'full-time',
  salary_min: 0, salary_max: 0, description: '', requirements: '',
};

export default function Jobs() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { jobs, loading, error, createJob, updateJob, deleteJob } = useJobs({
    search: search || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [form, setForm] = useState<JobFormData>(emptyForm);
  const [aiLoading, setAiLoading] = useState<'description' | 'requirements' | null>(null);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditingJob(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (job: Job) => {
    setEditingJob(job);
    setForm({
      title: job.title,
      department: job.department || '',
      location: job.location || '',
      employment_type: job.employment_type,
      salary_min: job.salary_min ? job.salary_min / 1000 : 0,
      salary_max: job.salary_max ? job.salary_max / 1000 : 0,
      description: job.description || '',
      requirements: job.requirements || '',
    });
    setDialogOpen(true);
  };

  const handleAiGenerate = async (field: 'description' | 'requirements') => {
    setAiLoading(field);
    await new Promise((r) => setTimeout(r, 1500));
    if (field === 'description') {
      setForm((prev) => ({ ...prev, description: prev.description || '负责公司核心产品的开发工作，参与技术方案设计与代码评审，与产品、设计团队紧密协作，推动项目高质量交付。' }));
    } else {
      setForm((prev) => ({ ...prev, requirements: prev.requirements || '3年以上相关开发经验，熟练掌握主流技术栈，有良好的编码习惯和团队协作能力，具备独立解决问题的能力。' }));
    }
    setAiLoading(null);
  };

  const handleSave = async (status: 'draft' | 'active') => {
    setSaving(true);
    try {
      const data = {
        title: form.title,
        department: form.department || null,
        location: form.location || null,
        employment_type: form.employment_type as Job['employment_type'],
        salary_min: form.salary_min ? form.salary_min * 1000 : null,
        salary_max: form.salary_max ? form.salary_max * 1000 : null,
        description: form.description || null,
        requirements: form.requirements || null,
        status,
      };
      if (editingJob) {
        await updateJob(editingJob.id, data);
      } else {
        await createJob({ ...data, benefits: null, salary_currency: 'CNY', tags: [], published_platforms: [] });
      }
      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteJob(id);
  };

  const formatSalary = (min: number | null, max: number | null) => {
    if (!min && !max) return '-';
    const lo = min ? Math.round(min / 1000) : '?';
    const hi = max ? Math.round(max / 1000) : '?';
    return lo + '-' + hi + 'K';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('jobs.title')} description={t('jobs.desc')} />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('jobs.title')} description={t('jobs.desc')}>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          {t('jobs.create')}
        </Button>
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('jobs.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('jobs.status.all')}</SelectItem>
            {Object.entries(JOB_STATUS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
      )}

      {jobs.length === 0 ? (
        <EmptyState title={t('jobs.title')} description={t('jobs.desc')} actionLabel={t('jobs.create')} onAction={openCreate} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">{t('jobs.table.role')}</th>
                    <th className="text-left p-3 font-medium hidden md:table-cell">{t('jobs.table.department')}</th>
                    <th className="text-left p-3 font-medium hidden lg:table-cell">{t('jobs.table.location')}</th>
                    <th className="text-left p-3 font-medium">{t('jobs.table.salary')}</th>
                    <th className="text-center p-3 font-medium">{t('jobs.table.applicants')}</th>
                    <th className="text-center p-3 font-medium">{t('jobs.table.status')}</th>
                    <th className="text-right p-3 font-medium">{t('jobs.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium">{job.title}</td>
                      <td className="p-3 text-muted-foreground hidden md:table-cell">{job.department || '-'}</td>
                      <td className="p-3 text-muted-foreground hidden lg:table-cell">{job.location || '-'}</td>
                      <td className="p-3">{formatSalary(job.salary_min, job.salary_max)}</td>
                      <td className="p-3 text-center">
                        <Badge variant="secondary">{job.applicant_count}</Badge>
                      </td>
                      <td className="p-3 text-center">
                        <StatusBadge status={job.status} type="job" />
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(job)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(job.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingJob ? t('jobs.form.editTitle') : t('jobs.form.title')}</DialogTitle>
            <DialogDescription>
              {editingJob ? t('jobs.form.editTitle') : t('jobs.form.title')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('jobs.form.name')}</Label>
                <Input
                  placeholder={t('jobs.form.namePlaceholder')}
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('jobs.form.department')}</Label>
                <Input
                  placeholder={t('jobs.form.departmentPlaceholder')}
                  value={form.department}
                  onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('jobs.form.location')}</Label>
                <Input
                  placeholder={t('jobs.form.locationPlaceholder')}
                  value={form.location}
                  onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('jobs.form.type')}</Label>
                <Select value={form.employment_type} onValueChange={(v) => setForm((p) => ({ ...p, employment_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(EMPLOYMENT_TYPE).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('jobs.form.salaryMin')}</Label>
                <Input
                  type="number"
                  value={form.salary_min || ''}
                  onChange={(e) => setForm((p) => ({ ...p, salary_min: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('jobs.form.salaryMax')}</Label>
                <Input
                  type="number"
                  value={form.salary_max || ''}
                  onChange={(e) => setForm((p) => ({ ...p, salary_max: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('jobs.form.description')}</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAiGenerate('description')}
                  disabled={aiLoading !== null}
                >
                  {aiLoading === 'description' ? (
                    <><Loader2 className="mr-1 h-3 w-3 animate-spin" />{t('jobs.form.aiGenerating')}</>
                  ) : (
                    <><Sparkles className="mr-1 h-3 w-3" />{t('jobs.form.aiGenerate')}</>
                  )}
                </Button>
              </div>
              <Textarea
                placeholder={t('jobs.form.descriptionPlaceholder')}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('jobs.form.requirements')}</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAiGenerate('requirements')}
                  disabled={aiLoading !== null}
                >
                  {aiLoading === 'requirements' ? (
                    <><Loader2 className="mr-1 h-3 w-3 animate-spin" />{t('jobs.form.aiGenerating')}</>
                  ) : (
                    <><Sparkles className="mr-1 h-3 w-3" />{t('jobs.form.aiGenerate')}</>
                  )}
                </Button>
              </div>
              <Textarea
                placeholder={t('jobs.form.requirementsPlaceholder')}
                value={form.requirements}
                onChange={(e) => setForm((p) => ({ ...p, requirements: e.target.value }))}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => handleSave('draft')} disabled={saving || !form.title}>
              {t('jobs.form.saveDraft')}
            </Button>
            <Button onClick={() => handleSave('active')} disabled={saving || !form.title}>
              {t('jobs.form.publish')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
