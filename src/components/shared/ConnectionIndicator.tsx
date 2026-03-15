import React from 'react'
import {CheckCircle2, Loader2, WifiOff} from 'lucide-react'
import {useOpenClaw} from '@/contexts/OpenClawContext'
import {useI18n} from '@/contexts/I18nContext'
import {cn} from '@/lib/utils'

export default function ConnectionIndicator() {
  const {isReady, serviceState} = useOpenClaw()
  const {t} = useI18n()

  const stateConfig = {
    ready: {
      className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400',
      icon: <CheckCircle2 className="w-4 h-4"/>,
      label: t('status.connected'),
    },
    idle: {
      className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:text-yellow-400',
      icon: <WifiOff className="w-4 h-4"/>,
      label: '未配置',
    },
    error: {
      className: 'bg-destructive/10 text-destructive border-destructive/20',
      icon: <WifiOff className="w-4 h-4"/>,
      label: t('status.disconnected'),
    },
  }

  const config = stateConfig[serviceState]

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full border transition-colors',
        config.className,
      )}
      title={isReady ? 'OpenClaw 已就绪' : '请在设置中配置 OpenClaw 连接'}
    >
      {config.icon}
      {config.label}
    </div>
  )
}
