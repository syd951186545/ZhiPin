import React, {useEffect, useMemo, useState} from 'react'
import {
  AlertTriangle, Check, CheckCircle2, KeyRound, Loader2, Lock, Phone, QrCode, RefreshCw, ShieldCheck, Smartphone, Zap,
} from 'lucide-react'
import {AnimatePresence, motion} from 'motion/react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Badge} from '@/components/ui/badge'
import {Skeleton} from '@/components/ui/skeleton'
import {usePlatformAccounts} from '@/hooks/usePlatformAccounts'
import {supabase} from '@/lib/supabase'
import {PLATFORMS} from '@/lib/constants'
import {cn} from '@/lib/utils'
import type {PlatformBindingSessionStatus, PlatformLoginMethod} from '@/types/openclaw'
import {refreshQrCode, subscribePlatformBindingSession} from '@/services/platformAccountService'

/** 过滤 AI 原始输出中的文件路径、结构化标记、Markdown 图片语法 */
function filterProgressText(raw: string): string {
  return raw
    .replace(/!\[.*?\]\([^)]+\)/g, '[截图]')
    .replace(/\/[^\s'"<>|]+\.openclaw[^\s'"<>|]*\.(?:png|jpg|jpeg|webp)/g, '[截图]')
    .replace(/\[LOGIN_STATE:[^\]]+\]/g, '')
    .replace(/\[LOGIN_STEP:[^\]]+\]/g, '')
    .replace(/\[LOGIN_REASON:[^\]]+\]/g, '')
    .replace(/\[LOGIN_IDENTIFIER:[^\]]+\]/g, '')
    .replace(/\[STEP_DONE:[^\]]+\]/g, '')
    .replace(/\[STEP_FAILED:[^\]]+\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface PlatformLoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profileId: string | null
  onDataChanged?: () => Promise<void> | void
}

const METHOD_OPTIONS: Array<{
  value: PlatformLoginMethod
  title: string
  desc: string
  icon: React.ElementType
  color: string
}> = [
  {value: 'phone', title: '手机号绑定', desc: '输入手机号后等待验证码', icon: Smartphone, color: 'text-blue-500'},
  {value: 'qr', title: '扫码绑定', desc: '后台返回二维码截图', icon: QrCode, color: 'text-purple-500'},
  {value: 'password', title: '账号密码', desc: '可能触发二次验证', icon: ShieldCheck, color: 'text-amber-500'},
]

/* ── Step indicator ── */
const STEPS = ['选择方式', '输入信息', '等待验证', '完成']

function deriveStep(sessionStatus: PlatformBindingSessionStatus | null, pending: boolean): number {
  if (!sessionStatus && !pending) return 0
  if (sessionStatus === 'running') return 2
  if (sessionStatus === 'awaiting_sms' || sessionStatus === 'awaiting_qr' || sessionStatus === 'awaiting_password_2fa') return 2
  if (sessionStatus === 'completed') return 3
  if (sessionStatus === 'failed') return 2
  if (pending) return 1
  return 0
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
              <span className={cn('text-[10px] whitespace-nowrap', isActive ? 'font-medium text-foreground' : 'text-muted-foreground')}>{label}</span>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

/* ── Status helpers ── */
function statusText(status?: PlatformBindingSessionStatus | null) {
  switch (status) {
    case 'running': return '执行中'
    case 'awaiting_sms': return '等待验证码'
    case 'awaiting_qr': return '等待扫码'
    case 'awaiting_password_2fa': return '等待二次验证'
    case 'completed': return '已完成'
    case 'failed': return '失败'
    default: return '未开始'
  }
}

function statusBadgeVariant(status: PlatformBindingSessionStatus | null): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (status === 'completed') return 'default'
  if (status === 'failed') return 'destructive'
  if (status) return 'secondary'
  return 'outline'
}

