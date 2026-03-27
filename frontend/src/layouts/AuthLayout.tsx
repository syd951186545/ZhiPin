import React from 'react';
import {Navigate, Outlet} from 'react-router-dom';
import {useAuth} from '@/contexts/AuthContext';
import {motion} from 'motion/react';

export default function AuthLayout() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F2EA] text-muted-foreground">
        正在恢复登录状态...
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="grid min-h-screen md:grid-cols-[45vw_1fr]">
      {/* ── Brand Panel ── */}
      <div className="relative hidden overflow-hidden bg-[#0D1A22] text-[#eef4f8] md:flex">
        {/* Large ghost watermark */}
        <div
          className="pointer-events-none absolute inset-0 flex select-none items-center justify-center"
          aria-hidden="true"
        >
          <span className="text-[18vw] font-extrabold leading-none tracking-[-0.04em] text-[#1a2f3e]">
            机灵
          </span>
        </div>

        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.7) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        {/* Ambient color glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_65%_55%_at_18%_50%,rgba(45,142,147,0.15),transparent),radial-gradient(ellipse_45%_30%_at_82%_22%,rgba(216,155,43,0.07),transparent)]" />

        {/* Workflow nodes */}
        <WorkflowNodes />

        <div className="relative flex w-full flex-col justify-between p-10 xl:p-14">
          {/* Top: Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#155E63] text-base font-extrabold text-white shadow-[0_8px_24px_rgba(21,94,99,0.36)]">
              机
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9dc5c8]">
                Business Agent Workspace
              </p>
              <p className="text-sm font-semibold tracking-[-0.01em]">机灵平台</p>
            </div>
          </div>

          {/* Center-upper: Hero */}
          <div className="max-w-[30rem]">
            <h1 className="text-[2.5rem] font-extrabold leading-[1.16] tracking-[-0.025em] xl:text-[3.2rem]">
              执行权归机器，
              <br />
              <span className="text-[#f2d9a3]">决策权归人。</span>
            </h1>
            <p className="mt-5 max-w-[26rem] text-[15px] leading-[1.9] text-[#8aa8b8]">
              数字员工全天候接管招聘、运营等高重复流程，每步操作均完整留证。人只在关键节点介入，审核结果，决定方向。
            </p>
          </div>

          {/* Bottom: Capabilities + tagline */}
          <div>
            <div className="mb-5 flex flex-wrap gap-2">
              <CapabilityPill label="全程留证" sublabel="截图 · 日志 · AI 输出" />
              <CapabilityPill label="账号托管" sublabel="独立隔离 · 统一管理" />
              <CapabilityPill label="断点续跑" sublabel="异常自动重试" />
            </div>
            <p className="text-[11px] tracking-[0.06em] text-[#3d5566]">
              机灵科技 · 企业级执行自动化基础设施
            </p>
          </div>
        </div>
      </div>

      {/* ── Form Panel ── */}
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F2EA] px-5 py-12 sm:px-10 md:border-l md:border-[#14202B]/[0.08] lg:px-14 xl:px-20">
        <div className="w-full max-w-[480px]">
          {/* Brand wordmark — visible on mobile and desktop */}
          <div className="mb-10 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#155E63] text-sm font-extrabold text-white shadow-[0_6px_16px_rgba(21,94,99,0.28)]">
              机
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#155E63]/70">
                Business Agent Workspace
              </p>
              <p className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/80">
                机灵平台
              </p>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38 }}
          >
            <Outlet />
          </motion.div>

          <p className="mt-10 text-center text-[11px] tracking-[0.04em] text-muted-foreground/50">
            企业级安全登录 · 数据本地化存储
          </p>
        </div>
      </div>
    </div>
  );
}

function WorkflowNodes() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {/* SVG connector lines */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
        <line x1="57%" y1="33%" x2="70%" y2="50%" stroke="white" strokeWidth="1" strokeDasharray="4 4" />
        <line x1="33%" y1="46%" x2="57%" y2="33%" stroke="white" strokeWidth="1" strokeDasharray="4 4" />
        <line x1="70%" y1="50%" x2="48%" y2="66%" stroke="white" strokeWidth="1" strokeDasharray="4 4" />
      </svg>
      {/* Running node — teal */}
      <div className="absolute" style={{ top: '33%', left: '57%' }}>
        <div className="h-2 w-2 rounded-full bg-[#2D8E93] shadow-[0_0_10px_rgba(45,142,147,0.9),0_0_22px_rgba(45,142,147,0.4)]" />
      </div>
      {/* Running node — teal, smaller */}
      <div className="absolute" style={{ top: '50%', left: '70%' }}>
        <div className="h-1.5 w-1.5 rounded-full bg-[#2D8E93] opacity-70 shadow-[0_0_8px_rgba(45,142,147,0.8)]" />
      </div>
      {/* Completed node — teal, faint */}
      <div className="absolute" style={{ top: '66%', left: '48%' }}>
        <div className="h-1.5 w-1.5 rounded-full bg-[#2D8E93] opacity-40 shadow-[0_0_6px_rgba(45,142,147,0.5)]" />
      </div>
      {/* Pending human review — amber */}
      <div className="absolute" style={{ top: '46%', left: '33%' }}>
        <div className="h-2 w-2 rounded-full bg-[#D89B2B] shadow-[0_0_10px_rgba(216,155,43,0.85),0_0_22px_rgba(216,155,43,0.35)]" />
      </div>
    </div>
  );
}

function CapabilityPill({ label, sublabel }: { label: string; sublabel: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.04] px-3 py-1.5">
      <span className="text-[13px] font-medium text-[#eef4f8]">{label}</span>
      <span className="text-[11px] text-[#5e7a8a]">{sublabel}</span>
    </div>
  );
}
