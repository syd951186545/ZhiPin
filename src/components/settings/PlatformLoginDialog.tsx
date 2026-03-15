import React, { useState, useEffect, useCallback } from 'react'
import { Loader2, CheckCircle2, XCircle, Monitor } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useWebSocket } from '@/contexts/WebSocketContext'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useI18n } from '@/contexts/I18nContext'
import { PLATFORMS } from '@/lib/constants'
import type { PlatformLoginStatusPayload, BrowserScreenshotPayload } from '@/types/openclaw'

interface PlatformLoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profileId: string | null
}

type LoginPhase = 'idle' | 'starting' | 'waiting' | 'success' | 'failed'

export default function PlatformLoginDialog({ open, onOpenChange, profileId }: PlatformLoginDialogProps) {
  const { t } = useI18n()
  const { isConnected, service } = useWebSocket()
  const { platformProfiles, updateProfile } = useSettingsStore()

  const [phase, setPhase] = useState<LoginPhase>('idle')
  const [error, setError] = useState('')
  const [screenshot, setScreenshot] = useState<string | null>(null)

  const profile = platformProfiles.find((p) => p.id === profileId)
  const platformName = profile ? PLATFORMS[profile.platform as keyof typeof PLATFORMS]?.name || profile.platform : ''

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setPhase('idle')
      setError('')
      setScreenshot(null)
    }
  }, [open])

  // Listen for login status events
  useEffect(() => {
    if (!open || !profileId) return

    const unsubLogin = service.onLoginStatus((data: PlatformLoginStatusPayload) => {
      if (data.platform === profile?.platform) {
        if (data.success) {
          setPhase('success')
          updateProfile(profileId, {
            status: 'active',
            cookies: data.cookies,
            lastLogin: new Date().toISOString(),
            lastVerified: new Date().toISOString(),
            accountName: data.account_name,
          })
        } else {
          setPhase('failed')
          setError(data.error || t('settings.profiles.login.failed'))
        }
      }
    })

    const unsubScreenshot = service.onScreenshot((data: BrowserScreenshotPayload) => {
      if (data.profile_id === profileId) {
        setScreenshot(data.image_base64)
      }
    })

    return () => {
      unsubLogin()
      unsubScreenshot()
    }
  }, [open, profileId, profile?.platform, service, updateProfile, t])

  const handleStartLogin = useCallback(async () => {
    if (!profile || !isConnected) return

    setPhase('starting')
    setError('')

    try {
      await service.startManualLogin(profile.platform, profile.id)
      setPhase('waiting')
      updateProfile(profile.id, { status: 'verifying' })
    } catch (err) {
      setPhase('failed')
      setError(err instanceof Error ? err.message : '启动登录失败')
    }
  }, [profile, isConnected, service, updateProfile])

  const handleClose = () => {
    if (phase === 'waiting') {
      // Cancel the login if in progress
      updateProfile(profileId!, { status: 'needsLogin' })
    }
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
          {/* Screenshot preview area */}
          <div className="rounded-lg border bg-muted/50 aspect-video flex items-center justify-center overflow-hidden">
            {screenshot ? (
              <img
                src={`data:image/png;base64,${screenshot}`}
                alt="Browser screenshot"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Monitor className="h-10 w-10" />
                <p className="text-sm">
                  {phase === 'idle' && '点击"开始登录"后，浏览器截图将显示在这里'}
                  {phase === 'starting' && '正在启动浏览器...'}
                  {phase === 'waiting' && t('settings.profiles.login.desc')}
                  {phase === 'success' && t('settings.profiles.login.success')}
                  {phase === 'failed' && (error || t('settings.profiles.login.failed'))}
                </p>
              </div>
            )}
          </div>

          {/* Status indicator */}
          <div className="flex items-center justify-center gap-2 text-sm">
            {phase === 'starting' && (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                <span className="text-blue-600">正在启动浏览器...</span>
              </>
            )}
            {phase === 'waiting' && (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
                <span className="text-yellow-600">{t('settings.profiles.login.waiting')}</span>
              </>
            )}
            {phase === 'success' && (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-green-600">{t('settings.profiles.login.success')}</span>
              </>
            )}
            {phase === 'failed' && (
              <>
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-red-600">{error || t('settings.profiles.login.failed')}</span>
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
              <Button onClick={handleStartLogin} disabled={!isConnected}>
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
