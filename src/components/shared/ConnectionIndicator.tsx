import React from 'react'
import {Loader2, Wifi, WifiOff} from 'lucide-react'
import {useWebSocket} from '@/contexts/WebSocketContext'
import {useI18n} from '@/contexts/I18nContext'
import {cn} from '@/lib/utils'

export default function ConnectionIndicator() {
  const {isConnected, connectionState, reconnect} = useWebSocket()
  const {t} = useI18n()

  const stateConfig = {
    connected: {
      className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400',
      icon: <Wifi className="w-4 h-4"/>,
      label: t('status.connected'),
      clickable: false,
    },
    connecting: {
      className: 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400',
      icon: <Loader2 className="w-4 h-4 animate-spin"/>,
      label: t('status.connecting'),
      clickable: false,
    },
    reconnecting: {
      className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:text-yellow-400',
      icon: <Loader2 className="w-4 h-4 animate-spin"/>,
      label: t('status.reconnecting'),
      clickable: false,
    },
    disconnected: {
      className: 'bg-destructive/10 text-destructive border-destructive/20 cursor-pointer hover:bg-destructive/20',
      icon: <WifiOff className="w-4 h-4"/>,
      label: t('status.disconnected'),
      clickable: true,
    },
  }

  const config = stateConfig[connectionState]

  return (
    <button
      type="button"
      onClick={() => config.clickable && reconnect()}
      className={cn(
        'flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full border transition-colors',
        config.className,
      )}
      title={isConnected ? 'OpenClaw 已连接' : '点击重新连接 OpenClaw'}
    >
      {config.icon}
      {config.label}
    </button>
  )
}
