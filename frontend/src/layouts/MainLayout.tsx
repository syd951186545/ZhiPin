import {useState} from 'react'
import {Navigate, NavLink, Outlet, useLocation} from 'react-router-dom'
import {useAuth} from '@/contexts/AuthContext'
import {useTheme} from '@/contexts/ThemeContext'
import {useI18n} from '@/contexts/I18nContext'
import {
  Bot,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Cpu,
  Languages,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sparkles,
  Sun,
} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Badge} from '@/components/ui/badge'
import {Progress} from '@/components/ui/progress'
import {Sheet, SheetContent} from '@/components/ui/sheet'
import ConnectionIndicator from '@/components/shared/ConnectionIndicator'
import {cn} from '@/lib/utils'
import {useTenantSettings} from '@/hooks/useTenantSettings'

type Translate = ReturnType<typeof useI18n>['t']

function BrandMark() {
  return (
    <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-primary/20 bg-[linear-gradient(145deg,var(--primary)_0%,var(--accent)_140%)] text-sm font-semibold text-primary-foreground shadow-[0_18px_40px_-22px_rgba(21,94,99,0.75)]">
      <span className="relative z-10 tracking-[0.24em]">JL</span>
      <div className="absolute inset-x-1 top-1 h-2 rounded-full bg-white/18" />
    </div>
  )
}

function getPageMeta(pathname: string) {
  if (pathname === '/') {
    return {
      eyebrow: 'OPERATIONS VIEW',
      title: '数字员工执行台',
      description: '一眼看清系统今天做了什么、卡在哪里，以及哪些结果已经可用。',
    }
  }

  if (pathname.startsWith('/enterprise')) {
    return {
      eyebrow: 'COMPANY PROFILE',
      title: '企业信息管理',
      description: '维护企业画像与平台执行所需的基础资料。',
    }
  }

  if (pathname.startsWith('/jiling-recruit')) {
    return {
      eyebrow: 'RECRUIT OPS',
      title: '机灵招聘',
      description: '配置平台账号、发起流程，并持续监控每一步执行结果。',
    }
  }

  if (pathname.startsWith('/settings')) {
    return {
      eyebrow: 'SYSTEM SETTINGS',
      title: '系统设置',
      description: '管理全局配置、偏好与系统级能力开关。',
    }
  }

  return {
    eyebrow: 'DIGITAL WORKFORCE',
    title: '企业数字员工工作台',
    description: '集中管理数字员工的业务执行、账号状态与平台能力。',
  }
}

function navLinkClass(isActive: boolean) {
  return cn(
    'group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all duration-200',
    isActive
      ? 'border border-primary/20 bg-primary/[0.08] text-foreground shadow-[0_20px_40px_-28px_rgba(21,94,99,0.9)]'
      : 'border border-transparent text-muted-foreground hover:border-border/80 hover:bg-background/72 hover:text-foreground',
  )
}

function subNavLinkClass(isActive: boolean) {
  return cn(
    'flex items-center gap-2.5 rounded-xl border-l-2 py-2 pl-4 pr-2.5 text-sm transition-all duration-200',
    isActive
      ? 'border-primary bg-primary/[0.08] font-medium text-primary'
      : 'border-transparent text-muted-foreground hover:border-primary/30 hover:bg-background/70 hover:text-foreground',
  )
}

function NavStatusBadge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'primary' | 'success' | 'warning'
}) {
  const toneClass = {
    neutral: 'border-border/80 bg-background/80 text-muted-foreground',
    primary: 'border-primary/15 bg-primary/[0.08] text-primary',
    success: 'border-emerald-200/80 bg-emerald-50/90 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/20 dark:text-emerald-300',
    warning: 'border-amber-200/80 bg-amber-50/90 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/20 dark:text-amber-300',
  }[tone]

  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium', toneClass)}>
      {children}
    </span>
  )
}

function ComingSoonNavItem({
  label,
  name,
  t,
  onNavigate,
}: {
  label: string
  name: string
  t: Translate
  onNavigate?: () => void
}) {
  return (
    <NavLink
      to={`/coming-soon?name=${encodeURIComponent(name)}`}
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-xl border-l-2 border-transparent py-2 pl-4 pr-2.5 text-sm text-muted-foreground/60 transition-all duration-200 hover:bg-background/60 hover:text-muted-foreground"
    >
      <Lock className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">{label}</span>
      <Badge variant="outline" className="h-5 border-border/80 bg-background/70 px-1.5 text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">
        {t('nav.comingSoon')}
      </Badge>
    </NavLink>
  )
}

