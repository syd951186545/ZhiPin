import React from 'react';
import {Navigate, Outlet} from 'react-router-dom';
import {useAuth} from '@/contexts/AuthContext';
import {motion} from 'motion/react';

export default function AuthLayout() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        正在恢复登录状态...
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen w-full max-w-[1540px] md:grid-cols-[0.96fr,1.04fr]">
        {/* ── Brand Panel ── */}
        <div className="relative hidden overflow-hidden bg-[#14202b] text-[#eef4f8] md:flex">
          {/* Ambient glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_20%_40%,rgba(45,142,147,0.22),transparent),radial-gradient(ellipse_60%_40%_at_80%_20%,rgba(216,155,43,0.10),transparent)]" />
          {/* Subtle grid texture */}
          <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '48px 48px'}} />

          <div className="relative flex w-full flex-col justify-between p-8 lg:p-10 xl:p-12">
            {/* Top: Logo */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#2d8e93] text-lg font-extrabold text-white shadow-[0_12px_28px_rgba(45,142,147,0.32)]">
                J
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9dc5c8]">Business Agent Workspace</p>
                <p className="text-base font-semibold tracking-[-0.01em]">机灵平台</p>
              </div>
            </div>

            {/* Center: Hero */}
            <div className="max-w-[28rem]">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#2d8e93]/30 bg-[#2d8e93]/10 px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-[#7ecfd3]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#2d8e93] shadow-[0_0_6px_rgba(45,142,147,0.6)]" />
                企业数字员工执行台
              </p>
              <h1 className="text-[2.15rem] font-extrabold leading-[1.18] tracking-[-0.02em] lg:text-[3.1rem]">
                让系统先替你执行，
                <br />
                <span className="text-[#f2d9a3]">再把证据交回给人。</span>
              </h1>
              <p className="mt-4 max-w-md text-[15px] leading-7 text-[#9db1bd]">
                面向招聘、运营、客服等高重复流程，把账号状态、任务推进、截图证据与 AI 输出统一收束在一个业务工作台里。
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <CapabilityPill label="流程可视化" sublabel="每步可回看" />
                <CapabilityPill label="账号可复用" sublabel="绑定 · 验证 · 恢复" />
                <CapabilityPill label="AI 留痕" sublabel="日志 + 截图 + 输出" />
              </div>
            </div>

            {/* Bottom: Tagline */}
            <p className="text-[12px] tracking-[0.06em] text-[#5e7382]">
              工业理性 · 运营指挥室 · 设计系统 v1
            </p>
          </div>
        </div>

        {/* ── Form Panel ── */}
        <div className="flex items-center justify-center bg-[linear-gradient(180deg,rgba(255,253,250,0.82),rgba(245,242,234,0.94))] p-5 sm:p-8 md:border-l md:border-border/50 lg:p-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-[430px]"
          >
            <Outlet />
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function CapabilityPill({ label, sublabel }: { label: string; sublabel: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5">
      <span className="text-[13px] font-medium text-[#eef4f8]">{label}</span>
      <span className="text-[11px] text-[#6b8393]">{sublabel}</span>
    </div>
  );
}
