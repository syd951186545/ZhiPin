import {useEffect, useMemo, useState} from 'react'
import {AlertTriangle, CheckCircle2, Loader2, ShieldCheck, Unplug} from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {supabase} from '@/lib/supabase'
import {cn} from '@/lib/utils'
import {
  fetchBindingSession,
  subscribePlatformBindingSession,
} from '@/services/platformAccountService'
import type {PlatformBindingSession} from '@/types/openclaw'

interface PlatformActionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: PlatformBindingSession | null
  platformName?: string
  accountName?: string
  onDataChanged?: () => Promise<void> | void
  followupActionLabel?: string
  onFollowupAction?: () => void
}

type ActionPhase = 'running' | 'success' | 'error'

function statusTone(status?: string | null): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
    case 'failed':
    case 'expired':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
    case 'awaiting_sms':
    case 'awaiting_qr':
    case 'awaiting_password_2fa':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
    default:
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  }
}

function statusLabel(status?: string | null, action?: PlatformBindingSession['action']): string {
  const doneLabel = action === 'unbind' ? '已解绑' : '已完成'
  const failLabel = action === 'unbind' ? '解绑失败' : '验证失败'
  switch (status) {
    case 'completed': return doneLabel
    case 'failed': return failLabel
    case 'expired': return '已过期'
    case 'awaiting_sms': return '等待短信'
    case 'awaiting_qr': return '等待扫码'
    case 'awaiting_password_2fa': return '等待二次验证'
    case 'running':
    default:
      return action === 'unbind' ? '解绑中' : '验证中'
  }
}