function SidebarContent({
  user,
  lang,
  t,
  digitalExpanded,
  setDigitalExpanded,
  isDigitalActive,
  onNavigate,
  onLogout,
}: {
  user: {name?: string | null; email?: string | null} | null | undefined
  lang: string
  t: Translate
  digitalExpanded: boolean
  setDigitalExpanded: React.Dispatch<React.SetStateAction<boolean>>
  isDigitalActive: boolean
  onNavigate?: () => void
  onLogout: () => void
}) {
  const isZh = lang === 'zh'
  const execSummary = {
    status: isZh ? '稳定' : 'Stable',
    progressLabel: isZh ? '今日完成率' : 'Completion',
    progressValue: 76,
    metrics: [
      {label: isZh ? '待人工' : 'Manual', value: '1'},
      {label: isZh ? '已交付' : 'Delivered', value: '6'},
      {label: isZh ? '健康度' : 'Health', value: '97%'},
    ],
  }
  const navBadges = {
    dashboard: {label: '02', tone: 'primary' as const},
    enterprise: {label: isZh ? '已同步' : 'Synced', tone: 'success' as const},
    digital: {label: '03', tone: 'primary' as const},
    recruit: {label: isZh ? '运行中' : 'Active', tone: 'warning' as const},
    settings: {label: isZh ? '1 风险' : '1 risk', tone: 'warning' as const},
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/70 px-5 py-5">
        <div className="flex items-start gap-3">
          <BrandMark />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">Digital Workforce</p>
            <p className="mt-1 text-base font-semibold tracking-tight text-foreground">机灵平台</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-primary/12 bg-[linear-gradient(135deg,rgba(21,94,99,0.1),transparent_72%)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {isZh ? '今日模式' : 'Today'}
            </div>
            <NavStatusBadge tone="success">{execSummary.status}</NavStatusBadge>
          </div>
          <p className="mt-2 text-sm font-medium text-foreground">
            {isZh ? '先处理异常，再扩大发送。' : 'Handle blockers before scaling execution.'}
          </p>
          <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <span>{execSummary.progressLabel}</span>
            <span className="font-medium text-foreground">{execSummary.progressValue}%</span>
          </div>
          <Progress value={execSummary.progressValue} className="mt-2 h-2 bg-primary/10" />
          <div className="mt-3 grid grid-cols-3 gap-2">
            {execSummary.metrics.map((metric) => (
              <div key={metric.label} className="rounded-xl bg-background/72 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{metric.label}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{metric.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">{t('nav.section.business')}</div>

        <div className="space-y-2">
          <NavLink to="/" end onClick={onNavigate} className={({isActive}) => navLinkClass(isActive)}>
            <LayoutDashboard className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{t('nav.dashboard')}</div>
            </div>
            <NavStatusBadge tone={navBadges.dashboard.tone}>{navBadges.dashboard.label}</NavStatusBadge>
          </NavLink>

          <NavLink to="/enterprise" onClick={onNavigate} className={({isActive}) => navLinkClass(isActive)}>
            <Briefcase className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{t('nav.enterpriseInfo')}</div>
            </div>
            <NavStatusBadge tone={navBadges.enterprise.tone}>{navBadges.enterprise.label}</NavStatusBadge>
          </NavLink>
        </div>

        <div
          className={cn(
            'mt-4 overflow-hidden rounded-3xl border transition-all duration-200',
            isDigitalActive
              ? 'border-primary/18 bg-primary/[0.05] shadow-[0_22px_50px_-36px_rgba(21,94,99,0.8)]'
              : 'border-border/80 bg-background/55',
          )}
        >
          <button
            onClick={() => setDigitalExpanded((value) => !value)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-2xl border text-primary transition-colors',
                isDigitalActive ? 'border-primary/20 bg-primary/12' : 'border-border bg-background/80',
              )}
            >
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className={cn('text-sm font-semibold', isDigitalActive ? 'text-foreground' : 'text-foreground/85')}>
                {t('nav.digitalEmployee')}
              </div>
            </div>
            <NavStatusBadge tone={navBadges.digital.tone}>{navBadges.digital.label}</NavStatusBadge>
            {digitalExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </button>

          {digitalExpanded && (
            <div className="space-y-1.5 px-3 pb-3">
              <NavLink to="/jiling-recruit" onClick={onNavigate} className={({isActive}) => subNavLinkClass(isActive)}>
                <Cpu className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">{t('nav.jilingRecruit')}</span>
                <NavStatusBadge tone={navBadges.recruit.tone}>{navBadges.recruit.label}</NavStatusBadge>
              </NavLink>
              <ComingSoonNavItem label={t('nav.jilingService')} name="机灵客服" t={t} onNavigate={onNavigate} />
              <ComingSoonNavItem label={t('nav.jilingFinance')} name="机灵财务" t={t} onNavigate={onNavigate} />
              <ComingSoonNavItem label={t('nav.jilingOps')} name="机灵运营" t={t} onNavigate={onNavigate} />
            </div>
          )}
        </div>

        <div className="mt-4">
          <NavLink to="/settings" onClick={onNavigate} className={({isActive}) => navLinkClass(isActive)}>
            <Settings className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{t('nav.settings')}</div>
            </div>
            <NavStatusBadge tone={navBadges.settings.tone}>{navBadges.settings.label}</NavStatusBadge>
          </NavLink>
        </div>
      </nav>

      <div className="border-t border-border/70 p-4">
        <div className="rounded-3xl border border-border/80 bg-background/85 p-3.5 shadow-[0_22px_45px_-38px_rgba(20,32,43,0.9)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/18 bg-primary/10 text-sm font-semibold text-primary">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{user?.name || t('nav.user.unnamed')}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{user?.email || t('nav.user.noEmail')}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="mt-3 h-10 w-full justify-start gap-2 text-muted-foreground hover:bg-destructive/8 hover:text-destructive"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4" />
            {t('nav.logout')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function MainLayout() {
  const {isAuthenticated, loading, logout, user} = useAuth()

  useTenantSettings()

  const {theme, setTheme} = useTheme()
  const {lang, setLang, t} = useI18n()
  const location = useLocation()
  const [digitalExpanded, setDigitalExpanded] = useState(true)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        正在恢复登录状态...
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{from: location}} replace />
  }

  const isDigitalActive = ['/jiling-recruit', '/coming-soon'].some((path) => location.pathname.startsWith(path))
  const pageMeta = getPageMeta(location.pathname)

  return (
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(21,94,99,0.12),transparent_30%),linear-gradient(180deg,rgba(245,242,234,0.82),rgba(245,242,234,0.96))] text-foreground dark:bg-[radial-gradient(circle_at_top_left,rgba(21,94,99,0.18),transparent_26%),linear-gradient(180deg,rgba(12,18,24,0.98),rgba(11,17,22,1))]">
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="w-[90vw] max-w-none border-r border-border/70 bg-[linear-gradient(180deg,var(--card),var(--background))] p-0 md:hidden"
        >
          <SidebarContent
            user={user}
            lang={lang}
            t={t}
            digitalExpanded={digitalExpanded}
            setDigitalExpanded={setDigitalExpanded}
            isDigitalActive={isDigitalActive}
            onNavigate={() => setMobileNavOpen(false)}
            onLogout={() => {
              setMobileNavOpen(false)
              logout()
            }}
          />
        </SheetContent>
      </Sheet>

      <aside className="hidden h-screen w-64 shrink-0 sticky top-0 border-r border-border/70 bg-[linear-gradient(180deg,var(--card),var(--background))] md:flex xl:w-[272px]">
        <SidebarContent
          user={user}
          lang={lang}
          t={t}
          digitalExpanded={digitalExpanded}
          setDigitalExpanded={setDigitalExpanded}
          isDigitalActive={isDigitalActive}
          onLogout={logout}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/78 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-8">
            <div className="flex min-w-0 items-start gap-3 md:gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="mt-0.5 md:hidden"
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">
                  {pageMeta.eyebrow}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">{pageMeta.title}</h1>
                  <Badge variant="outline" className="border-border/80 bg-background/80 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    企业执行工作台
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 md:gap-3">
              <div className="hidden md:block">
                <ConnectionIndicator />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-10 gap-2 rounded-2xl border border-border/70 bg-background/78 px-3"
                onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              >
                <Languages className="h-4 w-4" />
                {lang === 'zh' ? 'EN' : '中文'}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-2xl border border-border/70 bg-background/78"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
              </Button>
            </div>
          </div>

          <div className="border-t border-border/60 px-4 py-3 md:hidden">
            <ConnectionIndicator />
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          <div className="min-h-full px-4 py-5 md:px-8 md:py-8">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}
