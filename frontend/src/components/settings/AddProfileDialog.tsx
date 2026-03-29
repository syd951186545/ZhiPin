import React, {useEffect, useState} from 'react'
import {AlertTriangle, ExternalLink, Loader2, Smartphone, UserPlus} from 'lucide-react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Badge} from '@/components/ui/badge'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {useI18n} from '@/contexts/I18nContext'
import {usePlatformAccounts} from '@/hooks/usePlatformAccounts'
import type {PlatformKey} from '@/types/openclaw'
import {PLATFORMS} from '@/lib/constants'
import {cn} from '@/lib/utils'
import type {PlatformAccountApiRow} from '@/services/platformAccountService'

interface AddProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultPlatform: PlatformKey
  onCreated?: (createdAccount?: PlatformAccountApiRow) => Promise<void> | void
}

const PLATFORM_COLORS: Record<string, string> = {
  '58': 'bg-orange-500',
  boss_zhipin: 'bg-cyan-500',
  liepin: 'bg-red-500',
  zhilian: 'bg-blue-600',
  '51job': 'bg-indigo-500',
  lagou: 'bg-emerald-500',
}

const AVATAR_TEXT: Record<string, string> = {
  '58': '58',
}

const LOGIN_METHODS: Record<string, string> = {
  '58': '手机号登录',
  boss_zhipin: '手机号登录',
  liepin: '扫码登录',
  zhilian: '手机号登录',
  '51job': '账号密码登录',
  lagou: '手机号登录',
}

function resetForm(
  setName: (v: string) => void,
  setError: (v: string | null) => void,
) {
  setName('')
  setError(null)
}

export default function AddProfileDialog({open, onOpenChange, defaultPlatform, onCreated}: AddProfileDialogProps) {
  const {t} = useI18n()
  const {createAccount} = usePlatformAccounts()

  const [platform, setPlatform] = useState<PlatformKey>(defaultPlatform)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedPlatform = PLATFORMS[platform]

  // 每次对话框打开时同步父页面当前选中平台
  useEffect(() => {
    if (open) setPlatform(defaultPlatform)
  }, [open, defaultPlatform])

  // 关闭时重置表单（BUG-06）
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !saving) {
      resetForm(setName, setError)
    }
    onOpenChange(nextOpen)
  }

  const handleSubmit = async () => {
    if (!platform || !name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const created = await createAccount({
        platform,
        name: name.trim(),
        platform_url: selectedPlatform?.loginUrl,
      })
      resetForm(setName, setError)
      await onCreated?.(created)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加账号失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="add-account-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <UserPlus className="h-4 w-4 text-primary"/>
            </div>
            {t('settings.profiles.add.title')}
          </DialogTitle>
        </DialogHeader>
        <div className="min-w-0 space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-xs">{t('settings.profiles.add.platform')}</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as PlatformKey)} disabled={saving} data-testid="add-account-platform-select">
              <SelectTrigger className="h-10">
                <SelectValue placeholder="选择平台"/>
              </SelectTrigger>
              <SelectContent className="w-[var(--radix-select-trigger-width)]">
                {(Object.keys(PLATFORMS) as PlatformKey[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      <span className={cn('inline-block h-2.5 w-2.5 rounded-full', PLATFORM_COLORS[key] || 'bg-zinc-400')}/>
                      {PLATFORMS[key].name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Platform preview card */}
          {selectedPlatform && (
            <div
              className="min-w-0 overflow-hidden rounded-xl border bg-gradient-to-br from-muted/30 to-muted/10 p-4"
              data-testid="add-account-platform-preview"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm', PLATFORM_COLORS[platform] || 'bg-zinc-500')}>
                  {AVATAR_TEXT[platform] ?? selectedPlatform.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{selectedPlatform.name}</p>
                  <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-50"/>
                    <span className="block min-w-0 truncate" title={selectedPlatform.loginUrl}>
                      {selectedPlatform.loginUrl}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Smartphone className="h-2.5 w-2.5"/>
                  {LOGIN_METHODS[platform] || '手机号登录'}
                </Badge>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">{t('settings.profiles.add.name')}</Label>
            <Input
              data-testid="add-account-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：华东招聘账号"
            />
          </div>
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/20 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>
            <span>{error}</span>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button className="gap-2 shadow-sm" onClick={handleSubmit} disabled={!name.trim() || saving} data-testid="add-account-submit">
            {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <UserPlus className="h-4 w-4"/>}
            {saving ? '保存中...' : t('settings.profiles.add.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
