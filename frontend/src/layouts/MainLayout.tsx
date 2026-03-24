import React, {useState} from 'react';
import {Navigate, NavLink, Outlet, useLocation} from 'react-router-dom';
import {useAuth} from '@/contexts/AuthContext';
import {useTheme} from '@/contexts/ThemeContext';
import {useI18n} from '@/contexts/I18nContext';
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
  Moon,
  Settings,
  Sun,
} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import ConnectionIndicator from '@/components/shared/ConnectionIndicator';
import {cn} from '@/lib/utils';
import {useTenantSettings} from '@/hooks/useTenantSettings';

export default function MainLayout() {
  const { isAuthenticated, loading, logout, user } = useAuth();

  // 登录后立即从 Supabase 加载企业信息和平台账号（同步到 localStorage store）
  useTenantSettings();
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useI18n();
  const location = useLocation();
  const [digitalExpanded, setDigitalExpanded] = useState(true);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        正在恢复登录状态...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isActive = (path: string) => location.pathname === path;
  const isDigitalActive = ['/jiling-recruit', '/coming-soon'].some(p =>
    location.pathname.startsWith(p)
  );

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col shrink-0">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b gap-3 shrink-0">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center font-bold text-white text-xl shadow-sm">
            J
          </div>
          <span className="font-bold text-sm leading-tight tracking-tight">机灵平台</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">

          {/* 工作台 */}
          <NavLink
            to="/"
            end
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            {t('nav.dashboard')}
          </NavLink>

          {/* 企业信息管理 */}
          <NavLink
            to="/enterprise"
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Briefcase className="w-4 h-4 shrink-0" />
            {t('nav.enterpriseInfo')}
          </NavLink>

          {/* 企业数字员工 — 可展开分组 */}
          <div className={cn(
            'mt-2 rounded-xl overflow-hidden transition-all duration-200',
            isDigitalActive
              ? 'bg-primary/5 ring-1 ring-primary/15'
              : 'bg-muted/40 hover:bg-muted/60',
          )}>
            {/* 组头 */}
            <button
              onClick={() => setDigitalExpanded(v => !v)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold transition-colors"
            >
              <div className={cn(
                'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                isDigitalActive
                  ? 'bg-primary/15 text-primary'
                  : 'bg-muted text-muted-foreground',
              )}>
                <Bot className="w-4 h-4" />
              </div>
              <span className={cn(
                'flex-1 text-left transition-colors',
                isDigitalActive ? 'text-primary' : 'text-foreground/80',
              )}>
                {t('nav.digitalEmployee')}
              </span>
              {digitalExpanded
                ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
              }
            </button>

            {/* 子菜单 */}
            {digitalExpanded && (
              <div className="pb-1.5 px-2 space-y-0.5">

                {/* 机灵招聘 (active) */}
                <NavLink
                  to="/jiling-recruit"
                  className={({ isActive }) => cn(
                    'flex items-center gap-2.5 pl-4 pr-3 py-2 rounded-lg text-sm transition-all duration-150 border-l-2',
                    isActive
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-transparent text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground hover:border-primary/30',
                  )}
                >
                  <Cpu className="w-3.5 h-3.5 shrink-0" />
                  {t('nav.jilingRecruit')}
                </NavLink>

                {/* 机灵客服 — 即将推出 */}
                <ComingSoonNavItem label={t('nav.jilingService')} name="机灵客服" t={t} />
                {/* 机灵财务 — 即将推出 */}
                <ComingSoonNavItem label={t('nav.jilingFinance')} name="机灵财务" t={t} />
                {/* 机灵运营 — 即将推出 */}
                <ComingSoonNavItem label={t('nav.jilingOps')} name="机灵运营" t={t} />
              </div>
            )}
          </div>

          {/* 系统设置 */}
          <NavLink
            to="/settings"
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 mt-0.5',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Settings className="w-4 h-4 shrink-0" />
            {t('nav.settings')}
          </NavLink>
        </nav>

        {/* User footer */}
        <div className="p-3 border-t">
          <div className="flex items-center gap-3 px-2 py-1.5 mb-1">
            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-sm shrink-0">
              {user?.name?.charAt(0)?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-destructive text-sm"
            onClick={logout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            {t('nav.logout')}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 border-b bg-card flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <ConnectionIndicator />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            >
              <Languages className="w-4 h-4" />
              {lang === 'zh' ? 'EN' : '中文'}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-6 bg-secondary/30">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

// ── 即将推出的子菜单项（纯静态，无功能代码）────────────────
function ComingSoonNavItem({ label, name, t }: { label: string; name: string; t: (key: string) => string }) {
  return (
    <NavLink
      to={`/coming-soon?name=${encodeURIComponent(name)}`}
      className="flex items-center gap-2.5 pl-4 pr-3 py-2 rounded-lg text-sm border-l-2 border-transparent text-muted-foreground/50 hover:text-muted-foreground/70 hover:bg-accent/40 transition-colors duration-150"
    >
      <Lock className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1">{label}</span>
      <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal border-muted-foreground/20 text-muted-foreground/50">
        {t('nav.comingSoon')}
      </Badge>
    </NavLink>
  );
}
