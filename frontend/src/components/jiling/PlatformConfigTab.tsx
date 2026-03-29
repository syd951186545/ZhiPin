import type {ReactNode} from 'react'
import {Circle, Trash2, UserPlus, Check} from 'lucide-react'
import {motion} from 'motion/react'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Skeleton} from '@/components/ui/skeleton'
import {Switch} from '@/components/ui/switch'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'
import {Textarea} from '@/components/ui/textarea'
import {PLATFORMS} from '@/lib/constants'
import {cn} from '@/lib/utils'
import {bindingStatus, formatSessionTime, verifySessionSummary, type PlatformConfigSection} from '@/components/jiling/jilingRecruitHelpers'
import {pc, platformGlyph, statusBadge} from '@/components/jiling/jilingRecruitShared'
import type {PlatformConfigModel} from '@/components/jiling/usePlatformConfigModel'
import type {PlatformAccountApiRow} from '@/services/platformAccountService'

interface PlatformConfigTabProps {
  model: PlatformConfigModel
  platformConfigSection: PlatformConfigSection
  onPlatformConfigSectionChange: (value: PlatformConfigSection) => void
  customMessage: string
  onCustomMessageChange: (value: string) => void
  messageSendLimit: number
  onMessageSendLimitChange: (value: number) => void
  autoVerifyEnabled: boolean
  onAutoVerifyEnabledChange: (value: boolean) => void
  onOpenAddAccount: () => void
  onSelectedPlatformChange: (value: string) => void
  onSelectedAccountChange: (value: string) => void
  onSetDefaultAccount: (accountId: string) => void
  onDeleteAccount: (accountId: string) => void
  actionPendingAccountId: string | null
  renderAccountActionButtons: (account: PlatformAccountApiRow, variant: 'selected') => ReactNode
}

