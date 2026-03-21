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
            J
          </div>
          <span className="text-xl font-bold tracking-tight">机灵平台</span>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight">
            机灵-企业数字员工、
            <br />
            机器灵智平台
          </h1>
          <p className="text-zinc-400 text-lg max-w-md">
            连接 OpenClaw 自动化引擎，面向企业数字员工与机器灵智场景，覆盖招聘执行、流程协同与智能运营。
          </p>
        </div>

        <div className="text-sm text-zinc-500">
          &copy; {new Date().getFullYear()} 机灵-企业数字员工、机器灵智平台. All rights reserved.
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
