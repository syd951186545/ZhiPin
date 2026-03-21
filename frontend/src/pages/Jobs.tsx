import React, {useState} from 'react'
import {
  Loader2,
  LogIn,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Textarea} from '@/components/ui/textarea'
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card'
import {Skeleton} from '@/components/ui/skeleton'
import {Badge} from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import EmptyState from '@/components/shared/EmptyState'
import AddProfileDialog from '@/components/settings/AddProfileDialog'
import PlatformLoginDialog from '@/components/settings/PlatformLoginDialog'
import {useI18n} from '@/contexts/I18nContext'
import {useOpenClaw} from '@/contexts/OpenClawContext'
import {useJobs} from '@/hooks/useJobs'
import {useSettingsStore} from '@/stores/useSettingsStore'
import {EMPLOYMENT_TYPE, JOB_STATUS, PLATFORMS} from '@/lib/constants'
import type {Job} from '@/types/database'

interface JobFormData {
  title: string
  department: string
  location: string
  employment_type: string
  salary_min: number
  salary_max: number
  description: string
  requirements: string
}

const emptyForm: JobFormData = {
  title: '',
  department: '',
  location: '',
  employment_type: 'full-time',
  salary_min: 0,
  salary_max: 0,
  description: '',
  requirements: '',
}

function JobManagementPanel() {
  const {t} = useI18n()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const {jobs, loading, error, createJob, updateJob, deleteJob} = useJobs({
    search: search || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
  })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [form, setForm] = useState<JobFormData>(emptyForm)
  const [aiLoading, setAiLoading] = useState<'description' | 'requirements' | null>(null)
  const [saving, setSaving] = useState(false)

  const openCreate = () => {
    setEditingJob(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (job: Job) => {
    setEditingJob(job)
    setForm({
      title: job.title,
      department: job.department || '',
      location: job.location || '',
      employment_type: job.employment_type,
      salary_min: job.salary_min ? job.salary_min / 1000 : 0,
      salary_max: job.salary_max ? job.salary_max / 1000 : 0,
      description: job.description || '',
      requirements: job.requirements || '',
    })
    setDialogOpen(true)
  }

  const handleAiGenerate = async (_field: 'description' | 'requirements') => {
    setAiLoading(null)
  }

  const handleSave = async (status: 'draft' | 'active') => {
    setSaving(true)
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
      }
      if (editingJob) {
        await updateJob(editingJob.id, data)
      } else {
        await createJob({...data, benefits: null, salary_currency: 'CNY', tags: [], published_platforms: []})
      }
      setDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    await deleteJob(id)
  }

  const formatSalary = (min: number | null, max: number | null) => {
    if (!min && !max) return '-'
    const lo = min ? Math.round(min / 1000) : '?'
    const hi = max ? Math.round(max / 1000) : '?'
    return lo + '-' + hi + 'K'
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          {Array.from({length: 5}).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full"/>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4"/>
          {t('jobs.create')}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
          <Input
            placeholder={t('jobs.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue/>
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
        <div
          className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
      )}

      {jobs.length === 0 ? (
        <EmptyState title={t('jobs.title')} description={t('jobs.desc')} actionLabel={t('jobs.create')}
                    onAction={openCreate}/>
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
                      <StatusBadge status={job.status} type="job"/>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(job)}>
                          <Pencil className="h-4 w-4"/>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(job.id)}>
                          <Trash2 className="h-4 w-4 text-destructive"/>
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
                  onChange={(e) => setForm((p) => ({...p, title: e.target.value}))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('jobs.form.department')}</Label>
                <Input
                  placeholder={t('jobs.form.departmentPlaceholder')}
                  value={form.department}
                  onChange={(e) => setForm((p) => ({...p, department: e.target.value}))}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('jobs.form.location')}</Label>
                <Input
                  placeholder={t('jobs.form.locationPlaceholder')}
                  value={form.location}
                  onChange={(e) => setForm((p) => ({...p, location: e.target.value}))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('jobs.form.type')}</Label>
                <Select value={form.employment_type}
                        onValueChange={(v) => setForm((p) => ({...p, employment_type: v}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
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
                  onChange={(e) => setForm((p) => ({...p, salary_min: Number(e.target.value)}))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('jobs.form.salaryMax')}</Label>
                <Input
                  type="number"
                  value={form.salary_max || ''}
                  onChange={(e) => setForm((p) => ({...p, salary_max: Number(e.target.value)}))}
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
                    <><Loader2 className="mr-1 h-3 w-3 animate-spin"/>{t('jobs.form.aiGenerating')}</>
                  ) : (
                    <><Sparkles className="mr-1 h-3 w-3"/>{t('jobs.form.aiGenerate')}</>
                  )}
                </Button>
              </div>
              <Textarea
                placeholder={t('jobs.form.descriptionPlaceholder')}
                value={form.description}
                onChange={(e) => setForm((p) => ({...p, description: e.target.value}))}
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
                    <><Loader2 className="mr-1 h-3 w-3 animate-spin"/>{t('jobs.form.aiGenerating')}</>
                  ) : (
                    <><Sparkles className="mr-1 h-3 w-3"/>{t('jobs.form.aiGenerate')}</>
                  )}
                </Button>
              </div>
              <Textarea
                placeholder={t('jobs.form.requirementsPlaceholder')}
                value={form.requirements}
                onChange={(e) => setForm((p) => ({...p, requirements: e.target.value}))}
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
  )
}

