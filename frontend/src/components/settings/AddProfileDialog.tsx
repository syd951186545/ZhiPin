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
import {useSettingsStore} from '@/stores/useSettingsStore'
import {useI18n} from '@/contexts/I18nContext'
import type {PlatformKey, PlatformProfile} from '@/types/openclaw'
import {PLATFORMS} from '@/lib/constants'

interface AddProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function AddProfileDialog({ open, onOpenChange }: AddProfileDialogProps) {
  const { t } = useI18n()
  const addProfile = useSettingsStore((s) => s.addProfile)

  const [platform, setPlatform] = useState<PlatformKey | ''>('')
  const [name, setName] = useState('')

  const handleSubmit = () => {
    if (!platform || !name.trim()) return

    const profile: PlatformProfile = {
      id: crypto.randomUUID(),
      name: name.trim(),
      platform: platform as PlatformKey,
      status: 'needsLogin',
      lastLogin: undefined,
      lastVerified: undefined,
    }

    addProfile(profile)
    setPlatform('')
    setName('')
    onOpenChange(false)
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
              placeholder={t('settings.profiles.add.namePlaceholder')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!platform || !name.trim()}>
            {t('settings.profiles.add.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