/* ── Main Component ── */
export default function PlatformLoginDialog({open, onOpenChange, profileId, onDataChanged}: PlatformLoginDialogProps) {
  const {
    accounts,
    startBind,
    submitBind,
    refreshSession,
    load,
  } = usePlatformAccounts()

  const profile = accounts.find((item) => item.id === profileId)
  const platformMeta = profile ? PLATFORMS[profile.platform] : null
  const [loginMethod, setLoginMethod] = useState<PlatformLoginMethod>('phone')
  const [phone, setPhone] = useState('')
  const [loginName, setLoginName] = useState('')
  const [password, setPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [secondaryCode, setSecondaryCode] = useState('')
  const [pending, setPending] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionStatus, setSessionStatus] = useState<PlatformBindingSessionStatus | null>(null)
  const [sessionReason, setSessionReason] = useState('')
  const [latestScreenshot, setLatestScreenshot] = useState<string | null>(null)
  const [progressText, setProgressText] = useState('')
  const [liveError, setLiveError] = useState<string | null>(null)
  const [refreshingQr, setRefreshingQr] = useState(false)

  const canSubmitVerification = sessionStatus === 'awaiting_sms' || sessionStatus === 'awaiting_password_2fa'
  const latestBindingSession = profile?.latestBindingSession || null
  const currentStep = deriveStep(sessionStatus, pending)

  useEffect(() => {
    if (!open) return
    setPhone('')
    setVerificationCode('')
    setSecondaryCode('')
    setPassword('')
    setLiveError(null)
    setProgressText('')
    setSessionReason('')
    setLatestScreenshot(latestBindingSession?.latest_screenshot_url || latestBindingSession?.qr_screenshot_url || null)
    setSessionId(latestBindingSession?.id || null)
    setSessionStatus(latestBindingSession?.status || null)
    setLoginName(profile?.accountName || '')
    setLoginMethod(profile?.loginMethod || 'phone')
  }, [open, profile?.accountName, profile?.loginMethod, latestBindingSession?.id, latestBindingSession?.latest_screenshot_url, latestBindingSession?.qr_screenshot_url, latestBindingSession?.status])

  useEffect(() => {
    if (!open || !sessionId) return
    let unsubscribe: (() => void) | undefined
    supabase.auth.getSession().then(({data}) => {
      const token = data.session?.access_token
      const handlers: Parameters<typeof subscribePlatformBindingSession>[1] = {
        onProgress: (d) => {
          const text = String(d.accumulated_text || '')
          setProgressText(text)
          const screenshot = String(d.latest_screenshot || '') || null
          if (screenshot) setLatestScreenshot(screenshot)
        },
        onState: (d) => {
          const status = String(d.status || '') as PlatformBindingSessionStatus
          // 只在有明确状态时更新（重试通知等无 status 字段的事件不应覆盖当前状态）
          if (status) {
            setSessionStatus(status)
            if (status !== 'running') setPending(false)
          }
          if (d.reason) setSessionReason(String(d.reason))
          const screenshot = String(d.latest_screenshot || '') || null
          if (screenshot) setLatestScreenshot(screenshot)
        },
        onComplete: async (d) => {
          setSessionStatus('completed')
          setSessionReason(String(d.reason || '绑定完成'))
          const screenshot = String(d.latest_screenshot || '') || null
          if (screenshot) setLatestScreenshot(screenshot)
          setPending(false)
          await load()
          await onDataChanged?.()
        },
        onError: async (d) => {
          const message = String(d.reason || d.message || '绑定失败')
          setSessionStatus('failed')
          setSessionReason(message)
          setLiveError(message)
          const screenshot = String(d.latest_screenshot || '') || null
          if (screenshot) setLatestScreenshot(screenshot)
          setPending(false)
          await load()
          await onDataChanged?.()
        },
      }
      unsubscribe = subscribePlatformBindingSession(sessionId, handlers, token || undefined)
    }).catch(() => {})

    refreshSession(sessionId).catch(() => {})
    return () => unsubscribe?.()
  }, [load, open, refreshSession, sessionId])

  const activeMethod = useMemo(
    () => METHOD_OPTIONS.find((item) => item.value === loginMethod) || METHOD_OPTIONS[0],
    [loginMethod],
  )

  const handleStart = async () => {
    if (!profileId) return
    setPending(true)
    setLiveError(null)
    try {
      const session = await startBind(profileId, {
        login_method: loginMethod,
        phone: phone || undefined,
        login_name: loginName || undefined,
        password: password || undefined,
      })
      setSessionId(session.id)
      setSessionStatus(session.status)
      setSessionReason(session.error_message || '')
      setLatestScreenshot(session.latest_screenshot_url || session.qr_screenshot_url || null)
      await onDataChanged?.()
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : '启动绑定失败')
      setPending(false)
    }
  }

  const handleSubmitVerification = async () => {
    if (!sessionId) return
    setPending(true)
    setLiveError(null)
    try {
      const session = await submitBind(sessionId, {
        verification_code: verificationCode || undefined,
        secondary_code: secondaryCode || undefined,
        password: password || undefined,
      })
      setSessionId(session.id)
      setSessionStatus(session.status)
      setSessionReason(session.error_message || '')
      setLatestScreenshot(session.latest_screenshot_url || session.qr_screenshot_url || null)
      setVerificationCode('')
      setSecondaryCode('')
      setPassword('')
      await onDataChanged?.()
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : '提交验证信息失败')
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            绑定平台账号
            <Badge variant={statusBadgeVariant(sessionStatus)} className="ml-2">
              {statusText(sessionStatus)}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {platformMeta?.name || profile?.platform} · {profile?.name}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="py-2">
          <StepIndicator currentStep={currentStep}/>
        </div>

        <div className="grid gap-6 py-2 lg:grid-cols-[1.1fr,1fr]">
          {/* ── Left: Method & Inputs ── */}
          <div className="space-y-4">
            {/* Method selection */}
            <div className="grid gap-3 md:grid-cols-3">
              {METHOD_OPTIONS.map((item) => (
                <motion.button
                  key={item.value}
                  type="button"
                  whileHover={{scale: 1.03}}
                  whileTap={{scale: 0.97}}
                  className={cn(
                    'relative rounded-xl border p-3 text-left transition-all duration-200',
                    loginMethod === item.value
                      ? 'border-primary bg-primary/[0.05] ring-2 ring-primary/20 shadow-sm'
                      : 'border-border bg-card hover:border-border/80 hover:shadow-sm',
                  )}
                  onClick={() => setLoginMethod(item.value)}
                  disabled={pending}
                >
                  {loginMethod === item.value && (
                    <div className="absolute right-2 top-2">
                      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                        <Check className="h-2.5 w-2.5 text-primary-foreground"/>
                      </div>
                    </div>
                  )}
                  <div className="mb-2 flex items-center gap-2">
                    <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg bg-muted', loginMethod === item.value && 'bg-primary/10')}>
                      <item.icon className={cn('h-4 w-4', item.color)}/>
                    </div>
                  </div>
                  <span className="text-sm font-medium">{item.title}</span>
                  <p className="mt-1 text-[11px] text-muted-foreground leading-4">{item.desc}</p>
                </motion.button>
              ))}
            </div>

            {/* Input form */}
            <div className="rounded-xl border bg-gradient-to-br from-card to-muted/20 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{activeMethod.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{activeMethod.desc}</p>
                </div>
              </div>

              {(loginMethod === 'phone' || loginMethod === 'password') && (
                <div className="space-y-2">
                  <Label className="text-xs">{loginMethod === 'phone' ? '手机号' : '账号名'}</Label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {loginMethod === 'phone' ? <Phone className="h-4 w-4"/> : <KeyRound className="h-4 w-4"/>}
                    </div>
                    <Input
                      value={loginMethod === 'phone' ? phone : loginName}
                      onChange={(e) => loginMethod === 'phone' ? setPhone(e.target.value) : setLoginName(e.target.value)}
                      placeholder={loginMethod === 'phone' ? '请输入绑定手机号' : '请输入账号名'}
                      disabled={pending}
                      className="pl-10"
                    />
                  </div>
                </div>
              )}

              {loginMethod === 'password' && (
                <div className="space-y-2">
                  <Label className="text-xs">密码</Label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <Lock className="h-4 w-4"/>
                    </div>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="请输入账号密码"
                      disabled={pending}
                      className="pl-10"
                    />
                  </div>
                </div>
              )}

              {/* Verification code input */}
              <AnimatePresence>
                {canSubmitVerification && (
                  <motion.div
                    initial={{opacity: 0, height: 0}}
                    animate={{opacity: 1, height: 'auto'}}
                    exit={{opacity: 0, height: 0}}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 rounded-xl border-2 border-primary/20 bg-primary/[0.03] p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-primary">
                        <Loader2 className="h-4 w-4 animate-spin"/>
                        {sessionStatus === 'awaiting_sms' ? '请输入收到的短信验证码' : '请完成二次验证'}
                      </div>
                      {sessionStatus === 'awaiting_sms' && (
                        <div className="space-y-2">
                          <Label className="text-xs">短信验证码</Label>
                          <Input
                            value={verificationCode}
                            onChange={(e) => setVerificationCode(e.target.value)}
                            placeholder="6位验证码"
                            disabled={pending}
                            className="text-center text-lg tracking-[0.5em] font-mono"
                            maxLength={8}
                            autoFocus
                          />
                        </div>
                      )}
                      {sessionStatus === 'awaiting_password_2fa' && (
                        <>
                          <div className="space-y-2">
                            <Label className="text-xs">二次验证码</Label>
                            <Input
                              value={secondaryCode}
                              onChange={(e) => setSecondaryCode(e.target.value)}
                              placeholder="若平台要求，请输入二次验证码"
                              disabled={pending}
                              autoFocus
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">二次验证密码</Label>
                            <Input
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="若平台要求，请输入二次验证密码"
                              disabled={pending}
                            />
                          </div>
                        </>
                      )}
                      <Button
                        className="w-full gap-2 shadow-sm"
                        onClick={handleSubmitVerification}
                        disabled={pending || (sessionStatus === 'awaiting_sms' && !verificationCode.trim())}
                      >
                        {pending ? <Loader2 className="h-4 w-4 animate-spin"/> : <Check className="h-4 w-4"/>}
                        提交验证
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Session reason / error */}
              {sessionReason && (
                <div className={cn(
                  'rounded-lg border p-3 text-sm',
                  sessionStatus === 'failed'
                    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800/50 dark:bg-red-950/20 dark:text-red-300'
                    : sessionStatus === 'completed'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/20 dark:text-emerald-300'
                      : 'border-border bg-muted/40 text-foreground',
                )}>
                  {sessionReason}
                </div>
              )}

              {liveError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/20 dark:text-red-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5"/>
                  <span>{liveError}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Screenshot & Logs ── */}
          <div className="space-y-4">
            <div className="rounded-xl border bg-gradient-to-br from-card to-muted/20 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">后台执行面板</p>
                  <p className="text-xs text-muted-foreground mt-0.5">二维码截图、进度文本、当前等待态</p>
                </div>
                <AnimatePresence mode="wait">
                  {sessionStatus === 'completed' ? (
                    <motion.div
                      key="success"
                      initial={{scale: 0}}
                      animate={{scale: 1}}
                      transition={{type: 'spring', stiffness: 300, damping: 20}}
                    >
                      <CheckCircle2 className="h-6 w-6 text-emerald-500"/>
                    </motion.div>
                  ) : sessionStatus === 'running' ? (
                    <motion.div key="loading" initial={{opacity: 0}} animate={{opacity: 1}}>
                      <Loader2 className="h-5 w-5 animate-spin text-primary"/>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              {/* Screenshot area */}
              <div className="mt-4 rounded-xl border bg-muted/20 overflow-hidden shadow-inner relative">
                {latestScreenshot ? (
                  <>
                    <img src={latestScreenshot} alt="当前页面截图" className="h-56 w-full object-cover object-top"/>
                    {sessionStatus === 'awaiting_qr' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="absolute bottom-2 right-2 gap-1.5 text-xs shadow-md"
                        disabled={refreshingQr}
                        onClick={async () => {
                          if (!sessionId) return
                          setRefreshingQr(true)
                          try {
                            const newUrl = await refreshQrCode(sessionId)
                            if (newUrl) setLatestScreenshot(newUrl)
                          } catch {}
                          setRefreshingQr(false)
                        }}
                      >
                        {refreshingQr ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <QrCode className="h-3.5 w-3.5"/>}
                        刷新二维码
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="flex h-56 flex-col items-center justify-center gap-2">
                    {pending || sessionStatus === 'running' ? (
                      <>
                        <Skeleton className="h-4 w-3/4"/>
                        <Skeleton className="h-4 w-1/2"/>
                        <Skeleton className="h-32 w-5/6 rounded-lg"/>
                      </>
                    ) : (
                      <>
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          <QrCode className="h-5 w-5 text-muted-foreground/50"/>
                        </div>
                        <span className="text-sm text-muted-foreground">等待后台返回截图</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Log output */}
              <div className="mt-4 rounded-xl bg-zinc-950 p-3 text-xs text-zinc-100 min-h-32 max-h-52 overflow-y-auto shadow-inner scrollbar-thin">
                {progressText ? (
                  <pre className="whitespace-pre-wrap break-words leading-relaxed">{filterProgressText(progressText)}</pre>
                ) : (
                  <span className="text-zinc-500">等待绑定日志...</span>
                )}
              </div>

              {profile?.latestBindingSession?.status && (
                <p className="mt-3 text-xs text-muted-foreground">
                  最近一次会话状态：{statusText(profile.latestBindingSession.status)}
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="gap-1 text-[10px]">
              {platformMeta?.name || '-'}
            </Badge>
            <Badge variant="outline" className="gap-1 text-[10px]">
              {METHOD_OPTIONS.find((item) => item.value === loginMethod)?.title || '手机号绑定'}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
            <Button
              className="gap-2 shadow-sm"
              onClick={handleStart}
              disabled={
                (sessionStatus === 'running' || pending)
                || !profileId
                || (loginMethod === 'phone' && !phone.trim())
                || (loginMethod === 'password' && (!loginName.trim() || !password.trim()))
              }
            >
              {(pending || sessionStatus === 'running')
                ? <><Loader2 className="h-4 w-4 animate-spin"/>执行中...</>
                : sessionStatus === 'completed'
                  ? <><RefreshCw className="h-4 w-4"/>重新绑定</>
                  : sessionStatus === 'failed'
                    ? <><RefreshCw className="h-4 w-4"/>重试绑定</>
                    : sessionStatus?.startsWith('awaiting_')
                      ? <><RefreshCw className="h-4 w-4"/>重新开始</>
                      : <><Zap className="h-4 w-4"/>开始绑定</>
              }
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
