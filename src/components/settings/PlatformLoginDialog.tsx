import React, {useState, useCallback} from 'react'
import {Loader2, CheckCircle2, XCircle, Bot} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {Button} from '@/components/ui/button'
import {useOpenClaw} from '@/contexts/OpenClawContext'
import {useSettingsStore} from '@/stores/useSettingsStore'
import {useI18n} from '@/contexts/I18nContext'
import {PLATFORMS} from '@/lib/constants'

interface PlatformLoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profileId: string | null
}

type LoginPhase = 'idle' | 'starting' | 'waiting' | 'success' | 'failed'

export default function PlatformLoginDialog({open, onOpenChange, profileId}: PlatformLoginDialogProps) {
  const {t} = useI18n()
  const {isReady, startTask} = useOpenClaw()
  const {platformProfiles, updateProfile} = useSettingsStore()

  const [phase, setPhase] = useState<LoginPhase>('idle')
  const [error, setError] = useState('')
  const [responseText, setResponseText] = useState('')

  const profile = platformProfiles.find((p) => p.id === profileId)
  const platformName = profile ? PLATFORMS[profile.platform as keyof typeof PLATFORMS]?.name || profile.platform : ''

  const handleStartLogin = useCallback(async () => {
    if (!profile || !isReady) return

    setPhase('starting')
    setError('')
    setResponseText('')

    try {
      const sessionId = crypto.randomUUID()
      const taskId = `login-${profile.id}-${Date.now()}`

      // 委托给 HR_Juzi agent 处理平台登录
      await startTask(
        `请帮我登录${platformName}平台（${profile.platform}）。账号名称：${profile.name}。请完成登录并确认登录状态。`,
        sessionId,
        taskId,
      )

      setPhase('success')
      updateProfile(profile.id, {
        status: 'active',
        lastLogin: new Date().toISOString(),
        lastVerified: new Date().toISOString(),
      })
    } catch (err) {
      setPhase('failed')
      setError(err instanceof Error ? err.message : '登录失败')
    }
  }, [profile, isReady, startTask, platformName, updateProfile])

  const handleClose = () => {
    setPhase('idle')
    setError('')
    setResponseText('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('settings.profiles.login.title')}</DialogTitle>
          <DialogDescription>
            {platformName} - {profile?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="rounded-lg border bg-muted/50 p-6 flex flex-col items-center gap-3 text-muted-foreground">
            <Bot className="h-10 w-10"/>
            <p className="text-sm text-center">
              {phase === 'idle' && '点击"开始登录"后，HR_Juzi agent 将自动完成平台登录'}
              {phase === 'starting' && '正在请求 HR_Juzi agent 登录...'}
              {phase === 'waiting' && 'HR_Juzi 正在处理登录...'}
              {phase === 'success' && '登录请求已发送给 HR_Juzi'}
              {phase === 'failed' && (error || '登录失败')}
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm">
            {phase === 'starting' && (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-blue-500"/>
                <span className="text-blue-600">正在请求 agent...</span>
              </>
            )}
            {phase === 'success' && (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500"/>
                <span className="text-green-600">登录请求已提交</span>
              </>
            )}
            {phase === 'failed' && (
              <>
                <XCircle className="h-4 w-4 text-red-500"/>
                <span className="text-red-600">{error || '登录失败'}</span>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          {phase === 'idle' || phase === 'failed' ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleStartLogin} disabled={!isReady}>
                {t('settings.profiles.login.start')}
              </Button>
            </>
          ) : phase === 'success' ? (
            <Button onClick={handleClose}>
              {t('common.confirm')}
            </Button>
          ) : (
            <Button variant="outline" onClick={handleClose}>
              {t('settings.profiles.login.cancel')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
