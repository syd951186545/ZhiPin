import React, {useState} from 'react'
import {AlertTriangle, ExternalLink, Loader2, Smartphone, UserPlus} from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Badge} from '@/components/ui/badge'
import {useI18n} from '@/contexts/I18nContext'
import {usePlatformAccounts} from '@/hooks/usePlatformAccounts'
import type {PlatformKey} from '@/types/openclaw'
import {PLATFORMS} from '@/lib/constants'
import {cn} from '@/lib/utils'

interface AddProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => Promise<void> | void
}

const PLATFORM_COLORS: Record<string, string> = {
  '58': 'bg-orange-500',
  boss_zhipin: 'bg-cyan-500',
  liepin: 'bg-red-500',
  zhilian: 'bg-blue-600',
  '51job': 'bg-indigo-500',
  lagou: 'bg-emerald-500',
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
  setPlatform: (v: PlatformKey | '') => void,
  setName: (v: string) => void,
  setAccountName: (v: string) => void,
  setError: (v: string | null) => void,
) {
  setPlatform('')
  setName('')
  setAccountName('')
  setError(null)
}

export default function AddProfileDialog({open, onOpenChange, onCreated}: AddProfileDialogProps) {
  const {t} = useI18n()
  const {createAccount} = usePlatformAccounts()

  const [platform, setPlatform] = useState<PlatformKey | ''>('')
  const [name, setName] = useState('')
  const [accountName, setAccountName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedPlatform = platform ? PLATFORMS[platform] : null

  // 关闭时重置表单（BUG-06）
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !saving) {
      resetForm(setPlatform, setName, setAccountName, setError)
    }
    onOpenChange(nextOpen)
  }

  const handleSubmit = async () => {
    if (!platform || !name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createAccount({
        platform,
        name: name.trim(),
        account_name: accountName.trim() || undefined,
        platform_url: PLATFORMS[platform]?.loginUrl,
      })
      resetForm(setPlatform, setName, setAccountName, setError)
      await onCreated?.()
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
          <DialogDescription>
            {t('settings.profiles.desc')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-xs">{t('settings.profiles.add.platform')}</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as PlatformKey)}>
              <SelectTrigger data-testid="add-account-platform-select">
                <SelectValue placeholder={t('settings.profiles.add.platform')}/>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PLATFORMS).map(([key, {name: pName}]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      <span className={cn('inline-block h-2.5 w-2.5 rounded-full', PLATFORM_COLORS[key] || 'bg-zinc-400')}/>
                      {pName}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Platform preview card */}
          {selectedPlatform && platform && (
            <div className="rounded-xl border bg-gradient-to-br from-muted/30 to-muted/10 p-4" data-testid="add-account-platform-preview">
              <div className="flex items-center gap-3">
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm', PLATFORM_COLORS[platform] || 'bg-zinc-500')}>
                  {selectedPlatform.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{selectedPlatform.name}</p>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-50"/>
                    <span className="truncate">{selectedPlatform.loginUrl}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Smartphone className="h-2.5 w-2.5"/>
                  {LOGIN_METHODS[platform] || '手机号登录'}
                </Badge>
                <span className="text-[10px] text-muted-foreground">推荐登录方式</span>
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
            <p className="text-[11px] text-muted-foreground">用于在列表中区分不同账号的显示名称</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">登录名（可选）</Label>
            <Input
              data-testid="add-account-login-name"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="手机号或账号名"
            />
            <p className="text-[11px] text-muted-foreground">预填登录时使用的手机号或账号名，可后续在绑定时修改</p>
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
          <Button className="gap-2 shadow-sm" onClick={handleSubmit} disabled={!platform || !name.trim() || saving} data-testid="add-account-submit">
            {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <UserPlus className="h-4 w-4"/>}
            {saving ? '保存中...' : t('settings.profiles.add.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