export default function PlatformActionDialog({
  open,
  onOpenChange,
  session,
  platformName,
  accountName,
  onDataChanged,
  followupActionLabel,
  onFollowupAction,
}: PlatformActionDialogProps) {
  const [status, setStatus] = useState<string>('running')
  const [reason, setReason] = useState('')
  const [stepKey, setStepKey] = useState('')
  const [latestScreenshot, setLatestScreenshot] = useState<string | null>(null)
  const [accumulatedText, setAccumulatedText] = useState('')
  const [streamError, setStreamError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !session) {
      setStatus('running')
      setReason('')
      setStepKey('')
      setLatestScreenshot(null)
      setAccumulatedText('')
      setStreamError(null)
      return
    }

    let cancelled = false
    let unsubscribe = () => {}
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let finalStateHandled = false

    const applySnapshot = (snapshot: PlatformBindingSession) => {
      setStatus(snapshot.status || 'running')
      setReason(snapshot.error_message || '')
      setStepKey(snapshot.step_key || '')
      setLatestScreenshot(snapshot.latest_screenshot_url || null)
      setAccumulatedText(snapshot.output_text || '')
    }

    const syncTerminalState = async (snapshot: PlatformBindingSession) => {
      if (!['completed', 'failed', 'expired', 'cancelled'].includes(snapshot.status || '') || finalStateHandled) {
        return
      }
      finalStateHandled = true
      await onDataChanged?.()
    }

    const hydrate = async () => {
      setStatus(session.status || 'running')
      setReason(session.error_message || '')
      setStepKey(session.step_key || '')
      setLatestScreenshot(session.latest_screenshot_url || null)
      setAccumulatedText(session.output_text || '')
      setStreamError(null)

      const {data} = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        setStreamError('当前登录已失效，无法订阅验证进度')
        return
      }

      try {
        const snapshot = await fetchBindingSession(session.id)
        if (!cancelled) {
          applySnapshot(snapshot)
          await syncTerminalState(snapshot)
        }
      } catch (error) {
        if (!cancelled) {
          setStreamError(error instanceof Error ? error.message : '加载验证会话失败')
        }
      }

      unsubscribe = subscribePlatformBindingSession(
        session.id,
        {
          onProgress: (data) => {
            if (cancelled) return
            if (typeof data.accumulated_text === 'string') {
              setAccumulatedText(data.accumulated_text)
            }
            if (typeof data.latest_screenshot === 'string') {
              setLatestScreenshot(data.latest_screenshot)
            }
          },
          onState: (data) => {
            if (cancelled) return
            if (typeof data.status === 'string') setStatus(data.status)
            if (typeof data.reason === 'string') setReason(data.reason)
            if (typeof data.step_key === 'string') setStepKey(data.step_key)
            if (typeof data.latest_screenshot === 'string') {
              setLatestScreenshot(data.latest_screenshot)
            }
            if (typeof data.accumulated_text === 'string') {
              setAccumulatedText(data.accumulated_text)
            }
          },
          onComplete: async (data) => {
            if (cancelled) return
            setStatus('completed')
            if (typeof data.reason === 'string') setReason(data.reason)
            if (typeof data.latest_screenshot === 'string') {
              setLatestScreenshot(data.latest_screenshot)
            }
            if (typeof data.accumulated_text === 'string') {
              setAccumulatedText(data.accumulated_text)
            }
            finalStateHandled = true
            await onDataChanged?.()
          },
          onError: async (data) => {
            if (cancelled) return
            setStatus(typeof data.status === 'string' ? data.status : 'failed')
            if (typeof data.reason === 'string') {
              setReason(data.reason)
            } else if (typeof data.message === 'string') {
              setReason(data.message)
            }
            if (typeof data.latest_screenshot === 'string') {
              setLatestScreenshot(data.latest_screenshot)
            }
            if (typeof data.accumulated_text === 'string') {
              setAccumulatedText(data.accumulated_text)
            }
            finalStateHandled = true
            await onDataChanged?.()
          },
        },
        token,
      )

      pollTimer = setInterval(() => {
        void (async () => {
          if (cancelled) return
          try {
            const snapshot = await fetchBindingSession(session.id)
            if (cancelled) return
            applySnapshot(snapshot)
            await syncTerminalState(snapshot)
          } catch (error) {
            if (!cancelled) {
              setStreamError(error instanceof Error ? error.message : '轮询验证状态失败')
            }
          }
        })()
      }, 3000)
    }

    hydrate().catch((error) => {
      if (!cancelled) {
        setStreamError(error instanceof Error ? error.message : '订阅验证进度失败')
      }
    })

    return () => {
      cancelled = true
      if (pollTimer) {
        clearInterval(pollTimer)
      }
      unsubscribe()
    }
  }, [open, session, onDataChanged])

  const actionLabel = session?.action === 'unbind' ? '解绑账号' : '验证登录'
  const intro = useMemo(() => {
    if (session?.action === 'unbind') {
      return 'OpenClaw 正在后台清理该账号的登录态并确认已退出，不会打开远程桌面。'
    }
    return 'OpenClaw 正在后台复用该账号的持久会话，直接检查企业端是否仍处于已登录状态，不会打开远程桌面。'
  }, [session?.action])

  const phase: ActionPhase = status === 'completed' ? 'success' : ['failed', 'expired'].includes(status) ? 'error' : 'running'
  const Icon = session?.action === 'unbind' ? Unplug : ShieldCheck
  const latestUpdateAt = session?.updated_at || session?.created_at
  const canFollowup = Boolean(followupActionLabel && onFollowupAction && session?.action === 'verify' && phase !== 'running')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="platform-action-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4"/>
            {actionLabel}
            <Badge className={cn('border-0', statusTone(status))}>{statusLabel(status, session?.action)}</Badge>
          </DialogTitle>
          <DialogDescription>
            {platformName || '-'} · {accountName || '-'} · {intro}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              {phase === 'running' ? <Loader2 className="h-4 w-4 animate-spin text-primary"/> : null}
              {phase === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-500"/> : null}
              {phase === 'error' ? <AlertTriangle className="h-4 w-4 text-red-500"/> : null}
              <span>{session?.action === 'unbind' ? (phase === 'success' ? '最终解绑结果' : '当前解绑状态') : (phase === 'success' ? '最终验证结果' : '当前验证状态')}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {reason || (phase === 'running'
                ? (session?.action === 'unbind' ? 'OpenClaw 正在执行解绑，请稍候...' : 'OpenClaw 正在执行验证，请稍候...')
                : '暂无补充说明')}
            </p>
            {stepKey && (
              <p className="mt-2 text-xs text-muted-foreground">
                当前步骤：<span className="font-mono">{stepKey}</span>
              </p>
            )}
            {latestUpdateAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                最近更新：<span className="font-mono">{new Date(latestUpdateAt).toLocaleString('zh-CN')}</span>
              </p>
            )}
          </div>

          {streamError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/20 dark:text-red-300">
              {streamError}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-xl border">
              <div className="border-b px-4 py-3 text-sm font-medium">OpenClaw 验证反馈</div>
              <div className="max-h-[360px] overflow-y-auto p-4">
                {accumulatedText ? (
                  <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">
                    {accumulatedText}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {phase === 'running'
                      ? (session?.action === 'unbind' ? '等待 OpenClaw 返回解绑过程...' : '等待 OpenClaw 返回验证过程...')
                      : '本次未返回额外过程输出。'}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border">
              <div className="border-b px-4 py-3 text-sm font-medium">最近截图</div>
              <div className="p-4">
                {latestScreenshot ? (
                  <img
                    src={latestScreenshot}
                    alt={`${actionLabel} 最近截图`}
                    className="w-full rounded-lg border object-cover"
                  />
                ) : (
                  <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                    暂无截图
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          {canFollowup && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false)
                onFollowupAction?.()
              }}
            >
              {followupActionLabel}
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>{phase === 'running' ? '后台继续执行，关闭窗口' : '关闭'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
