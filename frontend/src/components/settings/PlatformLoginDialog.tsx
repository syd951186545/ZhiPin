import React, {useCallback, useEffect, useRef, useState} from 'react'
import {
  AlertTriangle, Check, CheckCircle2, Loader2, Monitor, StopCircle, X,
} from 'lucide-react'
import {AnimatePresence, motion} from 'motion/react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {Button} from '@/components/ui/button'
import {Badge} from '@/components/ui/badge'
import {usePlatformAccounts} from '@/hooks/usePlatformAccounts'
import {PLATFORMS} from '@/lib/constants'
import {cn} from '@/lib/utils'
import type {LiveLoginSession, LiveLoginStatus} from '@/services/platformAccountService'

interface PlatformLoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profileId: string | null
  onDataChanged?: () => Promise<void> | void
}

type LiveLoginPhase = 'idle' | 'starting' | 'running' | 'confirming' | 'confirmed' | 'stopped' | 'expired' | 'error'

const STEPS = ['启动远程桌面', '登录平台账号', '确认登录状态', '完成']

function deriveStep(phase: LiveLoginPhase): number {
  switch (phase) {
    case 'idle': return 0
    case 'starting': return 0
    case 'running': return 1
    case 'confirming': return 2
    case 'confirmed': return 3
    case 'stopped': return 0
    case 'expired': return 0
    case 'error': return 0
    default: return 0
  }
}

