import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useI18n } from '@/contexts/I18nContext';
import { cn } from '@/lib/utils';

export default function ConnectionIndicator() {
  const { isConnected, reconnect } = useWebSocket();
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={() => !isConnected && reconnect()}
      className={cn(
        'flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full border transition-colors',
        isConnected
          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400'
          : 'bg-destructive/10 text-destructive border-destructive/20 cursor-pointer hover:bg-destructive/20'
      )}
      title={isConnected ? 'OpenClaw Connected' : 'Click to reconnect OpenClaw'}
    >
      {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
      {isConnected ? t('status.connected') : t('status.disconnected')}
    </button>
  );
}
