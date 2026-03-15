import React from 'react';
import {Navigate, Outlet} from 'react-router-dom';
import {useAuth} from '@/contexts/AuthContext';
import {motion} from 'motion/react';

export default function AuthLayout() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left branding panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-zinc-900 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white text-2xl">
            Z
          </div>
          <span className="text-xl font-bold tracking-tight">ZhiPinYun</span>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight">
            AI智能招聘，
            <br />
            让企业用人更简单
          </h1>
          <p className="text-zinc-400 text-lg max-w-md">
            连接 OpenClaw 自动化引擎，实现从职位发布、简历筛选到面试安排的全流程智能招聘。
          </p>
        </div>

        <div className="text-sm text-zinc-500">
          &copy; {new Date().getFullYear()} 智聘云 ZhiPinYun. All rights reserved.
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <Outlet />
        </motion.div>
      </div>
    </div>
  );
}