function StepIndicator({currentStep}: {currentStep: number}) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((label, idx) => {
        const isDone = idx < currentStep
        const isActive = idx === currentStep
        return (
          <React.Fragment key={label}>
            {idx > 0 && <div className={cn('h-px flex-1 transition-colors', isDone ? 'bg-emerald-400 dark:bg-emerald-600' : 'bg-border')}/>}
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-all',
                isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-primary text-primary-foreground ring-2 ring-primary/20' : 'bg-muted text-muted-foreground',
              )}>
                {isDone ? <Check className="h-3.5 w-3.5"/> : idx + 1}
              </div>
              <span className={cn('text-xs whitespace-nowrap', isActive ? 'font-medium text-foreground' : 'text-muted-foreground')}>{label}</span>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function PlatformLoginDialog({open, onOpenChange, profileId, onDataChanged}: PlatformLoginDialogProps) {
  const {
    accounts,
    loading: accountsLoading,
    load,
    startLiveLoginSession,
    confirmLiveLoginSession,
    stopLiveLoginSession,
    getLiveLoginSessionStatus,
  } = usePlatformAccounts()

  const profile = accounts.find((item) => item.id === profileId)
  const platformMeta = profile ? PLATFORMS[profile.platform] : null

  const [phase, setPhase] = useState<LiveLoginPhase>('idle')
  const [liveSession, setLiveSession] = useState<LiveLoginSession | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [confirmMessage, setConfirmMessage] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 会话活跃时阻止浏览器标签页被意外关闭
  useEffect(() => {
    if (phase !== 'running' && phase !== 'confirming') return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [phase])

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  // Reset on dialog open/close
  useEffect(() => {
    if (!open) {
      cleanup()
      setPhase('idle')
      setLiveSession(null)
      setRemaining(0)
      setError(null)
      setConfirmMessage('')
    }
  }, [open, cleanup])

  // Poll session status while running
  useEffect(() => {
    if (phase !== 'running' || !liveSession) return
    cleanup()

    const poll = async () => {
      try {
        const status: LiveLoginStatus = await getLiveLoginSessionStatus(liveSession.session_id)
        if (status.time_remaining != null) {
          setRemaining(Math.floor(status.time_remaining))
        }
        if (!status.active) {
          setPhase('expired')
          setError('登录会话已超时，请重新开始')
          cleanup()
        }
      } catch {
        // ignore transient poll errors
      }
    }

    poll()
    pollRef.current = setInterval(poll, 5000)
    return cleanup
  }, [phase, liveSession, getLiveLoginSessionStatus, cleanup])

  const handleStart = async () => {
    if (!profileId || !profile) return
    setPhase('starting')
    setError(null)
    setConfirmMessage('')
    try {
      const session = await startLiveLoginSession(profileId, profile.platform)
      setLiveSession(session)
      setRemaining(session.timeout_seconds)
      setPhase('running')
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动远程登录失败')
      setPhase('error')
    }
  }

  const handleConfirm = async () => {
    if (!liveSession) return
    setPhase('confirming')
    setError(null)
    try {
      const result = await confirmLiveLoginSession(liveSession.session_id)
      if (result.is_logged_in) {
        setPhase('confirmed')
        setConfirmMessage(result.message || '登录状态已保存')
        cleanup()
        await load()
        await onDataChanged?.()
      } else {
        setPhase('running')
        const detail = [result.message, result.persistence_detail].filter(Boolean).join('：')
        setError(detail || '未检测到有效登录状态，请继续在远程桌面中完成登录')
      }
    } catch (err) {
      setPhase('running')
      setError(err instanceof Error ? err.message : '确认登录失败')
    }
  }

  const handleStop = async () => {
    if (!liveSession) return
    cleanup()
    try {
      await stopLiveLoginSession(liveSession.session_id)
    } catch {
      // best-effort
    }
    setPhase('stopped')
    setLiveSession(null)
  }

  const handleClose = (nextOpen?: boolean) => {
    if (nextOpen === true) {
      return
    }
    if (phase === 'running' && liveSession) {
      handleStop()
    }
    onOpenChange(false)
  }

  const currentStep = deriveStep(phase)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="platform-login-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            登录平台账号
            {phase === 'running' && remaining > 0 && (
              <Badge variant="secondary" className="ml-2 tabular-nums">
                剩余 {formatRemaining(remaining)}
              </Badge>
            )}
            {phase === 'confirmed' && (
              <Badge variant="default" className="ml-2">已完成</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {platformMeta?.name || profile?.platform} · {profile?.name} — 通过远程桌面直接登录招聘平台
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <StepIndicator currentStep={currentStep}/>
        </div>

        <div className="space-y-4">
          {/* noVNC iframe area */}
          {phase === 'running' || phase === 'confirming' ? (
            <div className="rounded-xl border bg-black overflow-hidden shadow-inner" data-testid="novnc-panel">
              <iframe
                src={liveSession?.ws_url || ''}
                title="远程桌面登录"
                className="w-full border-0"
                style={{height: 'clamp(320px, 55vh, 520px)'}}
                allow="clipboard-read; clipboard-write"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            </div>
          ) : phase === 'confirmed' ? (
            <motion.div
              initial={{opacity: 0, scale: 0.95}}
              animate={{opacity: 1, scale: 1}}
              className="flex flex-col items-center justify-center gap-4 py-12 rounded-xl border bg-gradient-to-br from-emerald-50 to-card dark:from-emerald-950/20"
            >
              <motion.div
                initial={{scale: 0}}
                animate={{scale: 1}}
                transition={{type: 'spring', stiffness: 300, damping: 20, delay: 0.1}}
              >
                <CheckCircle2 className="h-16 w-16 text-emerald-500"/>
              </motion.div>
              <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">登录成功</p>
              <p className="text-sm text-muted-foreground">{confirmMessage}</p>
            </motion.div>
          ) : phase === 'starting' ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16 rounded-xl border bg-muted/20">
              <Loader2 className="h-10 w-10 animate-spin text-primary"/>
              <p className="text-sm text-muted-foreground">正在启动远程桌面...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 py-16 rounded-xl border bg-muted/20">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Monitor className="h-7 w-7 text-muted-foreground/60"/>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">远程桌面登录</p>
                <p className="text-xs text-muted-foreground mt-1">
                  点击下方按钮启动远程桌面，在浏览器中直接登录招聘平台账号
                </p>
              </div>
            </div>
          )}

          {/* Error display */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{opacity: 0, height: 0}}
                animate={{opacity: 1, height: 'auto'}}
                exit={{opacity: 0, height: 0}}
                className="overflow-hidden"
              >
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/20 dark:text-red-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5"/>
                  <span>{error}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Instructions */}
          {phase === 'running' && (
            <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/50 p-3 text-sm text-blue-700 dark:text-blue-300">
              <p className="font-medium mb-1">操作指南</p>
              <ol className="list-decimal list-inside space-y-0.5 text-xs">
                <li>在上方远程桌面中完成平台登录（支持扫码、手机号、密码等方式）</li>
                <li>确认登录成功后（能看到平台主页），点击下方「确认已登录」按钮</li>
                <li>系统将自动保存登录状态供后续自动化使用</li>
              </ol>
            </div>
          )}
        </div>

        <DialogFooter className="sticky bottom-0 z-10 justify-between gap-4 border-t bg-background/95 pt-4 backdrop-blur">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="gap-1 text-xs">
              {platformMeta?.name || '-'}
            </Badge>
          </div>
          <div className="flex gap-2">
            {phase === 'running' && (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleStop}
                  data-testid="stop-live-login"
                >
                  <StopCircle className="h-4 w-4"/>
                  停止
                </Button>
                <Button
                  className="gap-2 shadow-sm"
                  onClick={handleConfirm}
                  data-testid="confirm-live-login"
                >
                  <CheckCircle2 className="h-4 w-4"/>
                  确认已登录
                </Button>
              </>
            )}
            {phase === 'confirming' && (
              <Button disabled className="gap-2">
                <Loader2 className="h-4 w-4 animate-spin"/>
                正在验证登录状态...
              </Button>
            )}
            {(phase === 'idle' || phase === 'stopped' || phase === 'expired' || phase === 'error') && (
              <>
                <Button variant="outline" onClick={handleClose}>
                  关闭
                </Button>
                <Button
                  className="gap-2 shadow-sm"
                  onClick={handleStart}
                  disabled={!profileId || !profile || accountsLoading}
                  data-testid="start-live-login"
                >
                  <Monitor className="h-4 w-4"/>
                  {phase === 'idle' ? '启动远程桌面' : '重新启动'}
                </Button>
              </>
            )}
            {phase === 'confirmed' && (
              <Button variant="outline" onClick={handleClose}>
                完成
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
