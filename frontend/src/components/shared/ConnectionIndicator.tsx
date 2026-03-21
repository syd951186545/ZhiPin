import React, {useEffect, useState} from 'react'
import {CheckCircle2, Loader2, WifiOff} from 'lucide-react'
import {useI18n} from '@/contexts/I18nContext'
import {cn} from '@/lib/utils'
import {testBackendConnection} from '@/services/workflowService'

export default function ConnectionIndicator() {
  const {t} = useI18n()
  const [serviceState, setServiceState] = useState<'idle' | 'ready' | 'error'>('idle')

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      try {
        await testBackendConnection()
        if (!cancelled) setServiceState('ready')
      } catch {
        if (!cancelled) setServiceState('error')
      }
    }

    check()
    const timer = window.setInterval(check, 30000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const stateConfig = {
    ready: {
      className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400',
      icon: <CheckCircle2 className="w-4 h-4"/>,
      label: t('status.connected'),
    },
    idle: {
      className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:text-yellow-400',
      icon: <WifiOff className="w-4 h-4"/>,
      label: '连接中',
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
      title={serviceState === 'ready' ? 'FastAPI 后端已连接' : '正在检查 FastAPI 后端连接'}
    >
      {config.icon}
      {config.label}
    </div>
  )
}