export default function PlatformConfigTab(props: PlatformConfigTabProps) {
  const {
    model,
    platformConfigSection,
    onPlatformConfigSectionChange,
    customMessage,
    onCustomMessageChange,
    messageSendLimit,
    onMessageSendLimitChange,
    autoVerifyEnabled,
    onAutoVerifyEnabledChange,
    onOpenAddAccount,
    onSelectedPlatformChange,
    onSelectedAccountChange,
    onSetDefaultAccount,
    onDeleteAccount,
    actionPendingAccountId,
    renderAccountActionButtons,
  } = props

  const {
    catalog,
    accounts,
    accountsLoading,
    selectedPlatform,
    selectedPlatformLabel,
    selectedPlatformAccounts,
    selectedDefaultAccountId,
    selectedAccount,
    selectedLatestVerifySession,
    selectedAccountIsBound,
    selectedAccountStatusHint,
    autoVerifyCheck,
    resolvedPreparationCount,
    strategyPreview,
    stats,
  } = model

  return (
    <TabsContent value="platform-config" className="mt-0 space-y-5" data-testid="platform-config-tab">
      <Card className="overflow-hidden border-primary/12 bg-[linear-gradient(135deg,hsl(var(--card)),hsl(var(--primary)/0.08)_38%,transparent_88%)]">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">Platform Assets</p>
              <h3 className="mt-2 text-[28px] font-semibold tracking-tight text-foreground">平台与账号配置</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">统一维护六大平台的账号资产和全局预设。先选平台，再管理账号。</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[24px] border border-border/70 bg-background/82 px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">平台总数</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{catalog.length}</p>
              </div>
              <div className="rounded-[24px] border border-emerald-200/60 bg-emerald-50/70 px-4 py-3 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">生效平台</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-emerald-800 dark:text-emerald-100">{stats.activePlatformAssetCount}</p>
              </div>
              <div className="rounded-[24px] border border-primary/15 bg-primary/[0.06] px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">生效账号</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{stats.activeAccounts}</p>
              </div>
              <div className="rounded-[24px] border border-amber-200/70 bg-amber-50/75 px-4 py-3 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">失效账号</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-amber-800 dark:text-amber-100">{stats.inactiveAccounts}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={platformConfigSection} onValueChange={(value) => onPlatformConfigSectionChange(value as PlatformConfigSection)} className="space-y-5">
        <TabsList className="h-10 bg-muted/50 p-1">
          <TabsTrigger value="assets" className="gap-1.5 data-[state=active]:shadow-sm">平台资产</TabsTrigger>
          <TabsTrigger value="presets" className="gap-1.5 data-[state=active]:shadow-sm">全局预设</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="mt-0 space-y-5">
          <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
            <Card className="overflow-hidden" data-testid="platform-catalog-panel">
              <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.07),transparent_72%)] pb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">Platform Picker</p>
                <CardTitle className="mt-2 text-base">选择平台</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 pt-4">
                {accountsLoading && catalog.length === 0 ? Array.from({length: 6}).map((_, index) => (
                  <div key={index} className="rounded-2xl border p-3">
                    <Skeleton className="h-14 w-full"/>
                  </div>
                )) : catalog.map((item) => {
                  const count = accounts.filter((account) => account.platform === item.key).length
                  const activeCount = accounts.filter((account) => account.platform === item.key && account.status === 'active').length
                  const hasActive = accounts.some((account) => account.platform === item.key && account.status === 'active')
                  const colors = pc(item.key)
                  const isSelected = selectedPlatform === item.key
                  return (
                    <motion.button
                      key={item.key}
                      type="button"
                      data-testid={`platform-card-${item.key}`}
                      whileHover={{scale: 1.02}}
                      whileTap={{scale: 0.98}}
                      onClick={() => onSelectedPlatformChange(item.key)}
                      aria-pressed={isSelected}
                      className={cn(
                        'relative overflow-hidden rounded-[22px] border px-3 py-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                        isSelected
                          ? `border-transparent bg-gradient-to-br ${colors.gradient} ring-2 ${colors.ring} shadow-sm`
                          : 'border-border hover:border-border/80 hover:shadow-sm',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className={cn('flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold text-white', colors.bg)}>
                            {platformGlyph(item.key)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{item.name}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{activeCount}/{Math.max(count, 0)} 可用</p>
                          </div>
                        </div>
                        {isSelected && <Badge variant="outline" className="border-primary/20 bg-background/80 text-[10px] text-primary">当前</Badge>}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge className={cn('border-0 text-xs', count ? colors.badge : 'bg-muted text-muted-foreground')}>
                          {count ? `${count} 个账号` : '未添加账号'}
                        </Badge>
                        <Badge variant="outline" className={cn('text-xs', hasActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' : 'text-muted-foreground')}>
                          {hasActive ? '可用' : '待绑定'}
                        </Badge>
                      </div>
                    </motion.button>
                  )
                })}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.07),transparent_72%)] pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">Account Roster</p>
                    <CardTitle className="mt-2 text-base">{selectedPlatformLabel}账号列表</CardTitle>
                  </div>
                  <Button size="sm" className="gap-2 shadow-sm shrink-0" onClick={onOpenAddAccount} data-testid="open-add-account-dialog">
                    <UserPlus className="h-4 w-4"/>新增平台账号
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {accountsLoading ? (
                  Array.from({length: 3}).map((_, index) => (
                    <div key={index} className="rounded-xl border p-4">
                      <Skeleton className="h-20 w-full"/>
                    </div>
                  ))
                ) : selectedPlatformAccounts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <UserPlus className="h-5 w-5 text-muted-foreground"/>
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">当前平台暂无账号</p>
                    <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={onOpenAddAccount}>
                      <UserPlus className="h-3.5 w-3.5"/>添加账号
                    </Button>
                  </div>
                ) : selectedPlatformAccounts.map((account) => {
                  const isSelected = selectedAccount?.id === account.id
                  const isDefaultAccount = selectedDefaultAccountId === account.id
                  const latestVerifySession = account.latestBindingSession?.action === 'verify' ? account.latestBindingSession : null
                  const isBoundAccount = ['active', 'verifying'].includes(account.status)
                  const verificationStateLabel = !isBoundAccount
                    ? account.status === 'expired' ? '登录失效' : '未绑定'
                    : latestVerifySession
                      ? bindingStatus(latestVerifySession.status)
                      : '已绑定'

                  return (
                    <motion.div
                      key={account.id}
                      layout
                      initial={{opacity: 0, y: 8}}
                      animate={{opacity: 1, y: 0}}
                      data-testid={`account-row-${account.id}`}
                      className={cn(
                        'group relative overflow-hidden rounded-2xl border p-4 transition-all duration-200',
                        isSelected ? 'border-primary/30 bg-primary/[0.03] shadow-sm shadow-primary/5' : 'border-border hover:shadow-sm hover:border-border/80',
                      )}
                    >
                      <button type="button" className="w-full text-left" onClick={() => onSelectedAccountChange(account.id)}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-foreground">{account.name}</p>
                              {statusBadge(account.status)}
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] uppercase tracking-[0.16em]',
                                  !isBoundAccount
                                    ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                                    : latestVerifySession?.status === 'running'
                                      ? 'border-primary/20 bg-primary/[0.06] text-primary'
                                      : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
                                )}
                              >
                                {verificationStateLabel}
                              </Badge>
                              {isDefaultAccount && <Badge variant="outline" className="text-[10px]">默认执行</Badge>}
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">登录名</p>
                                <p className="mt-1 truncate text-sm text-foreground">{account.accountName || account.loginIdentifierMasked || '未填写'}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">最近会话</p>
                                <p className="mt-1 text-sm text-foreground">{bindingStatus(account.latestBindingSession?.status)}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">上次验证</p>
                                <p className="mt-1 text-sm text-foreground">{latestVerifySession ? formatSessionTime(latestVerifySession.updated_at || latestVerifySession.created_at) : '-'}</p>
                              </div>
                            </div>
                            {account.lastError && <p className="mt-3 text-xs text-red-500 line-clamp-2">{account.lastError}</p>}
                          </div>
                          {isSelected && <Badge variant="outline" className="text-[10px] text-primary">当前</Badge>}
                        </div>
                      </button>
                    </motion.div>
                  )
                })}
              </CardContent>
            </Card>

            <Card className="overflow-hidden" data-testid="selected-account-panel">
              <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.07),transparent_72%)] pb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">Selected Account</p>
                <CardTitle className="mt-2 text-base">账号详情</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4" data-testid="account-task-panel">
                {selectedAccount ? (
                  <>
                    <div className="rounded-[22px] border border-border/70 bg-background/85 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-foreground">{selectedAccount.name}</p>
                            {statusBadge(selectedAccount.status)}
                            {selectedDefaultAccountId === selectedAccount.id && (
                              <Badge variant="outline" className="text-[10px]">默认执行</Badge>
                            )}
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">登录名：{selectedAccount.accountName || selectedAccount.loginIdentifierMasked || '未填写'}</p>
                          <p className="mt-2 text-sm text-muted-foreground">{selectedAccountStatusHint}</p>
                          {selectedAccount.lastError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{selectedAccount.lastError}</p>}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {renderAccountActionButtons(selectedAccount, 'selected')}
                        {selectedAccount.status === 'active' && selectedDefaultAccountId !== selectedAccount.id && (
                          <Button size="sm" variant="outline" className="gap-2" onClick={() => onSetDefaultAccount(selectedAccount.id)}>
                            <Check className="h-3.5 w-3.5"/>设为默认
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                          onClick={() => onDeleteAccount(selectedAccount.id)}
                          disabled={actionPendingAccountId === selectedAccount.id}
                          data-testid={`account-delete-${selectedAccount.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5"/>删除账号
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-border/70 bg-background/85 p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">验证状态</p>
                          <p className="mt-2 text-sm font-medium text-foreground">
                            {selectedAccountIsBound
                              ? selectedLatestVerifySession
                                ? bindingStatus(selectedLatestVerifySession.status)
                                : '已绑定'
                              : selectedAccount.status === 'expired'
                                ? '已失效'
                                : '未绑定'}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] uppercase tracking-[0.16em]',
                            !selectedAccountIsBound
                              ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                              : selectedLatestVerifySession?.status === 'running'
                                ? 'border-primary/20 bg-primary/[0.06] text-primary'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
                          )}
                        >
                          {selectedLatestVerifySession?.status === 'running'
                            ? '验证中'
                            : selectedAccountIsBound
                              ? '可复用'
                              : selectedAccount.status === 'expired'
                                ? '需重绑'
                                : '待绑定'}
                        </Badge>
                      </div>

                      <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                        <div className="flex items-center justify-between gap-3">
                          <span>最近会话</span>
                          <span>{bindingStatus(selectedAccount.latestBindingSession?.status)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>上次更新时间</span>
                          <span>{formatSessionTime(selectedLatestVerifySession?.updated_at || selectedLatestVerifySession?.created_at || selectedAccount.lastVerified)}</span>
                        </div>
                      </div>

                      <p className="mt-4 text-sm leading-6 text-muted-foreground">
                        {selectedLatestVerifySession
                          ? verifySessionSummary(selectedLatestVerifySession)
                          : selectedAccount.status === 'expired'
                            ? '该账号最近一次登录态已经失效，请重新绑定后再进行验证。'
                            : '当前账号还没有验证记录，完成绑定后即可查看验证结果。'}
                      </p>

                      {selectedLatestVerifySession?.latest_screenshot_url && (
                        <div className="mt-4 overflow-hidden rounded-xl border bg-muted/20">
                          <img
                            src={selectedLatestVerifySession.latest_screenshot_url}
                            alt={`${selectedAccount.name} 最近验证截图`}
                            className="h-48 w-full object-cover object-top"
                          />
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[22px] border border-dashed px-6 text-center">
                    <Circle className="h-10 w-10 text-muted-foreground/40"/>
                    <p className="mt-4 text-sm font-medium text-muted-foreground">请选择一个账号查看详情</p>
                    <p className="mt-2 text-xs leading-6 text-muted-foreground/80">右侧会显示当前账号的验证状态、最近结果，以及可执行的绑定/验证/解绑动作。</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="presets" className="mt-0 space-y-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_360px]">
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.07),transparent_72%)] pb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">Global Presets</p>
                <CardTitle className="mt-2 text-base">全局执行预设</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 pt-4">
                <div className="rounded-[24px] border border-border/70 bg-background/82 p-4 shadow-sm">
                  <Label htmlFor="platform-config-custom-message" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    默认主动沟通话术
                  </Label>
                  <Textarea
                    id="platform-config-custom-message"
                    placeholder="例如：您好，我是机灵平台企业招聘负责人，目前在招聘区域运营经理岗位，想先确认您最近是否方便沟通。"
                    value={customMessage}
                    onChange={(event) => onCustomMessageChange(event.target.value)}
                    rows={7}
                    maxLength={500}
                    className="mt-3 min-h-[12rem] resize-none rounded-[20px] border-border/70 bg-background/90 text-sm leading-7"
                  />
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-xs leading-6 text-muted-foreground">{strategyPreview}</p>
                      <p className={cn('text-xs', customMessage.length >= 500 ? 'font-medium text-destructive' : customMessage.length >= 450 ? 'text-amber-600' : 'text-muted-foreground')}>
                        {customMessage.length}/500 字符
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">单次发送上限</span>
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={messageSendLimit}
                        onChange={(event) => onMessageSendLimitChange(Math.max(1, Math.min(50, Number(event.target.value) || 10)))}
                        className="h-9 w-20 rounded-full text-center text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[24px] border border-border/70 bg-background/82 p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">{autoVerifyCheck.label}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{autoVerifyCheck.detail}</p>
                      </div>
                      <Switch checked={autoVerifyEnabled} onCheckedChange={onAutoVerifyEnabledChange} aria-label="自动验证开关"/>
                    </div>
                    <p className="mt-3 text-xl font-semibold tracking-tight text-foreground">{autoVerifyCheck.summary}</p>
                  </div>

                  <div className="rounded-[24px] border border-border/70 bg-background/82 p-4 shadow-sm">
                    <p className="text-sm font-medium text-foreground">预设将如何生效</p>
                    <ul className="mt-3 space-y-2 text-xs leading-6 text-muted-foreground">
                      <li>执行页新增执行组时，会优先带入平台默认账号和默认岗位。</li>
                      <li>人才探索工作流会自动带入这份默认沟通话术与人数上限。</li>
                      <li>平台页处理的是长期配置，执行页只负责本次运行的即时编排。</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--primary)/0.07),transparent_72%)] pb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">Preset Coverage</p>
                <CardTitle className="mt-2 text-base">预设覆盖范围</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <div className="rounded-[24px] border border-border/70 bg-background/82 p-4 shadow-sm">
                  <p className="text-sm font-medium text-foreground">这里应该配置什么</p>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">平台绑定账号、平台默认执行账号、平台默认岗位模板、默认沟通话术、默认单次发送上限。</p>
                </div>
                <div className="rounded-[24px] border border-border/70 bg-background/82 p-4 shadow-sm">
                  <p className="text-sm font-medium text-foreground">这里不处理什么</p>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">本次执行到底选哪几个执行组、立即执行还是定期执行、每次运行的临时增删改，都在招聘执行页处理。</p>
                </div>
                <div className="rounded-[24px] border border-emerald-200/70 bg-emerald-50/80 p-4 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-100">当前长期配置完成度</p>
                  <p className="mt-2 font-mono text-2xl font-semibold text-emerald-800 dark:text-emerald-100">{resolvedPreparationCount}</p>
                  <p className="mt-1 text-xs leading-6 text-emerald-700/80 dark:text-emerald-200/80">这代表已经可被执行页自动带入的默认项数量。</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </TabsContent>
  )
}