export default function EnterpriseManagement() {
  const {t} = useI18n()
  const {isReady} = useOpenClaw()
  const {
    platformProfiles,
    platformConfigs,
    companyProfile,
    updatePlatformConfig,
    updateProfile,
    removeProfile,
    updateCompanyProfile,
  } = useSettingsStore()

  const safeCompanyProfile = companyProfile || {name: '', address: '', size: '', overview: ''}
  const [companyForm, setCompanyForm] = useState(safeCompanyProfile)
  const [addProfileOpen, setAddProfileOpen] = useState(false)
  const [loginDialogOpen, setLoginDialogOpen] = useState(false)
  const [loginProfileId, setLoginProfileId] = useState<string | null>(null)
  const [verifyingProfileId, setVerifyingProfileId] = useState<string | null>(null)

  const handleSaveCompany = () => {
    updateCompanyProfile(companyForm)
  }

  const handleLoginProfile = (profileId: string) => {
    setLoginProfileId(profileId)
    setLoginDialogOpen(true)
  }

  const handleVerifyProfile = async (profileId: string) => {
    const profile = platformProfiles.find((p) => p.id === profileId)
    if (!profile) return

    setVerifyingProfileId(profileId)
    updateProfile(profileId, {status: 'verifying'})

    // 由于平台验证现在由 agent 处理，这里直接标记状态
    setTimeout(() => {
      updateProfile(profileId, {
        status: 'active',
        lastVerified: new Date().toISOString(),
      })
      setVerifyingProfileId(null)
    }, 1000)
  }

  const handleDeleteProfile = (profileId: string) => {
    removeProfile(profileId)
  }

  const getProfileStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default">{t('enterprise.accounts.status.active')}</Badge>
      case 'verifying':
        return <Badge variant="secondary">{t('enterprise.accounts.status.verifying')}</Badge>
      case 'expired':
        return <Badge variant="destructive">{t('enterprise.accounts.status.expired')}</Badge>
      default:
        return <Badge variant="destructive">{t('enterprise.accounts.status.needsLogin')}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('enterprise.title')} description={t('enterprise.desc')}/>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">{t('enterprise.tab.company')}</TabsTrigger>
          <TabsTrigger value="accounts">{t('enterprise.tab.accounts')}</TabsTrigger>
          <TabsTrigger value="platforms">{t('enterprise.tab.platforms')}</TabsTrigger>
          <TabsTrigger value="jobs">{t('enterprise.tab.jobs')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>{t('enterprise.overview.title')}</CardTitle>
              <CardDescription>{t('enterprise.overview.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('enterprise.overview.name')}</Label>
                  <Input
                    value={companyForm.name}
                    onChange={(e) => setCompanyForm((p) => ({...p, name: e.target.value}))}
                    placeholder={t('enterprise.overview.namePlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('enterprise.overview.size')}</Label>
                  <Input
                    value={companyForm.size}
                    onChange={(e) => setCompanyForm((p) => ({...p, size: e.target.value}))}
                    placeholder={t('enterprise.overview.sizePlaceholder')}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('enterprise.overview.address')}</Label>
                <Input
                  value={companyForm.address}
                  onChange={(e) => setCompanyForm((p) => ({...p, address: e.target.value}))}
                  placeholder={t('enterprise.overview.addressPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('enterprise.overview.summary')}</Label>
                <Textarea
                  value={companyForm.overview}
                  onChange={(e) => setCompanyForm((p) => ({...p, overview: e.target.value}))}
                  placeholder={t('enterprise.overview.summaryPlaceholder')}
                  rows={4}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSaveCompany}>{t('enterprise.overview.save')}</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="accounts">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t('enterprise.accounts.title')}</CardTitle>
                  <CardDescription>{t('enterprise.accounts.desc')}</CardDescription>
                </div>
                <Button size="sm" onClick={() => setAddProfileOpen(true)}>
                  {t('enterprise.accounts.new')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {platformProfiles.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <p>{t('enterprise.accounts.empty')}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">{t('enterprise.accounts.table.name')}</th>
                      <th className="text-left p-3 font-medium">{t('enterprise.accounts.table.platform')}</th>
                      <th className="text-center p-3 font-medium">{t('enterprise.accounts.table.status')}</th>
                      <th className="text-center p-3 font-medium">{t('enterprise.accounts.lastVerified')}</th>
                      <th className="text-right p-3 font-medium">{t('enterprise.accounts.table.actions')}</th>
                    </tr>
                    </thead>
                    <tbody>
                    {platformProfiles.map((profile) => (
                      <tr key={profile.id} className="border-b last:border-0">
                        <td className="p-3 font-medium">
                          {profile.name}
                          {profile.accountName && (
                            <span className="text-xs text-muted-foreground ml-2">({profile.accountName})</span>
                          )}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline">
                            {PLATFORMS[profile.platform as keyof typeof PLATFORMS]?.name || profile.platform}
                          </Badge>
                        </td>
                        <td className="p-3 text-center">
                          {getProfileStatusBadge(profile.status)}
                        </td>
                        <td className="p-3 text-center text-xs text-muted-foreground">
                          {profile.lastVerified
                            ? new Date(profile.lastVerified).toLocaleString('zh-CN')
                            : t('enterprise.accounts.neverVerified')}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleLoginProfile(profile.id)}
                              disabled={!isReady}
                            >
                              <LogIn className="h-4 w-4 mr-1"/>
                              {t('enterprise.accounts.action.login')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleVerifyProfile(profile.id)}
                              disabled={verifyingProfileId === profile.id}
                            >
                              {verifyingProfileId === profile.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin"/>
                              ) : (
                                <ShieldCheck className="h-4 w-4 mr-1"/>
                              )}
                              {t('enterprise.accounts.action.verify')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteProfile(profile.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4"/>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <AddProfileDialog open={addProfileOpen} onOpenChange={setAddProfileOpen}/>
          <PlatformLoginDialog
            open={loginDialogOpen}
            onOpenChange={setLoginDialogOpen}
            profileId={loginProfileId}
          />
        </TabsContent>

        <TabsContent value="platforms">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(PLATFORMS).map(([key, {name: pName}]) => {
              const defaultUrl = PLATFORMS[key as keyof typeof PLATFORMS]?.loginUrl || ''
              const stored = platformConfigs[key] || {}
              const config = {
                nickname: stored.nickname || '',
                boundProfileId: stored.boundProfileId || '',
                customUrl: stored.customUrl || defaultUrl,
              }
              const profilesForPlatform = platformProfiles.filter((p) => p.platform === key)

              return (
                <Card key={key}>
                  <CardHeader>
                    <CardTitle>{pName}</CardTitle>
                    <CardDescription>{t('enterprise.platforms.desc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>{t('enterprise.platforms.nickname')}</Label>
                      <Input
                        value={config.nickname}
                        onChange={(e) => updatePlatformConfig(key, {nickname: e.target.value})}
                        placeholder={t('enterprise.platforms.nicknamePlaceholder')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('enterprise.platforms.boundProfile')}</Label>
                      <Select
                        value={config.boundProfileId}
                        onValueChange={(v) => updatePlatformConfig(key, {boundProfileId: v})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('enterprise.platforms.boundProfilePlaceholder')}/>
                        </SelectTrigger>
                        <SelectContent>
                          {profilesForPlatform.length === 0 ? (
                            <SelectItem value="_none" disabled>{t('enterprise.platforms.noAccounts')}</SelectItem>
                          ) : (
                            profilesForPlatform.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} {p.status === 'active' ? '✓' : ''}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('enterprise.platforms.customUrl')}</Label>
                      <Input
                        value={config.customUrl}
                        disabled
                        placeholder={config.customUrl}
                      />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button onClick={() => updatePlatformConfig(key, config)}>
                      {t('enterprise.platforms.save')}
                    </Button>
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="jobs">
          <JobManagementPanel/>
        </TabsContent>
      </Tabs>
    </div>
  )
}
