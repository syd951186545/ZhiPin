import React, {useEffect, useMemo, useState} from 'react'
import {AlertTriangle, CheckCircle2, Loader2, QrCode, ShieldCheck, Smartphone} from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Badge} from '@/components/ui/badge'
import {usePlatformAccounts} from '@/hooks/usePlatformAccounts'
import {PLATFORMS} from '@/lib/constants'
import type {PlatformBindingSessionStatus, PlatformLoginMethod} from '@/types/openclaw'
import {subscribePlatformBindingSession} from '@/services/platformAccountService'

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
}> = [
  {value: 'phone', title: '手机号绑定', desc: '输入手机号后等待验证码，优先推荐。', icon: Smartphone},
  {value: 'qr', title: '扫码绑定', desc: '后台返回二维码截图，适合企业端常见扫码登录。', icon: QrCode},
  {value: 'password', title: '账号密码', desc: '可能触发二次验证，仅作为兜底方案。', icon: ShieldCheck},
]

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

  const canSubmitVerification = sessionStatus === 'awaiting_sms' || sessionStatus === 'awaiting_password_2fa'
  const latestBindingSession = profile?.latestBindingSession || null

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
    const unsubscribe = subscribePlatformBindingSession(sessionId, {
      onProgress: (data) => {
        const text = String(data.accumulated_text || '')
        setProgressText(text)
        const screenshot = String(data.latest_screenshot || '') || null
        if (screenshot) setLatestScreenshot(screenshot)
      },
      onState: (data) => {
        const status = String(data.status || '') as PlatformBindingSessionStatus
        setSessionStatus(status)
        setSessionReason(String(data.reason || ''))
        const screenshot = String(data.latest_screenshot || '') || null
        if (screenshot) setLatestScreenshot(screenshot)
        if (status !== 'running') setPending(false)
      },
      onComplete: async (data) => {
        setSessionStatus('completed')
        setSessionReason(String(data.reason || '绑定完成'))
        const screenshot = String(data.latest_screenshot || '') || null
        if (screenshot) setLatestScreenshot(screenshot)
        setPending(false)
        await load()
        await onDataChanged?.()
      },
      onError: async (data) => {
        const message = String(data.reason || data.message || '绑定失败')
        setSessionStatus('failed')
        setSessionReason(message)
        setLiveError(message)
        const screenshot = String(data.latest_screenshot || '') || null
        if (screenshot) setLatestScreenshot(screenshot)
        setPending(false)
        await load()
        await onDataChanged?.()
      },
    })

    refreshSession(sessionId).catch(() => {})
    return unsubscribe
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
          <DialogTitle>绑定平台账号</DialogTitle>
          <DialogDescription>
            {platformMeta?.name || profile?.platform} · {profile?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-2 lg:grid-cols-[1.1fr,1fr]">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {METHOD_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`rounded-xl border p-3 text-left transition-colors ${loginMethod === item.value ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
                  onClick={() => setLoginMethod(item.value)}
                  disabled={pending}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <item.icon className="h-4 w-4"/>
                    <span className="text-sm font-medium">{item.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-5">{item.desc}</p>
                </button>
              ))}
            </div>

            <div className="rounded-xl border p-4 space-y-4 bg-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{activeMethod.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{activeMethod.desc}</p>
                </div>
                <Badge variant={sessionStatus === 'completed' ? 'default' : sessionStatus === 'failed' ? 'destructive' : 'secondary'}>
                  {statusText(sessionStatus)}
                </Badge>
              </div>

              {(loginMethod === 'phone' || loginMethod === 'password') && (
                <div className="space-y-2">
                  <Label>{loginMethod === 'phone' ? '手机号' : '账号名'}</Label>
                  <Input
                    value={loginMethod === 'phone' ? phone : loginName}
                    onChange={(e) => loginMethod === 'phone' ? setPhone(e.target.value) : setLoginName(e.target.value)}
                    placeholder={loginMethod === 'phone' ? '请输入绑定手机号' : '请输入账号名'}
                    disabled={pending}
                  />
                </div>
              )}

              {loginMethod === 'password' && (
                <div className="space-y-2">
                  <Label>密码</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请输入账号密码"
                    disabled={pending}
                  />
                </div>
              )}

              {canSubmitVerification && (
                <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                  {sessionStatus === 'awaiting_sms' && (
                    <div className="space-y-2">
                      <Label>短信验证码</Label>
                      <Input
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        placeholder="输入收到的验证码"
                        disabled={pending}
                      />
                    </div>
                  )}
                  {sessionStatus === 'awaiting_password_2fa' && (
                    <>
                      <div className="space-y-2">
                        <Label>二次验证码</Label>
                        <Input
                          value={secondaryCode}
                          onChange={(e) => setSecondaryCode(e.target.value)}
                          placeholder="若平台要求，请输入二次验证码"
                          disabled={pending}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>二次验证密码</Label>
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
                  <Button onClick={handleSubmitVerification} disabled={pending || (sessionStatus === 'awaiting_sms' && !verificationCode.trim())}>
                    {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                    继续提交
                  </Button>
                </div>
              )}

              {sessionReason && (
                <div className={`rounded-lg border p-3 text-sm ${sessionStatus === 'failed' ? 'border-red-200 bg-red-50 text-red-700' : 'border-border bg-muted/40 text-foreground'}`}>
                  {sessionReason}
                </div>
              )}

              {liveError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5"/>
                  <span>{liveError}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">后台执行面板</p>
                  <p className="text-xs text-muted-foreground mt-1">显示二维码截图、进度文本和当前等待态。</p>
                </div>
                {sessionStatus === 'completed' && <CheckCircle2 className="h-5 w-5 text-emerald-500"/>}
              </div>

              <div className="mt-4 rounded-lg border bg-muted/20 overflow-hidden">
                {latestScreenshot ? (
                  <img src={latestScreenshot} alt="当前页面截图" className="h-56 w-full object-cover object-top"/>
                ) : (
                  <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                    等待后台返回截图
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-lg bg-zinc-950 p-3 text-xs text-zinc-100 min-h-40 max-h-64 overflow-y-auto">
                {progressText ? (
                  <pre className="whitespace-pre-wrap break-words">{progressText}</pre>
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

        <DialogFooter className="justify-between">
          <div className="text-xs text-muted-foreground">
            当前平台：{platformMeta?.name || '-'}，推荐方式：{platformMeta ? METHOD_OPTIONS.find((item) => item.value === (profile?.loginMethod || 'phone'))?.title || '手机号绑定' : '-'}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
            <Button
              onClick={handleStart}
              disabled={pending || !profileId || (loginMethod === 'phone' && !phone.trim()) || (loginMethod === 'password' && (!loginName.trim() || !password.trim()))}
            >
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
              开始绑定
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
