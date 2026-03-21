import React, {useState} from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from '@/components/ui/select'
import {useI18n} from '@/contexts/I18nContext'
import {usePlatformAccounts} from '@/hooks/usePlatformAccounts'
import type {PlatformKey} from '@/types/openclaw'
import {PLATFORMS} from '@/lib/constants'

interface AddProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => Promise<void> | void
}

export default function AddProfileDialog({ open, onOpenChange, onCreated }: AddProfileDialogProps) {
  const { t } = useI18n()
  const {createAccount} = usePlatformAccounts()

  const [platform, setPlatform] = useState<PlatformKey | ''>('')
  const [name, setName] = useState('')
  const [accountName, setAccountName] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!platform || !name.trim()) return
    setSaving(true)
    try {
      await createAccount({
        platform,
        name: name.trim(),
        account_name: accountName.trim() || undefined,
        platform_url: PLATFORMS[platform]?.loginUrl,
      })
      setPlatform('')
      setName('')
      setAccountName('')
      await onCreated?.()
      onOpenChange(false)
    } catch (e) {
      console.error('添加账号失败:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('settings.profiles.add.title')}</DialogTitle>
          <DialogDescription>
            {t('settings.profiles.desc')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t('settings.profiles.add.platform')}</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as PlatformKey)}>
              <SelectTrigger>
                <SelectValue placeholder={t('settings.profiles.add.platform')} />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PLATFORMS).map(([key, { name: pName }]) => (
                  <SelectItem key={key} value={key}>{pName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('settings.profiles.add.name')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：华东招聘账号"
            />
          </div>
          <div className="space-y-2">
            <Label>登录名（可选）</Label>
            <Input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="手机号或账号名"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!platform || !name.trim() || saving}>
            {saving ? '保存中...' : t('settings.profiles.add.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
